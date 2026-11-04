import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "@/lib/ai/client";
import { easyAllowed, VARIANT_TYPES, variantParents } from "@/lib/ai/families";
import {
  type Candidate,
  type Generated,
  type Validation,
  generatorModelFor,
  generatorRequest,
  generatorTail,
  judge,
  parseGenerated,
  parseValidation,
  planCandidates,
  preferChart,
  rejectionText,
  repetitionFor,
  reviewGenerated,
  revisionFeedback,
  storeTask,
  validatorRequest,
} from "@/lib/ai/generate";
import { getLessons, refreshLessons } from "@/lib/ai/lessons";
import { logAiCall } from "@/lib/ai/usage";
import { type Focus, type PoolEntry, poolFocuses } from "@/lib/ai/variety";
import { taskTypeMeta } from "@/lib/content/exams";
import type { ExamId, Group, TaskType } from "@/lib/content/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { type AutogenState, CREDIT_RETRY_MS, isFatalApiError, pickType, updateAutogenState } from "./autogen";

// Background generation through the Message Batches API – the same prompts, models and checks as the synchronous path,
// at half the price. Every candidate is a gen_jobs row that moves generate → validate (→ generate again with the
// validator's feedback → validate); each step is one request in a batch. The cron tick (every minute) collects finished
// batches, moves their jobs on, plans new candidates when the pool needs them and submits everything waiting as one
// batch. Nothing has to stay alive between ticks: a job only remembers which batch its current request is in.

/** Candidates in flight per worker slot of the dashboard setting. */
export const JOBS_PER_WORKER = 8;
/** Candidates of one type planned together – they share the cached prompt prefix. */
export const PER_TYPE = 4;
/** Variant slots in one planned group of a variant type (the rest are fresh tasks). */
const VARIANTS_PER_GROUP = 1;
const MAX_REQUESTS = 100;
/** A request whose batch failed this many times is given up. */
const MAX_RETRIES = 3;
const KEEP_FINISHED_MS = 3 * 86_400_000;
/** Batches expire after 24 h – a job still waiting after this long is resubmitted. */
const STALE_MS = 26 * 3600_000;

interface EasyVersion {
  gen: Generated;
  group: Group;
  validation: Validation;
  focus: Focus;
  attempt: number;
  model: string;
}

interface JobState {
  candidate: Candidate;
  /** per-candidate part of the generator prompt, fixed when the job was planned */
  tail: string;
  /** attempt 1: the rejected answer and the feedback that go after the first prompt */
  previous?: string;
  feedback?: string;
  /** waiting for the validator */
  gen?: Generated;
  group?: Group;
  focus?: Focus;
  model?: string;
  /** a correct but easier version, kept in case no attempt passes */
  easy?: EasyVersion;
  retries?: number;
}

interface JobRow {
  id: string;
  exam: ExamId;
  task_type: TaskType;
  kind: "fresh" | "variant";
  parent_id: string | null;
  user_id: string | null;
  stage: "generate" | "validate" | "done" | "failed";
  attempt: number;
  batch_id: string | null;
  state: JobState;
  note: string | null;
  created_at: string;
}

const OPEN = ["generate", "validate"];
const now = () => new Date().toISOString();

/** custom_id allows [a-zA-Z0-9_-] only: job uuid without dashes + stage letter + attempt. */
const customId = (j: JobRow) => `${j.id.replace(/-/g, "")}_${j.stage[0]}${j.attempt}`;
const jobIdOf = (customIdValue: string) => {
  const h = customIdValue.split("_")[0];
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
};

async function updateJob(id: string, patch: Partial<Omit<JobRow, "id">>) {
  const { error } = await createAdminClient()
    .from("gen_jobs")
    .update({ ...patch, updated_at: now() })
    .eq("id", id);
  if (error) console.error("gen_jobs update", id, error.message);
}

/** Is the gen_jobs table there (migration 0015)? */
export async function batchReady() {
  const { error } = await createAdminClient().from("gen_jobs").select("id", { count: "exact", head: true });
  return !error;
}

/** Are there jobs still in flight (e.g. after switching back to synchronous mode, or users' buffer top-ups)? */
export async function hasOpenJobs() {
  const { count, error } = await createAdminClient().from("gen_jobs").select("id", { count: "exact", head: true }).in("stage", OPEN);
  return !error && (count ?? 0) > 0;
}

/**
 * Runs one batch tick under the batch lock (one tick at a time, independent of the synchronous worker slots).
 * `plan` = also plan new candidates (batch mode with generation switched on). Returns false when another tick has it.
 */
export async function runBatchTickLocked(state: AutogenState, plan: boolean) {
  const admin = createAdminClient();
  const { data: got } = await admin.rpc("batch_claim", { p_seconds: 300 });
  if (got !== true) return false;
  try {
    await runBatchTick({ ...state, enabled: plan });
  } catch (e) {
    await updateAutogenState({ last_error: (e instanceof Error ? e.message : String(e)).slice(0, 500) });
  } finally {
    await admin.rpc("batch_release");
  }
  return true;
}

/** Counts of open jobs and batches – for the dashboard. */
export async function batchStatus() {
  const { data, error } = await createAdminClient().from("gen_jobs").select("stage,batch_id,kind").in("stage", OPEN);
  if (error) return null;
  const rows = (data ?? []) as { stage: string; batch_id: string | null; kind: string }[];
  return {
    generating: rows.filter((r) => r.stage === "generate").length,
    validating: rows.filter((r) => r.stage === "validate").length,
    variants: rows.filter((r) => r.kind === "variant").length,
    waiting: rows.filter((r) => !r.batch_id).length,
    batches: new Set(rows.map((r) => r.batch_id).filter(Boolean)).size,
  };
}

// ------------------------------------------------------------------ planning

/** Plans `count` candidates of a type as gen_jobs rows (the next tick submits them). */
export async function enqueueJobs(o: { exam: ExamId; type: TaskType; count: number; userId?: string | null; variants?: number; inFlightParents?: Map<string, number> }) {
  const [pool, lessons, chartFirst] = await Promise.all([
    poolFocuses(o.exam, o.type),
    getLessons(o.type).catch(() => null),
    o.type === "data" ? preferChart(o.exam) : false,
  ]);
  const parents = o.variants ? await variantParents(o.exam, o.type, o.variants, o.inFlightParents) : [];
  // a later group planned in the same tick must see these parents as taken
  for (const p of parents) o.inFlightParents?.set(p.id, (o.inFlightParents.get(p.id) ?? 0) + 1);
  const focuses = pool.map((p) => p.focus);
  const candidates = await planCandidates({
    exam: o.exam,
    type: o.type,
    count: o.count,
    parents,
    pool: focuses,
    chartFirst,
    // the word proposals are a tiny synchronous call
    log: (e) => logAiCall({ userId: o.userId, kind: e.kind, model: e.model, usage: e.usage, ok: e.ok, type: o.type, stage: e.stage }),
  });
  const rows = candidates.map((c) => ({
    exam: o.exam,
    task_type: o.type,
    kind: c.kind,
    parent_id: c.parent?.id ?? null,
    user_id: o.userId ?? null,
    stage: "generate",
    attempt: 0,
    state: { candidate: c, tail: generatorTail(c, { lessons, pool: focuses }) } satisfies JobState,
  }));
  const { error } = await createAdminClient().from("gen_jobs").insert(rows);
  if (error) throw new Error(`gen_jobs insert: ${error.message}`);
  return rows.length;
}

/** Keeps workers × JOBS_PER_WORKER candidates in flight, always for the types the pool has fewest of. */
async function plan(state: AutogenState) {
  const { data } = await createAdminClient().from("gen_jobs").select("task_type,kind,parent_id").in("stage", OPEN);
  const open = (data ?? []) as { task_type: string; kind: string; parent_id: string | null }[];
  let capacity = state.workers * JOBS_PER_WORKER - open.length;
  const inFlight = new Map<string, number>();
  const parents = new Map<string, number>();
  for (const j of open) {
    inFlight.set(j.task_type, (inFlight.get(j.task_type) ?? 0) + 1);
    if (j.parent_id) parents.set(j.parent_id, (parents.get(j.parent_id) ?? 0) + 1);
  }
  let planned = 0;
  while (capacity >= PER_TYPE) {
    const type = await pickType(inFlight);
    const exam = taskTypeMeta(type)?.exam ?? "osp";
    planned += await enqueueJobs({ exam, type, count: PER_TYPE, variants: VARIANT_TYPES.includes(type) ? VARIANTS_PER_GROUP : 0, inFlightParents: parents });
    inFlight.set(type, (inFlight.get(type) ?? 0) + PER_TYPE);
    capacity -= PER_TYPE;
  }
  return planned;
}

// ------------------------------------------------------------------ submitting

function requestFor(j: JobRow): Anthropic.MessageCreateParamsNonStreaming {
  const s = j.state;
  if (j.stage === "validate") return validatorRequest(s.group!, j.task_type, s.candidate.deck);
  return generatorRequest(s.candidate, s.tail, { attempt: j.attempt, previous: s.previous, feedback: s.feedback, batch: true }).params;
}

/** Sends every job without a request in flight as one batch. */
async function submit() {
  const admin = createAdminClient();
  const { data } = await admin.from("gen_jobs").select("*").in("stage", OPEN).is("batch_id", null).limit(MAX_REQUESTS);
  const jobs = (data ?? []) as JobRow[];
  if (!jobs.length) return 0;
  let batch: Anthropic.Messages.MessageBatch;
  try {
    batch = await anthropic().messages.batches.create({ requests: jobs.map((j) => ({ custom_id: customId(j), params: requestFor(j) })) });
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    await updateAutogenState({ last_error: `batch: ${reason}`.slice(0, 500), ...(isFatalApiError(reason) ? { credits_exhausted_at: now() } : {}) });
    return 0;
  }
  const { error } = await admin
    .from("gen_jobs")
    .update({ batch_id: batch.id, updated_at: now() })
    .in(
      "id",
      jobs.map((j) => j.id),
    );
  if (error) console.error("gen_jobs submit", error.message);
  return jobs.length;
}

// ------------------------------------------------------------------ collecting

/** Per-tick memory: fresh pool fingerprints per type and tasks accepted during this tick. */
class TickContext {
  private pools = new Map<string, PoolEntry[]>();
  readonly rejectedTypes = new Set<TaskType>();
  async pool(exam: ExamId, type: TaskType) {
    if (!this.pools.has(type)) this.pools.set(type, await poolFocuses(exam, type));
    return this.pools.get(type)!;
  }
  add(type: TaskType, entry: PoolEntry) {
    this.pools.get(type)?.unshift(entry);
  }
}

/** Candidates of a type waiting for the validator – a new one must not take the same word or topic. */
async function inFlightSiblings(type: TaskType, except: string) {
  const { data } = await createAdminClient().from("gen_jobs").select("id,state").eq("task_type", type).eq("stage", "validate");
  return ((data ?? []) as { id: string; state: JobState }[]).filter((j) => j.id !== except && j.state.focus).map((j) => j.state.focus!);
}

async function finish(j: JobRow, ctx: TickContext, outcome: { id: string } | { reason: string }) {
  if ("id" in outcome) {
    await updateJob(j.id, { stage: "done", batch_id: null, note: `úloha ${outcome.id}` });
    return;
  }
  await updateJob(j.id, { stage: "failed", batch_id: null, note: outcome.reason.slice(0, 1000) });
  ctx.rejectedTypes.add(j.task_type);
}

/** Store an accepted (or easy) version and close the job. */
async function accept(j: JobRow, ctx: TickContext, t: EasyVersion, easy: boolean) {
  const id = await storeTask(j.state.candidate, { ...t, easy, userId: j.user_id, batch: true });
  ctx.add(j.task_type, { id, focus: t.focus, family: j.state.candidate.parent?.family ?? id });
  await finish(j, ctx, { id });
}

/** The current attempt failed: one revision with the feedback, or the end (with an easy version if there is one). */
async function reject(j: JobRow, ctx: TickContext, problem: string, o: { gen: Generated | null; validation: Validation | null }) {
  const reason = j.attempt ? `[po opravě] ${problem}` : problem;
  await logAiCall({ userId: j.user_id, kind: "reject", model: generatorModelFor(j.task_type), type: j.task_type, note: `${j.task_type}: ${reason}`.slice(0, 1000), batch: true });
  ctx.rejectedTypes.add(j.task_type);
  if (j.attempt === 0 && o.gen) {
    // the revision is a new generation: drop the rejected candidate, keep only the conversation and any easy version
    const state: JobState = { ...j.state, previous: JSON.stringify(o.gen), feedback: revisionFeedback(problem, o.validation, j.task_type), retries: 0 };
    delete state.gen;
    delete state.group;
    delete state.focus;
    await updateJob(j.id, { stage: "generate", attempt: 1, batch_id: null, state });
    return;
  }
  const easy = j.state.easy;
  if (easy) {
    const pool = await ctx.pool(j.exam, j.task_type);
    if (!repetitionFor(j.state.candidate, easy.focus, pool, []) && (await easyAllowed(j.exam, j.task_type))) return accept(j, ctx, easy, true);
  }
  await finish(j, ctx, { reason });
}

async function onGenerated(j: JobRow, ctx: TickContext, msg: Anthropic.Message) {
  const c = j.state.candidate;
  const gen = parseGenerated(msg);
  await logAiCall({
    userId: j.user_id,
    kind: "generate",
    model: msg.model,
    usage: msg.usage,
    ok: Boolean(gen),
    type: j.task_type,
    stage: c.kind === "variant" ? (j.attempt ? "variant-revise" : "variant") : j.attempt ? "revise" : "fresh",
    batch: true,
  });
  if (!gen) return reject(j, ctx, `generátor nevrátil platný JSON (${msg.stop_reason})`, { gen: null, validation: null });
  const [pool, siblings] = await Promise.all([ctx.pool(j.exam, j.task_type), inFlightSiblings(j.task_type, j.id)]);
  const reviewed = reviewGenerated(c, gen, pool, siblings);
  if (reviewed.problem) return reject(j, ctx, reviewed.problem, { gen, validation: null });
  await updateJob(j.id, {
    stage: "validate",
    batch_id: null,
    state: { ...j.state, gen, group: reviewed.group, focus: reviewed.focus, model: msg.model, retries: 0 },
  });
}

async function onValidated(j: JobRow, ctx: TickContext, msg: Anthropic.Message) {
  const s = j.state;
  const validation = parseValidation(msg);
  await logAiCall({ userId: j.user_id, kind: "validate", model: msg.model, usage: msg.usage, ok: Boolean(validation), type: j.task_type, stage: "validate", batch: true });
  if (!s.gen || !s.group || !s.focus) return finish(j, ctx, { reason: "chyba: chybí úloha k validaci" });
  if (!validation) return retry(j, ctx, `chyba: validátor nevrátil platný JSON (${msg.stop_reason})`);
  const version: EasyVersion = { gen: s.gen, group: s.group, validation, focus: s.focus, attempt: j.attempt, model: s.model ?? generatorModelFor(j.task_type) };
  const verdict = judge(s.group, validation);
  if (verdict.status === "easy") j = { ...j, state: { ...s, easy: version } };
  if (verdict.status !== "accept") return reject(j, ctx, `validátor: ${rejectionText(s.group, verdict, validation)}`, { gen: s.gen, validation });
  // another job may have stored the same word since this one was generated
  const problem = repetitionFor(s.candidate, s.focus, await ctx.pool(j.exam, j.task_type), []);
  if (problem) return reject(j, ctx, problem, { gen: s.gen, validation });
  await accept(j, ctx, version, false);
}

/** Send the same request again in the next batch (temporary failure), or give up. */
async function retry(j: JobRow, ctx: TickContext, reason: string) {
  const retries = (j.state.retries ?? 0) + 1;
  if (retries > MAX_RETRIES) return finish(j, ctx, { reason });
  await updateJob(j.id, { batch_id: null, state: { ...j.state, retries } });
}

async function onResult(j: JobRow, ctx: TickContext, r: Anthropic.Messages.MessageBatchIndividualResponse) {
  const res = r.result;
  if (res.type === "succeeded") return j.stage === "generate" ? onGenerated(j, ctx, res.message) : onValidated(j, ctx, res.message);
  if (res.type === "errored") {
    const reason = `${res.error.error.type}: ${res.error.error.message}`;
    if (res.error.error.type === "invalid_request_error") return finish(j, ctx, { reason: `chyba: ${reason}` });
    if (isFatalApiError(reason)) await updateAutogenState({ credits_exhausted_at: now(), last_error: reason.slice(0, 500) });
    return retry(j, ctx, `chyba: ${reason}`);
  }
  return retry(j, ctx, `chyba: požadavek v dávce ${res.type === "expired" ? "vypršel" : "zrušen"}`);
}

/** Moves the jobs of every finished batch on to their next step. */
async function collect(ctx: TickContext) {
  const admin = createAdminClient();
  const { data } = await admin.from("gen_jobs").select("*").in("stage", OPEN);
  const byBatch = new Map<string, JobRow[]>();
  for (const j of (data ?? []) as JobRow[]) if (j.batch_id) byBatch.set(j.batch_id, [...(byBatch.get(j.batch_id) ?? []), j]);
  let moved = 0;
  for (const [batchId, jobs] of byBatch) {
    let batch: Anthropic.Messages.MessageBatch;
    try {
      batch = await anthropic().messages.batches.retrieve(batchId);
    } catch (e) {
      console.error("batch retrieve", batchId, e);
      // unknown batch (e.g. another API key) – send its requests again
      if ((e as { status?: number }).status === 404) await Promise.all(jobs.map((j) => updateJob(j.id, { batch_id: null })));
      continue;
    }
    if (batch.processing_status !== "ended") {
      if (Date.now() - Date.parse(batch.created_at) > STALE_MS) await Promise.all(jobs.map((j) => retry(j, ctx, "chyba: dávka se nedokončila")));
      continue;
    }
    const byId = new Map(jobs.map((j) => [j.id, j]));
    const seen = new Set<string>();
    for await (const r of await anthropic().messages.batches.results(batchId)) {
      const j = byId.get(jobIdOf(r.custom_id));
      // a job resubmitted meanwhile belongs to a newer batch
      if (!j || seen.has(j.id) || customId(j) !== r.custom_id) continue;
      seen.add(j.id);
      try {
        await onResult(j, ctx, r);
        moved++;
      } catch (e) {
        console.error("batch result", j.id, e);
        await retry(j, ctx, `chyba: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    // jobs the results didn't mention go into the next batch again
    await Promise.all(jobs.filter((j) => !seen.has(j.id)).map((j) => updateJob(j.id, { batch_id: null })));
  }
  return moved;
}

async function cleanup() {
  await createAdminClient()
    .from("gen_jobs")
    .delete()
    .in("stage", ["done", "failed"])
    .lt("updated_at", new Date(Date.now() - KEEP_FINISHED_MS).toISOString());
}

/** One cron tick of batch mode: collect finished batches, plan new candidates (when enabled), submit. */
export async function runBatchTick(state: AutogenState) {
  const ctx = new TickContext();
  const collected = await collect(ctx);
  // distill new lessons from this tick's rejections, like the synchronous path does after each run
  await Promise.all([...ctx.rejectedTypes].map((t) => refreshLessons(t).catch((e) => console.error("refreshLessons", e))));
  const waitingForCredits = Boolean(state.credits_exhausted_at && Date.now() - Date.parse(state.credits_exhausted_at) < CREDIT_RETRY_MS);
  const planned = state.enabled && !waitingForCredits ? await plan(state).catch((e) => (console.error("batch plan", e), 0)) : 0;
  const submitted = waitingForCredits ? 0 : await submit();
  if (Math.random() < 0.05) await cleanup().catch((e) => console.error("gen_jobs cleanup", e));
  // the API took a batch again → credits are back
  if (submitted) await updateAutogenState({ last_error: null, credits_exhausted_at: null });
  return { collected, planned, submitted };
}

/** Open jobs a user's buffer top-up already queued for a type. */
export async function queuedFor(userId: string, type: TaskType) {
  const { count } = await createAdminClient()
    .from("gen_jobs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("task_type", type)
    .in("stage", OPEN);
  return count ?? 0;
}

// End-to-end simulation of AI task generation without spending a cent: a fake Anthropic API (local HTTP server)
// answers the real SDK calls, the in-memory demo database stands in for Supabase. It runs the Batch API pipeline over
// many cron ticks and the synchronous path, then checks what came out:
//   - every job finishes (nothing stuck between batches), batch calls are logged at half price
//   - the cached prompt prefix is byte-identical across candidates (the fake API counts cache hits like the real one)
//   - easy tasks stay ≤ 10 % of a type's pool, variants ≤ 25 %, families respect their size limit
//   - serving: another member of a family never comes before the spacing rule allows it, easy tasks are spaced out
//
//   npm run sim:batch
import http from "node:http";
import type { AddressInfo } from "node:net";

// ---------------------------------------------------------------- fake Anthropic API

type Json = Record<string, unknown>;
type Params = { model: string; system?: { text: string; cache_control?: Json }[]; messages: { role: string; content: unknown }[] };

let seed = 42;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
const est = (s: string) => Math.ceil(s.length / 2.6);
const text = (c: unknown): string =>
  typeof c === "string" ? c : Array.isArray(c) ? c.map((b) => (b as { text?: string }).text ?? "").join("\n") : "";

/** Prefix cache like the real one: a breakpoint's prefix is a hit when the exact same bytes were written before. */
const cache = new Set<string>();
const stats = { generatorCalls: 0, generatorHits: 0, validatorCalls: 0, validatorHits: 0 };

// what the fake generator produced, so the fake validator can "solve" it
const keys = new Map<string, string[][]>();
let made = 0;

function usage(p: Params, out: number, thinking: number, batch: boolean) {
  const blocks: { text: string; cached: boolean }[] = [
    ...(p.system ?? []).map((b) => ({ text: b.text, cached: Boolean(b.cache_control) })),
    ...p.messages.flatMap((m) =>
      Array.isArray(m.content)
        ? (m.content as { text?: string; cache_control?: Json }[]).map((b) => ({ text: b.text ?? "", cached: Boolean(b.cache_control) }))
        : [{ text: String(m.content), cached: false }],
    ),
  ];
  let prefix = "";
  let read = 0;
  let write = 0;
  let consumed = 0;
  for (const b of blocks) {
    prefix += `${p.model}|${b.text}|`;
    if (!b.cached) continue;
    const size = est(prefix) - consumed;
    if (cache.has(prefix)) read += size;
    else {
      write += size;
      cache.add(prefix);
    }
    consumed += size;
  }
  const input = Math.max(0, est(blocks.map((b) => b.text).join("")) - read - write);
  return {
    input_tokens: input,
    output_tokens: out + thinking,
    cache_read_input_tokens: read,
    cache_creation_input_tokens: write,
    cache_creation: { ephemeral_1h_input_tokens: write, ephemeral_5m_input_tokens: 0 },
    output_tokens_details: { thinking_tokens: thinking },
    service_tier: batch ? "batch" : "standard",
    server_tool_use: null,
    inference_geo: null,
    speed: null,
  };
}

const message = (p: Params, body: string, u: Json) => ({
  id: `msg_${Math.floor(rnd() * 1e9)}`,
  type: "message",
  role: "assistant",
  model: p.model,
  content: [{ type: "text", text: body }],
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: u,
});

/** Random letters – unique topic words and tested words (real words would collide with the repetition check). */
const word = (n: number, letters = "abcdeghijklmnoprstuvzáéíůýčřšž") => Array.from({ length: n }, () => letters[Math.floor(rnd() * letters.length)]).join("");

async function respond(raw: Params, batch: boolean) {
  const { TASK_TYPES, taskTypeMeta } = await import("@/lib/content/exams");
  const { groupsOfType } = await import("@/lib/content/load");
  const p: Params = { ...raw, system: typeof raw.system === "string" ? [{ text: raw.system }] : raw.system };
  const sys = p.system?.map((b) => b.text) ?? [];
  const first = text(p.messages[0]?.content);

  // lesson distiller (plain text)
  if (sys[0]?.startsWith("Jsi editor")) return message(p, "- Drž se pravidel typu.", usage(p, 80, 0, batch));

  // word proposals
  if (/Navrhni slova|Suggest base words/.test(first)) {
    const aj = first.startsWith("Suggest");
    const words = aj
      ? Array.from({ length: 40 }, () => word(8, "ABCDEFGHIKLMNOPRSTUVW"))
      : Array.from({ length: 54 }, (_, i) => ({ word: word(8), wordClass: ["přídavné jméno", "sloveso", "podstatné jméno", "příslovce"][i % 4] }));
    return message(p, JSON.stringify({ words }), usage(p, 400, 300, batch));
  }

  // validator: "solve" the task by looking up what the generator made
  if (sys[0]?.startsWith("Jsi přísný recenzent")) {
    stats.validatorCalls++;
    const u = usage(p, 600, 1800, batch);
    if (u.cache_read_input_tokens) stats.validatorHits++;
    const judged = text(p.messages[0].content).split("### POSUZOVANÁ ÚLOHA")[1] ?? "";
    const id = judged.match(/simid(\d+)/)?.[1];
    const answers = (id ? keys.get(id) : undefined) ?? [["A"]];
    const roll = rnd();
    const base = {
      answers,
      reasoning: "Vyřešeno.",
      predictedSuccess: 50,
      shortcut: false,
      scores: { distractors: 9, unambiguous: 9, czech: 9, real_words: 9, scio_style: 9, difficulty: 9 },
      issues: [] as string[],
      onlyTooEasy: false,
      verdict: "accept",
    };
    const v =
      roll < 0.62
        ? base
        : roll < 0.8
          ? { ...base, predictedSuccess: 85, onlyTooEasy: true, verdict: "reject", issues: ["příliš lehká"] }
          : roll < 0.92
            ? { ...base, answers: answers.map((a) => a.map((x) => (x === "A" ? "B" : "A"))), verdict: "reject", issues: ["jiná odpověď"] }
            : { ...base, scores: { ...base.scores, czech: 6 }, verdict: "reject", issues: ["chyba v češtině"] };
    return message(p, JSON.stringify(v), u);
  }

  // generator: a real Scio question of the type, made unique
  stats.generatorCalls++;
  const u = usage(p, 900, 3000, batch);
  if (u.cache_read_input_tokens) stats.generatorHits++;
  const name = sys[1]?.match(/typu „([^“]+)“/)?.[1];
  const meta = TASK_TYPES.find((t) => t.name === name);
  if (!meta) throw new Error(`fake API: unknown type in prompt (${name})`);
  const revision = p.messages.length > 1;
  if (!revision && rnd() < 0.06) return message(p, "{ to není JSON", u);
  const groups = groupsOfType(meta.exam, meta.id).filter((g) => !g.group.figure && !g.group.questions.some((q) => q.figure));
  const g = groups[Math.floor(rnd() * groups.length)].group;
  const n = ++made;
  const offered = first.match(/ještě nejsou: ([^\n.]+)\./)?.[1].split(",").map((w) => w.trim());
  const qs = (taskTypeMeta(meta.id)!.groupSize > 1 ? g.questions : [g.questions[Math.floor(rnd() * g.questions.length)]]).map((q, i) => {
    let stem = q.stem;
    if (meta.id === "synonyma") stem = stem.replace(/<u>.*?<\/u>/, `<u>${offered?.[0] ?? `slovo${n}`}</u>`);
    if (meta.id === "aj_wordform") stem = stem.replace(/\(([A-Z][A-Z'-]+)\)\s*\.?\s*$/, `(${offered?.[0] ?? "SIMWORD"})`);
    return { ...q, n: i + 1, stem };
  });
  const renumber = new Map(g.questions.map((q, i) => [q.n, i + 1]));
  const passage = g.passage?.replace(/\((\d+)\)/g, (m, x) => (renumber.has(Number(x)) ? `(${renumber.get(Number(x))})` : m)) ?? null;
  // the marker travels with the stem, so the fake validator can find the key
  const broken = !revision && rnd() < 0.1;
  const gen = {
    topic: `${word(7)} ${word(8)} ${word(6)}`,
    focus: [word(9)],
    instruction: g.instruction,
    passageTitle: g.passageTitle ?? null,
    passage: passage ? `${passage}` : null,
    chart: g.chart ? { title: null, xLabel: null, yLabel: null, unit: null, yStep: null, ...g.chart } : null,
    questions: qs.map((q, i) => ({
      // lowercase marker at the start: an uppercase one would count as an analogy word, one at the end breaks word formation
      stem: i === 0 ? `<!--simid${n}--> ${q.stem}` : q.stem,
      compare: q.compare ?? null,
      parts: q.parts.map((pt) => ({
        label: pt.label ?? null,
        kind: pt.kind ?? null,
        options: broken ? pt.options.slice(0, 3) : pt.options,
        answer: pt.answer,
        alsoAccepted: pt.alsoAccepted ?? null,
      })),
      solution: q.solution || "Protože.",
      trapDesign: "B: záměna pojmů; C: chyba ve výpočtu; D: přehlédnutí podmínky.",
    })),
  };
  keys.set(String(n), qs.map((q) => q.parts.map((pt) => pt.answer)));
  return message(p, JSON.stringify(gen), u);
}

const batches = new Map<string, { id: string; created_at: string; results: Json[] }>();
let base = "";

const server = http.createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null;
  const url = new URL(req.url ?? "/", "http://localhost");
  const send = (status: number, data: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(data));
  };
  const batchObject = (b: { id: string; created_at: string; results: Json[] }) => ({
    id: b.id,
    type: "message_batch",
    processing_status: "ended",
    request_counts: { processing: 0, succeeded: b.results.length, errored: 0, canceled: 0, expired: 0 },
    created_at: b.created_at,
    ended_at: b.created_at,
    expires_at: b.created_at,
    archived_at: null,
    cancel_initiated_at: null,
    results_url: `${base}/v1/messages/batches/${b.id}/results`,
  });
  try {
    if (req.method === "POST" && url.pathname === "/v1/messages") return send(200, await respond(body, false));
    if (req.method === "POST" && url.pathname === "/v1/messages/batches") {
      const b = { id: `msgbatch_${batches.size + 1}`, created_at: new Date().toISOString(), results: [] as Json[] };
      for (const r of body.requests as { custom_id: string; params: Params }[])
        b.results.push({ custom_id: r.custom_id, result: { type: "succeeded", message: await respond(r.params, true) } });
      batches.set(b.id, b);
      return send(200, { ...batchObject(b), processing_status: "in_progress", results_url: null });
    }
    const m = url.pathname.match(/^\/v1\/messages\/batches\/([^/]+)(\/results)?$/);
    const b = m && batches.get(m[1]);
    if (b && m?.[2]) {
      res.writeHead(200, { "content-type": "application/binary" });
      return res.end(b.results.map((r) => JSON.stringify(r)).join("\n") + "\n");
    }
    if (b) return send(200, batchObject(b));
    send(404, { type: "error", error: { type: "not_found_error", message: `no route ${req.method} ${url.pathname}` } });
  } catch (e) {
    console.error("fake API", e);
    send(500, { type: "error", error: { type: "api_error", message: String(e) } });
  }
});

// ---------------------------------------------------------------- simulation

let failures = 0;
const check = (ok: boolean, label: string) => {
  if (!ok) failures++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}`);
};

async function main() {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  Object.assign(process.env, { DEMO_MODE: "1", ANTHROPIC_API_KEY: "sk-ant-sim", ANTHROPIC_BASE_URL: base });

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { runBatchTick, enqueueJobs } = await import("@/lib/server/batch-gen");
  const { generateTasks, GENERATOR_VERSION } = await import("@/lib/ai/generate");
  const { variantParents, EASY_SHARE, VARIANT_SHARE, FAMILY_MAX, FAMILY_GAP_TASKS } = await import("@/lib/ai/families");
  const { pickUnseen } = await import("@/lib/server/pool");
  const { costUsd } = await import("@/lib/ai/usage");
  const { groupsOfType } = await import("@/lib/content/load");
  const db = createAdminClient();

  // strong tasks already in the pool of three maths types: variants have parents and easy tasks have room (≥ 9 tasks)
  for (const type of ["slovni", "porovnani", "vyrazy"] as const)
    for (const [i, { group }] of groupsOfType("osp", type).slice(0, 12).entries()) {
      const q = group.questions[0];
      await db.from("generated_tasks").insert({
        exam: "osp",
        task_type: type,
        payload: { ...group, questions: [{ ...q, n: 1 }], topic: `${word(7)} ${word(8)}`, focus: [word(9)], v: GENERATOR_VERSION, trapDesign: ["B: chyba"] },
        quality: 9,
        validator: {},
        model: "seed",
        seed_refs: [],
        created_at: new Date(Date.now() - (100 - i) * 60_000).toISOString(),
      });
    }

  console.log("Batch API – 40 cron ticků, 3 workery:");
  const state = { enabled: true, workers: 3, mode: "batch" as const, credits_exhausted_at: null, last_tick_at: null, last_error: null, started_at: null };
  for (let t = 0; t < 40; t++) await runBatchTick(state);
  // drain: stop planning, let everything in flight finish
  for (let t = 0; t < 6; t++) await runBatchTick({ ...state, enabled: false });

  const jobs = ((await db.from("gen_jobs").select("*")).data ?? []) as { stage: string; kind: string; note: string | null }[];
  const open = jobs.filter((j) => j.stage === "generate" || j.stage === "validate");
  check(jobs.length > 0, `naplánováno ${jobs.length} úloh`);
  check(open.length === 0, `žádná úloha nezůstala viset mezi dávkami (otevřených ${open.length})`);
  console.log(`    hotovo ${jobs.filter((j) => j.stage === "done").length}, zahozeno ${jobs.filter((j) => j.stage === "failed").length}, variant ${jobs.filter((j) => j.kind === "variant").length}`);

  type TaskRow = { id: string; task_type: string; payload: { easy?: boolean; family?: string; variantOf?: string; v?: number } };
  const tasks = ((await db.from("generated_tasks").select("*")).data ?? []) as TaskRow[];
  const byType = new Map<string, TaskRow[]>();
  for (const t of tasks) byType.set(t.task_type, [...(byType.get(t.task_type) ?? []), t]);
  for (const [type, rows] of byType) {
    const easy = rows.filter((r) => r.payload.easy).length;
    const variants = rows.filter((r) => r.payload.variantOf).length;
    if (easy) check(easy <= EASY_SHARE * rows.length + 1e-9, `${type}: lehké ${easy}/${rows.length} ≤ ${EASY_SHARE * 100} %`);
    if (variants) check(variants <= Math.floor(VARIANT_SHARE * rows.length) + 1, `${type}: varianty ${variants}/${rows.length} ≈ ≤ ${VARIANT_SHARE * 100} %`);
    const families = new Map<string, number>();
    for (const r of rows) families.set(r.payload.family ?? r.id, (families.get(r.payload.family ?? r.id) ?? 0) + 1);
    check(Math.max(...families.values()) <= FAMILY_MAX, `${type}: rodina max. ${Math.max(...families.values())} úloh (limit ${FAMILY_MAX})`);
  }
  console.log(`    zásoba: ${[...byType].map(([t, r]) => `${t} ${r.length}`).join(", ")}`);
  check(tasks.some((t) => t.payload.variantOf), `vznikly varianty (${tasks.filter((t) => t.payload.variantOf).length})`);
  check(tasks.some((t) => t.payload.easy), `vznikly i lehké úlohy (${tasks.filter((t) => t.payload.easy).length})`);

  type Call = { kind: string; model: string; batch?: boolean; cost_usd: number; input_tokens: number; output_tokens: number; cache_read_tokens: number; cache_write_tokens: number; task_type?: string; stage?: string; thinking_tokens?: number };
  const calls = ((await db.from("ai_calls").select("*")).data ?? []) as Call[];
  const batchCalls = calls.filter((c) => c.kind === "generate" || c.kind === "validate");
  check(batchCalls.length > 0 && batchCalls.every((c) => c.batch && c.task_type && c.stage), "všechna volání v dávkách mají typ, fázi a příznak batch");
  check(batchCalls.every((c) => (c.thinking_tokens ?? 0) > 0), "thinking tokeny se ukládají");
  const one = batchCalls[0];
  const full = costUsd(one.model, { input_tokens: one.input_tokens, output_tokens: one.output_tokens, cache_read_input_tokens: one.cache_read_tokens, cache_creation_input_tokens: one.cache_write_tokens, cache_creation: { ephemeral_1h_input_tokens: one.cache_write_tokens, ephemeral_5m_input_tokens: 0 } }, false);
  check(Math.abs(one.cost_usd - full / 2) < 1e-6, `dávka se účtuje za polovic ($${one.cost_usd.toFixed(5)} místo $${full.toFixed(5)})`);
  check(stats.generatorHits / stats.generatorCalls > 0.5, `generátor čte stálou část promptu z cache u ${Math.round((stats.generatorHits / stats.generatorCalls) * 100)} % volání`);
  check(stats.validatorHits / stats.validatorCalls > 0.5, `validátor čte referenční úlohy z cache u ${Math.round((stats.validatorHits / stats.validatorCalls) * 100)} % volání`);
  const accepted = calls.filter((c) => c.kind === "accept").length;
  const spend = calls.filter((c) => ["generate", "validate", "words", "learn"].includes(c.kind)).reduce((a, c) => a + Number(c.cost_usd), 0);
  console.log(`    simulovaná cena: $${(spend / Math.max(1, accepted)).toFixed(3)} za přijatou úlohu (${accepted} přijato; tokeny jen odhad)`);

  console.log("\nSynchronní cesta (uživatel čeká) – 3 úlohy, z toho 1 varianta:");
  const parents = await variantParents("osp", "slovni", 1);
  check(parents.length === 1, "našel se rodič pro variantu");
  const out = await generateTasks({ exam: "osp", type: "slovni", count: 3, parents });
  console.log(`    přijato ${out.accepted.length} (variant ${out.accepted.filter((a) => a.variant).length}, lehkých ${out.accepted.filter((a) => a.easy).length}), zamítnuto ${out.rejected.length}`);
  check(out.accepted.length + out.rejected.length === 3, "každý kandidát skončil");

  console.log("\nVýdej úloh jednomu uživateli (rozestupy):");
  const user = "00000000-0000-4000-8000-0000000000aa";
  const served: TaskRow[] = [];
  for (let i = 0; i < 40; i++) {
    const [pick] = (await pickUnseen(user, "osp", "slovni", 1)) as unknown as TaskRow[];
    if (!pick) break;
    served.push(pick);
    await db.from("task_seen").insert({ user_id: user, task_ref: `gen:${pick.id}`, created_at: new Date(Date.now() + i).toISOString() });
  }
  const fam = served.map((t) => t.payload.family ?? t.id);
  const clash = fam.findIndex((f, i) => fam.slice(Math.max(0, i - FAMILY_GAP_TASKS), i).includes(f));
  check(clash < 0, `${served.length} úloh za sebou, žádné dvě z jedné rodiny blíž než ${FAMILY_GAP_TASKS} úloh`);
  // an easy task may come sooner only when nothing else is left for the user
  const easyAt = served.map((t, i) => (t.payload.easy ? i : -1)).filter((i) => i >= 0);
  check(
    easyAt.every((x, i) => i === 0 || x - easyAt[i - 1] >= 10 || served.slice(x).every((t) => t.payload.easy)),
    `lehké úlohy s rozestupem ≥ 10 (pozice ${easyAt.join(", ") || "žádné"})`,
  );

  console.log("\nDoplnění zásoby uživatele přes dávku:");
  const n = await enqueueJobs({ exam: "osp", type: "synonyma", count: 2, userId: user });
  // worst case: generate → validate → revision → validate → done = 5 ticks
  for (let t = 0; t < 6; t++) await runBatchTick({ ...state, enabled: false });
  const mine = ((await db.from("gen_jobs").select("*").eq("user_id", user)).data ?? []) as { stage: string; state: { candidate: { words: string[] | null } } }[];
  check(mine.length === n && mine.every((j) => j.stage === "done" || j.stage === "failed"), `${n} úlohy uživatele zpracované v dávkách`);
  check(mine.every((j) => (j.state.candidate.words?.length ?? 0) >= 3), "synonyma dostala nabídku nepoužitých slov");

  server.close();
  console.log(`\nCelkem problémů: ${failures}`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  server.close();
  process.exit(1);
});

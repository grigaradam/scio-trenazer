import "server-only";
// In-memory stand-in for the Supabase service client, used only when DEMO_MODE=1 in development.
// It implements just the query-builder subset this app uses, so every page and API route can be
// clicked through locally without a Supabase project (UI QA, mobile testing).

type Row = Record<string, unknown>;
type Store = Record<string, Row[]>;

export const DEMO_USER = { id: "00000000-0000-4000-8000-000000000001", email: "demo@localhost" };

const g = globalThis as unknown as { __demoStore?: Store };
function store(): Store {
  if (!g.__demoStore) {
    g.__demoStore = {
      profiles: [
        {
          id: DEMO_USER.id,
          display_name: "Demo",
          exam: "osp",
          onboarded: false,
          xp: 0,
          streak_current: 0,
          streak_best: 0,
          last_active_date: null,
          daily_goal_min: 20,
          practice_time_limit_sec: null,
          created_at: new Date().toISOString(),
        },
      ],
      autogen_state: [{ id: 1, enabled: false, workers: 2, credits_exhausted_at: null, last_tick_at: null, last_error: null, started_at: null }],
      autogen_leases: Array.from({ length: 6 }, (_, slot) => ({ slot, lease_until: new Date(0).toISOString(), runs: 0 })),
    };
  }
  return g.__demoStore;
}
const table = (name: string) => (store()[name] ??= []);

const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" }).format(new Date());

const DEFAULTS: Record<string, () => Row> = {
  attempts: () => ({
    id: crypto.randomUUID(),
    exam: "osp",
    is_diagnostic: false,
    status: "in_progress",
    section_index: 0,
    answers: {},
    flags: [],
    pause_count: 0,
    active_seconds: 0,
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    completed_at: null,
    score: null,
    max_score: null,
    result: null,
    retake_section: null,
  }),
  mistakes: () => ({
    id: crypto.randomUUID(),
    exam: "osp",
    status: "open",
    tries: 0,
    attempt_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }),
  generated_tasks: () => ({ id: crypto.randomUUID(), exam: "osp", served_count: 0, seed_refs: [], created_at: new Date().toISOString() }),
  practice_answers: () => ({ id: Date.now() + Math.random(), exam: "osp", created_at: new Date().toISOString() }),
  task_seen: () => ({ created_at: new Date().toISOString() }),
  achievements: () => ({ unlocked_at: new Date().toISOString() }),
  explanations: () => ({ created_at: new Date().toISOString() }),
  ai_calls: () => ({ id: Date.now() + Math.random(), created_at: new Date().toISOString(), note: null }),
  invite_codes: () => ({ created_at: new Date().toISOString(), used_at: null, used_by: null, revoked: false, note: null }),
};

const KEYS: Record<string, string[]> = {
  invite_codes: ["code"],
  daily_traffic: ["day", "user_id"],
  profiles: ["id"],
  mistakes: ["user_id", "task_ref"],
  task_seen: ["user_id", "task_ref"],
  achievements: ["user_id", "code"],
  explanations: ["task_ref"],
  study_days: ["user_id", "day"],
};

type Filter = (r: Row) => boolean;

class Query implements PromiseLike<{ data: unknown; error: null; count?: number }> {
  private filters: Filter[] = [];
  private orderBy: { col: string; asc: boolean } | null = null;
  private max: number | null = null;
  private mode: "select" | "insert" | "upsert" | "update" | "delete" = "select";
  private payload: Row[] = [];
  private patch: Row = {};
  private singleMode: "one" | "maybe" | null = null;
  private countOnly = false;
  private returning = false;

  constructor(private name: string) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (opts?.head) this.countOnly = true;
    if (this.mode !== "select") this.returning = true;
    return this;
  }
  insert(rows: Row | Row[]) {
    this.mode = "insert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  upsert(rows: Row | Row[]) {
    this.mode = "upsert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  update(patch: Row) {
    this.mode = "update";
    this.patch = patch;
    return this;
  }
  delete() {
    this.mode = "delete";
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  in(col: string, vals: unknown[]) {
    this.filters.push((r) => vals.includes(r[col]));
    return this;
  }
  like(col: string, pattern: string) {
    const re = new RegExp("^" + pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*") + "$");
    this.filters.push((r) => re.test(String(r[col] ?? "")));
    return this;
  }
  gte(col: string, val: unknown) {
    this.filters.push((r) => String(r[col]) >= String(val));
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderBy = { col, asc: opts?.ascending ?? true };
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  maybeSingle() {
    this.singleMode = "maybe";
    return this;
  }
  single() {
    this.singleMode = "one";
    return this;
  }

  private run() {
    const rows = table(this.name);
    let out: Row[] = [];
    if (this.mode === "insert" || this.mode === "upsert") {
      const keys = KEYS[this.name];
      for (const p of this.payload) {
        const existing = this.mode === "upsert" && keys ? rows.find((r) => keys.every((k) => r[k] === p[k])) : undefined;
        if (existing) {
          Object.assign(existing, p);
          out.push(existing);
        } else {
          const row = { ...(DEFAULTS[this.name]?.() ?? {}), ...p };
          rows.push(row);
          out.push(row);
        }
      }
    } else {
      out = rows.filter((r) => this.filters.every((f) => f(r)));
      if (this.mode === "update") out.forEach((r) => Object.assign(r, this.patch));
      if (this.mode === "delete") store()[this.name] = rows.filter((r) => !out.includes(r));
    }
    if (this.orderBy) {
      const { col, asc } = this.orderBy;
      out = [...out].sort((a, b) => (String(a[col] ?? "") < String(b[col] ?? "") ? -1 : 1) * (asc ? 1 : -1));
    }
    if (this.max !== null) out = out.slice(0, this.max);
    const copy = JSON.parse(JSON.stringify(out)) as Row[];
    if (this.countOnly) return { data: null, error: null, count: copy.length };
    if (this.singleMode) return { data: copy[0] ?? null, error: null };
    if (this.mode !== "select" && !this.returning) return { data: null, error: null };
    return { data: copy, error: null };
  }

  then<T1 = { data: unknown; error: null; count?: number }, T2 = never>(
    ok?: ((v: { data: unknown; error: null; count?: number }) => T1 | PromiseLike<T1>) | null,
    fail?: ((e: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve()
      .then(() => this.run())
      .then(ok, fail);
  }
}

function rpc(name: string, a: Record<string, unknown>) {
  const run = () => {
    if (name === "record_activity") {
      const day = today();
      const days = table("study_days");
      let d = days.find((r) => r.user_id === a.p_user && r.day === day);
      if (!d) days.push((d = { user_id: a.p_user, day, seconds: 0, tasks: 0, correct: 0, xp: 0 }));
      d.seconds = (d.seconds as number) + (a.p_seconds as number);
      d.tasks = (d.tasks as number) + (a.p_tasks as number);
      d.correct = (d.correct as number) + (a.p_correct as number);
      d.xp = (d.xp as number) + (a.p_xp as number);
      const p = table("profiles").find((r) => r.id === a.p_user)!;
      if ((a.p_tasks as number) > 0 && p.last_active_date !== day) {
        const y = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" }).format(new Date(Date.now() - 86400000));
        p.streak_current = p.last_active_date === y ? (p.streak_current as number) + 1 : 1;
        p.streak_best = Math.max(p.streak_best as number, p.streak_current as number);
        p.last_active_date = day;
      }
      p.xp = (p.xp as number) + (a.p_xp as number);
      return { ...p };
    }
    if (name === "pick_generated_tasks") {
      const seen = new Set(table("task_seen").filter((s) => s.user_id === a.p_user).map((s) => s.task_ref));
      return table("generated_tasks")
        .filter((t) => t.task_type === a.p_type && !seen.has(`gen:${t.id}`))
        .slice(0, a.p_limit as number);
    }
    if (name === "claim_invite") {
      const code = String(a.p_code).trim().toUpperCase();
      const row = table("invite_codes").find((r) => r.code === code && !r.used_at && !r.revoked);
      if (!row) return false;
      row.used_at = new Date().toISOString();
      return true;
    }
    if (name === "track_view") {
      const day = today();
      const rows = table("daily_traffic");
      let r = rows.find((x) => x.user_id === a.p_user && x.day === day);
      if (!r) rows.push((r = { day, user_id: a.p_user, views: 0 }));
      r.views = (r.views as number) + 1;
      const p = table("profiles").find((x) => x.id === a.p_user);
      if (p) p.last_seen_at = new Date().toISOString();
      return null;
    }
    if (name === "autogen_claim") {
      const now = Date.now();
      const free = table("autogen_leases").filter((l) => (l.slot as number) < (a.p_workers as number) && new Date(l.lease_until as string).getTime() < now);
      free.forEach((l) => (l.lease_until = new Date(now + (a.p_seconds as number) * 1000).toISOString()));
      return free.map((l) => l.slot);
    }
    if (name === "autogen_release") {
      const l = table("autogen_leases").find((x) => x.slot === a.p_slot);
      if (l) l.lease_until = new Date(0).toISOString();
      return null;
    }
    if (name === "bump_ai_usage") {
      const rows = table("ai_usage");
      let r = rows.find((x) => x.user_id === a.p_user && x.day === today() && x.kind === a.p_kind);
      if (!r) rows.push((r = { user_id: a.p_user, day: today(), kind: a.p_kind, count: 0 }));
      r.count = (r.count as number) + 1;
      return r.count;
    }
    throw new Error(`demo rpc ${name} not implemented`);
  };
  return Promise.resolve().then(() => ({ data: JSON.parse(JSON.stringify(run())), error: null }));
}

export const isDemo = () =>
  process.env.DEMO_MODE === "1" && (process.env.NODE_ENV !== "production" || process.env.DEMO_ALLOW_PROD === "1");

const auth = {
  admin: {
    async listUsers() {
      const users = table("auth_users");
      if (!users.length) users.push({ id: DEMO_USER.id, email: DEMO_USER.email, created_at: new Date().toISOString() });
      return { data: { users: JSON.parse(JSON.stringify(users)) }, error: null };
    },
    async createUser(opts: { email: string; user_metadata?: { display_name?: string } }) {
      const users = table("auth_users");
      if (users.some((u) => u.email === opts.email)) return { data: { user: null }, error: { message: "User already registered" } };
      const user = { id: crypto.randomUUID(), email: opts.email, created_at: new Date().toISOString() };
      users.push(user);
      table("profiles").push({ id: user.id, display_name: opts.user_metadata?.display_name ?? null, xp: 0, streak_current: 0, streak_best: 0, onboarded: false, daily_goal_min: 20, blocked: false });
      return { data: { user }, error: null };
    },
  },
};

export function createDemoClient() {
  return { from: (name: string) => new Query(name), rpc, auth };
}

import "server-only";
import webpush from "web-push";
import { vapidEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { daysBetween } from "./pet";
import { czToday } from "./queries";

export interface PushMessage {
  title: string;
  body: string;
  /** Page opened when the notification is tapped. */
  url?: string;
  /** A newer notification with the same tag replaces the older one. */
  tag?: string;
}

interface SubscriptionRow {
  endpoint: string;
  user_id: string;
  p256dh: string;
  auth: string;
}

const czHour = () =>
  Number(new Intl.DateTimeFormat("cs-CZ", { hour: "numeric", hour12: false, timeZone: "Europe/Prague" }).format(new Date()));

/** Sends to the given devices. Subscriptions the push service reports as gone are deleted. Returns how many arrived. */
async function deliver(rows: SubscriptionRow[], message: PushMessage | ((row: SubscriptionRow) => PushMessage)) {
  const vapid = vapidEnv();
  if (!vapid || !rows.length) return 0;
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  const gone: string[] = [];
  const results = await Promise.all(
    rows.map((row) =>
      webpush
        .sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          JSON.stringify(typeof message === "function" ? message(row) : message),
          { TTL: 60 * 60 * 4, urgency: "normal" },
        )
        .then(() => true)
        .catch((err: { statusCode?: number; body?: string }) => {
          if (err.statusCode === 404 || err.statusCode === 410) gone.push(row.endpoint);
          else console.error("push", err.statusCode, err.body);
          return false;
        }),
    ),
  );
  if (gone.length) await createAdminClient().from("push_subscriptions").delete().in("endpoint", gone);
  return results.filter(Boolean).length;
}

export async function sendToAll(message: PushMessage) {
  const { data } = await createAdminClient().from("push_subscriptions").select("endpoint,user_id,p256dh,auth");
  return deliver((data ?? []) as SubscriptionRow[], message);
}

export async function sendToUser(userId: string, message: PushMessage) {
  const { data } = await createAdminClient().from("push_subscriptions").select("endpoint,user_id,p256dh,auth").eq("user_id", userId);
  return deliver((data ?? []) as SubscriptionRow[], message);
}

interface ReminderProfile {
  /** whole days since the last solved task (0 = today, null = never) */
  idle: number | null;
  streak: number;
  /** minutes studied today and the daily goal */
  minutes: number;
  goal: number;
  /** "Adame" or null when the vocative isn't known yet. */
  name: string | null;
}

const days = (n: number) => `${n} ${n === 1 ? "den" : n < 5 ? "dny" : "dní"}`;
const hi = (name: string | null, rest: string) => (name ? `${name}, ${rest.charAt(0).toLowerCase()}${rest.slice(1)}` : rest);

/**
 * The day's reminders by Prague hour, in the pet's voice and only when it really needs something.
 * Each returns the message for one user, or null to stay quiet:
 * - studied yesterday, not yet today: hungry at 11 (only with a streak to keep), 15 and 18 (streak in danger);
 * - studied today but short of the daily goal: low on energy at 18;
 * - two days off: sad, once at 18; longer: asleep, only on the 3rd, 7th, 14th and 30th day, then it lets you be.
 */
const REMINDERS: Record<number, (p: ReminderProfile) => PushMessage | null> = {
  11: ({ idle, streak, name }) =>
    idle === 1 && streak >= 2
      ? { title: `☀️ Dobré ráno${name ? `, ${name}` : ""}!`, body: "Kručí mi v bříšku. Nasnídáme se spolu jednou úlohou? 🍎", url: "/app/pet", tag: "pet" }
      : null,
  15: ({ idle, name }) =>
    idle === 1
      ? { title: "🍎 Mám hlad!", body: hi(name, "Dneska jsem ještě nedostal ani jednu úlohu. Stačí pár minut a jsem sytý."), url: "/app/practice/mix", tag: "pet" }
      : null,
  18: ({ idle, streak, minutes, goal, name }) => {
    if (idle === 0)
      return minutes < goal
        ? {
            title: "⚡ Dochází mi energie",
            body: hi(name, `Dnes jsme se učili ${minutes} min z ${goal}. Ještě ${goal - minutes} min a budu zase nabitý!`),
            url: "/app/practice/mix",
            tag: "pet",
          }
        : null;
    if (idle === 1)
      return streak > 0
        ? {
            title: `🔥 Náš streak ${days(streak)} je v ohrožení`,
            body: hi(name, "Mám hlad a bojím se, že o streak přijdeme. Jedna úloha a je zachráněný."),
            url: "/app/practice/mix",
            tag: "pet",
          }
        : { title: "🍎 Pořád mám hlad", body: hi(name, "Dáš mi dneska aspoň jednu úlohu? Zabere to chvilku."), url: "/app/practice/mix", tag: "pet" };
    if (idle === 2)
      return { title: "😢 Je mi smutno", body: hi(name, "Už dva dny jsme se neučili a stýská se mi. Přijdeš za mnou aspoň na jednu úlohu?"), url: "/app/pet", tag: "pet" };
    if (idle === 3 || idle === 7 || idle === 14 || idle === 30)
      return { title: "💤 Usínám…", body: `Zzz… ${days(idle)} bez tebe. Vzbudíš mě jednou úlohou?`, url: "/app/pet", tag: "pet" };
    return null;
  },
};

/**
 * Scheduled reminders (see REMINDERS). Called every minute by the cron; does work only in a reminder hour.
 * Each device is claimed for the slot ("2026-10-28 15") in a single update, so overlapping runs never double-send.
 */
export async function sendDailyReminders() {
  const hour = czHour();
  const reminder = REMINDERS[hour];
  if (!reminder || !vapidEnv()) return 0;
  const admin = createAdminClient();
  const today = czToday();
  const slot = `${today} ${hour}`;
  const { data: claimed, error } = await admin
    .from("push_subscriptions")
    .update({ reminded_slot: slot })
    .or(`reminded_slot.is.null,reminded_slot.neq.${slot}`)
    .select("endpoint,user_id,p256dh,auth");
  if (error) {
    // no table at all = push never set up, stay quiet; anything else (e.g. migration 0011 missing) must show in the logs
    if (!["42P01", "PGRST205"].includes(error.code)) console.error("push reminders", error.code, error.message);
    return 0;
  }
  const rows = (claimed ?? []) as SubscriptionRow[];
  if (!rows.length) return 0;

  const ids = [...new Set(rows.map((r) => r.user_id))];
  const [{ data: profiles }, { data: studied }] = await Promise.all([
    admin.from("profiles").select("id,last_active_date,streak_current,daily_goal_min,display_name_vocative,blocked").in("id", ids),
    admin.from("study_days").select("user_id,seconds").eq("day", today).in("user_id", ids),
  ]);
  const seconds = new Map((studied ?? []).map((d) => [d.user_id as string, (d.seconds as number) ?? 0]));
  const messages = new Map<string, PushMessage>();
  for (const p of profiles ?? []) {
    if (p.blocked) continue;
    const idle = p.last_active_date ? daysBetween(p.last_active_date, today) : null;
    const msg = reminder({
      idle,
      // a gap of 2+ days already broke the stored streak
      streak: idle !== null && idle <= 1 ? (p.streak_current ?? 0) : 0,
      minutes: Math.floor((seconds.get(p.id) ?? 0) / 60),
      goal: p.daily_goal_min ?? 15,
      name: p.display_name_vocative ?? null,
    });
    if (msg) messages.set(p.id, msg);
  }
  const due = rows.filter((r) => messages.has(r.user_id));
  return deliver(due, (row) => messages.get(row.user_id)!);
}

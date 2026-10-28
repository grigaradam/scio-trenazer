import "server-only";
import webpush from "web-push";
import { vapidEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
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
  /** Already studied today (Prague date). */
  done: boolean;
  streak: number;
  /** "Adame" or null when the vocative isn't known yet. */
  name: string | null;
}

const days = (n: number) => `${n} ${n === 1 ? "den" : n < 5 ? "dny" : "dní"}`;

/**
 * The day's reminders by Prague hour. Each returns the message for one user, or null to skip them.
 * 11:00 – good morning to everyone; 15:00 – nudge if not studied yet; 18:00 – nudge again, or "one more round" if done.
 */
const REMINDERS: Record<number, (p: ReminderProfile) => PushMessage | null> = {
  11: ({ name }) => ({
    title: `☀️ Dobré ráno${name ? `, ${name}` : ""}!`,
    body: "Už se těším na dnešní trénink. Kdy se do toho pustíme?",
    url: "/app",
    tag: "reminder",
  }),
  15: ({ done, name }) =>
    done
      ? null
      : {
          title: "Dneska ještě nemáš odmakáno",
          body: `${name ? `${name}, s` : "S"}tačí chvilka – pár úloh a máš hotovo.`,
          url: "/app/practice",
          tag: "reminder",
        },
  18: ({ done, name, streak }) =>
    done
      ? {
          title: "💪 Trénink dělá mistra",
          body: `${name ? `${name}, d` : "D"}neska máš odmakáno. Dáš ještě jedno kolo?`,
          url: "/app/practice",
          tag: "reminder",
        }
      : streak > 0
        ? {
            title: `🔥 Série ${days(streak)} je v ohrožení`,
            body: `${name ? `${name}, p` : "P"}ořád nemáš odmakáno. Stačí pár úloh a sérii udržíš.`,
            url: "/app/practice",
            tag: "reminder",
          }
        : {
            title: "Pořád nemáš odmakáno",
            body: `${name ? `${name}, s` : "S"}tačí pár rychlých úloh. Zabere to jen chvilku.`,
            url: "/app/practice",
            tag: "reminder",
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
    // migrations 0010/0011 not run yet – stay quiet
    if (!["42P01", "42703", "PGRST204", "PGRST205"].includes(error.code)) console.error("push reminders", error.message);
    return 0;
  }
  const rows = (claimed ?? []) as SubscriptionRow[];
  if (!rows.length) return 0;

  const { data: profiles } = await admin
    .from("profiles")
    .select("id,last_active_date,streak_current,display_name_vocative,blocked")
    .in("id", [...new Set(rows.map((r) => r.user_id))]);
  const messages = new Map<string, PushMessage>();
  for (const p of profiles ?? []) {
    if (p.blocked) continue;
    const msg = reminder({ done: p.last_active_date === today, streak: p.streak_current ?? 0, name: p.display_name_vocative ?? null });
    if (msg) messages.set(p.id, msg);
  }
  const due = rows.filter((r) => messages.has(r.user_id));
  return deliver(due, (row) => messages.get(row.user_id)!);
}

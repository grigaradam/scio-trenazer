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

// Prague hour at which the daily reminder goes out to anyone who hasn't studied yet.
export const REMINDER_HOUR = 18;

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

export async function sendToUser(userId: string, message: PushMessage) {
  const { data } = await createAdminClient().from("push_subscriptions").select("endpoint,user_id,p256dh,auth").eq("user_id", userId);
  return deliver((data ?? []) as SubscriptionRow[], message);
}

/**
 * Daily study reminder. Called every minute by the cron; does work only during REMINDER_HOUR.
 * Each device is claimed by setting reminded_on in a single update, so overlapping runs never double-send.
 */
export async function sendDailyReminders() {
  if (czHour() !== REMINDER_HOUR || !vapidEnv()) return 0;
  const admin = createAdminClient();
  const today = czToday();
  const { data: claimed, error } = await admin
    .from("push_subscriptions")
    .update({ reminded_on: today })
    .or(`reminded_on.is.null,reminded_on.lt.${today}`)
    .select("endpoint,user_id,p256dh,auth");
  if (error) {
    // migration 0010 not run yet – stay quiet
    if (error.code !== "42P01" && error.code !== "PGRST205") console.error("push reminders", error.message);
    return 0;
  }
  const rows = (claimed ?? []) as SubscriptionRow[];
  if (!rows.length) return 0;

  const { data: profiles } = await admin
    .from("profiles")
    .select("id,last_active_date,streak_current,display_name_vocative,blocked")
    .in("id", [...new Set(rows.map((r) => r.user_id))]);
  const byId = new Map((profiles ?? []).map((p) => [p.id as string, p]));
  const due = rows.filter((r) => {
    const p = byId.get(r.user_id);
    return p && !p.blocked && p.last_active_date !== today;
  });

  return deliver(due, (row) => {
    const p = byId.get(row.user_id)!;
    const hi = p.display_name_vocative ? `${p.display_name_vocative}, ` : "";
    const streak = p.streak_current as number;
    return streak > 0
      ? {
          title: `🔥 Série ${streak} ${streak === 1 ? "den" : streak < 5 ? "dny" : "dní"} je v ohrožení`,
          body: `${hi}stačí pár úloh a sérii udržíš.`,
          url: "/app/practice",
          tag: "daily-reminder",
        }
      : {
          title: "Dneska ještě nemáš odcvičeno",
          body: `${hi}dáš pár rychlých úloh? Zabere to jen chvilku.`,
          url: "/app/practice",
          tag: "daily-reminder",
        };
  });
}

import "server-only";
import { after } from "next/server";
import { anthropic } from "@/lib/ai/client";
import { logAiCall } from "@/lib/ai/usage";
import { AI } from "@/lib/env";
import type { Profile } from "@/lib/server/types";
import { createAdminClient } from "@/lib/supabase/admin";

// Cheapest model, a few tokens per call, and every distinct name is asked only once (table name_forms).
const MODEL = process.env.AI_NAME_MODEL || "claude-haiku-5-5";

const key = (name: string) => name.trim().toLowerCase();

/** Czech vocative of a name ("Adam" → "Adame"), from the shared cache or asked from AI once. Null when unknown. */
export async function vocativeOf(name: string): Promise<string | null> {
  const k = key(name);
  if (!k) return null;
  const admin = createAdminClient();
  const { data: cached } = await admin.from("name_forms").select("vocative").eq("name", k).maybeSingle();
  if (cached?.vocative) return matchCase(name.trim(), cached.vocative as string);
  if (!AI.enabled) return null;

  try {
    const response = await anthropic().messages.create({
      model: MODEL,
      max_tokens: 30,
      system:
        "Vrať 5. pád (vokativ) zadaného jména nebo přezdívky v češtině, jak by ho použil kamarád při oslovení. " +
        "Odpověz POUZE tím tvarem, bez uvozovek a interpunkce. Když jméno nejde skloňovat (cizí, zkratka, nick), vrať ho beze změny.",
      messages: [{ role: "user", content: name.trim() }],
    });
    await logAiCall({ kind: "name", model: MODEL, usage: response.usage, note: name.trim() });
    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("")
      .trim()
      .replace(/^["'„“]+|["'“”.!,]+$/g, "");
    // sanity check: one short form, not a sentence
    if (!text || text.length > 60 || text.split(/\s+/).length > name.trim().split(/\s+/).length + 1) return null;
    await admin.from("name_forms").upsert({ name: k, vocative: text.toLowerCase() });
    return matchCase(name.trim(), text);
  } catch (e) {
    console.error("vocativeOf", e);
    return null;
  }
}

/** Greeting form of the user's name; backfills the vocative after the response for profiles that lack it. */
export function greetingName(profile: Profile) {
  // null = column exists but not filled yet (users from before migration 0006); undefined = migration not run
  if (profile.display_name && profile.display_name_vocative === null) {
    after(() => refreshVocative(profile.id, profile.display_name));
  }
  return profile.display_name_vocative || profile.display_name;
}

/**
 * Fills profiles.display_name_vocative for the user's current name (never throws).
 * Falls back to the name itself, so a name that can't be resolved isn't asked again on every visit.
 */
export async function refreshVocative(userId: string, name: string | null | undefined) {
  try {
    const vocative = name?.trim() ? ((await vocativeOf(name)) ?? name.trim()) : null;
    await createAdminClient().from("profiles").update({ display_name_vocative: vocative }).eq("id", userId);
  } catch (e) {
    console.error("refreshVocative", e);
  }
}

// Cache stores lower case; give the vocative the capitalisation the user typed ("adam" → "adame", "ADAM" → "ADAME").
function matchCase(original: string, vocative: string) {
  if (original === original.toUpperCase() && original !== original.toLowerCase()) return vocative.toUpperCase();
  return vocative
    .toLowerCase()
    .split(/(\s+|-)/)
    .map((part, i) => {
      const src = original.split(/(\s+|-)/)[i];
      return src && src[0] === src[0].toUpperCase() ? part.charAt(0).toUpperCase() + part.slice(1) : part;
    })
    .join("");
}

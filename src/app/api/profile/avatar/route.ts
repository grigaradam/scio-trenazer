import { NextResponse } from "next/server";
import { apiUser } from "@/lib/server/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "avatars";
const MAX_BYTES = 2 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };

type Admin = ReturnType<typeof createAdminClient>;

/** Removes every stored picture of the user except `keep`. */
async function removeOld(admin: Admin, userId: string, keep?: string) {
  const { data } = await admin.storage.from(BUCKET).list(userId);
  const paths = (data ?? []).map((f) => `${userId}/${f.name}`).filter((p) => p !== keep);
  if (paths.length) await admin.storage.from(BUCKET).remove(paths);
}

/** Uploads a new profile picture (multipart field "file"; the client already crops it to a small square). */
export async function POST(req: Request) {
  const { user, error } = await apiUser();
  if (error) return error;

  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof Blob)) return NextResponse.json({ error: "Chybí obrázek" }, { status: 400 });
  const ext = TYPES[file.type];
  if (!ext) return NextResponse.json({ error: "Podporujeme jen JPG, PNG a WebP" }, { status: 415 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Obrázek je moc velký (max 2 MB)" }, { status: 413 });

  const admin = createAdminClient();
  const path = `${user.id}/${Date.now()}.${ext}`;
  const bucket = admin.storage.from(BUCKET);
  let { error: upError } = await bucket.upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
  // Bucket not created yet (migration 0009 not run) – create it and retry once.
  if (upError && /bucket not found/i.test(upError.message)) {
    await admin.storage.createBucket(BUCKET, { public: true, fileSizeLimit: MAX_BYTES, allowedMimeTypes: Object.keys(TYPES) });
    ({ error: upError } = await bucket.upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false }));
  }
  if (upError) return NextResponse.json({ error: upError.message }, { status: 500 });

  const avatar_url = bucket.getPublicUrl(path).data.publicUrl;
  const { error: dbError } = await admin.from("profiles").update({ avatar_url }).eq("id", user.id);
  if (dbError) {
    await bucket.remove([path]);
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }
  await removeOld(admin, user.id, path);
  return NextResponse.json({ avatar_url });
}

/** Removes the profile picture; the initial-letter placeholder shows again. */
export async function DELETE() {
  const { user, error } = await apiUser();
  if (error) return error;
  const admin = createAdminClient();
  const { error: dbError } = await admin.from("profiles").update({ avatar_url: null }).eq("id", user.id);
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  await removeOld(admin, user.id);
  return NextResponse.json({ ok: true });
}

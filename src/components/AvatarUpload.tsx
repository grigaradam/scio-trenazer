"use client";

import { Camera, Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

const SIZE = 512;

/** Center-crops the image to a square, scales it to SIZE px and encodes it as WebP (JPEG where WebP encoding is missing). */
async function toSquare(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const side = Math.min(bitmap.width, bitmap.height);
  const out = Math.min(SIZE, side);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = out;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, out, out);
  bitmap.close();
  const encode = (type: string) => new Promise<Blob | null>((res) => canvas.toBlob(res, type, 0.88));
  const webp = await encode("image/webp");
  if (webp?.type === "image/webp") return webp;
  const jpeg = await encode("image/jpeg");
  if (!jpeg) throw new Error("encode");
  return jpeg;
}

export function AvatarUpload({ url, fallback }: { url: string | null; fallback: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState(url);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function upload(file: File) {
    setErr(null);
    if (!file.type.startsWith("image/")) return setErr("Vyber obrázek.");
    if (file.size > 20 * 1024 * 1024) return setErr("Obrázek je moc velký (max 20 MB).");
    setBusy(true);
    try {
      let blob: Blob;
      try {
        blob = await toSquare(file);
      } catch {
        throw new Error("Tenhle formát neumím otevřít – zkus JPG nebo PNG.");
      }
      const form = new FormData();
      form.append("file", blob, "avatar");
      const res = await fetch("/api/profile/avatar", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Nahrání se nepovedlo.");
      setSrc(data.avatar_url);
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setErr(null);
    setBusy(true);
    const res = await fetch("/api/profile/avatar", { method: "DELETE" });
    setBusy(false);
    if (!res.ok) return setErr("Smazání se nepovedlo.");
    setSrc(null);
    router.refresh();
  }

  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        aria-label={src ? "Změnit profilovou fotku" : "Nahrát profilovou fotku"}
        className="group relative h-16 w-16 cursor-pointer overflow-hidden rounded-2xl disabled:cursor-wait"
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="grid h-full w-full place-items-center bg-gradient-to-br from-brand-500 to-analytic-500 font-display text-2xl font-extrabold text-white">
            {fallback}
          </span>
        )}
        <span
          className={`absolute inset-0 grid place-items-center bg-black/45 text-white transition ${busy ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"}`}
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
        </span>
        {!src && !busy && (
          <span className="absolute bottom-0.5 right-0.5 grid h-5 w-5 place-items-center rounded-full bg-surface text-text shadow group-hover:hidden">
            <Camera className="h-3 w-3" />
          </span>
        )}
      </button>
      {src && !busy && (
        <button type="button" onClick={remove} className="flex items-center gap-1 text-xs font-bold text-muted hover:text-rose-600">
          <Trash2 className="h-3 w-3" /> Odebrat
        </button>
      )}
      {err && <p className="max-w-40 text-center text-xs font-bold text-rose-600">{err}</p>}
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) upload(f);
        }}
      />
    </div>
  );
}

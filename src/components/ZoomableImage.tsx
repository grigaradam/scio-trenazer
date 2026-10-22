"use client";

import { Maximize2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** Figure that opens full-screen on tap – pan and pinch-zoom for small phone screens. */
export function ZoomableImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [big, setBig] = useState(false);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="group relative mx-auto block w-full cursor-zoom-in" aria-label="Zvětšit obrázek">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className={className} loading="lazy" />
        <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs font-bold text-white opacity-90 transition group-hover:opacity-100">
          <Maximize2 className="h-3.5 w-3.5" /> Zvětšit
        </span>
      </button>
      {open &&
        createPortal(
        <div className="fixed inset-0 z-[90] flex flex-col bg-black" role="dialog" aria-modal="true">
          <div className="flex items-center justify-between px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-white">
            <button onClick={() => setBig((b) => !b)} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-bold">
              {big ? "Přizpůsobit" : "Přiblížit 2×"}
            </button>
            <button onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-xl bg-white/10" aria-label="Zavřít">
              <X className="h-6 w-6" />
            </button>
          </div>
          <div className="flex-1 overflow-auto overscroll-contain" style={{ touchAction: "pan-x pan-y pinch-zoom" }} onClick={() => !big && setOpen(false)}>
            <div className={big ? "w-[200%] p-3" : "flex min-h-full items-center justify-center p-3"}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={alt}
                onClick={(e) => {
                  e.stopPropagation();
                  setBig((b) => !b);
                }}
                className={big ? "w-full rounded-lg bg-white" : "max-h-full w-full max-w-5xl rounded-lg bg-white object-contain"}
              />
            </div>
          </div>
          <p className="pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-xs text-white/60">Klepni na obrázek pro přiblížení, posouvej prstem</p>
        </div>,
          document.body,
        )}
    </>
  );
}

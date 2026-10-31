"use client";

import { plural } from "./czech";
import { compactXp } from "./gamification";

// Shareable picture of the pet (1080×1350, the portrait size Instagram, WhatsApp and stories crop well),
// drawn in the browser from the pet SVG already on the page.

export interface PetCardInfo {
  name: string;
  stage: string;
  level: number;
  xp: number;
  streak: number;
  achievements: number;
  site: string;
}

const W = 1080;
/** margin around the pet drawing, in its 200-unit coordinates */
const PAD = 24;
const H = 1350;

function svgImage(svg: SVGSVGElement): Promise<HTMLImageElement> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  // a little margin around the 200×200 drawing, so the legend's glow (which may reach past it) isn't cut off
  clone.setAttribute("viewBox", `${-PAD} ${-PAD} ${200 + 2 * PAD} ${200 + 2 * PAD}`);
  clone.setAttribute("width", "1000");
  clone.setAttribute("height", "1000");
  clone.removeAttribute("class");
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" }));
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = reject;
    img.src = url;
  });
}

function pill(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, bg: string, fg: string) {
  ctx.font = `800 34px ${font()}`;
  const w = ctx.measureText(text).width + 52;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(cx - w / 2, y, w, 62, 31);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.fillText(text, cx, y + 43);
  return w;
}

const font = () => getComputedStyle(document.querySelector("h1") ?? document.body).fontFamily || "sans-serif";

export async function renderPetCard(svg: SVGSVGElement, info: PetCardInfo): Promise<Blob> {
  await document.fonts?.ready;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // background
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#ede9fe");
  bg.addColorStop(1, "#fdf2f8");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(167, 139, 250, 0.18)";
  for (const [x, y, r] of [
    [90, 140, 120],
    [1010, 330, 170],
    [140, 1180, 150],
  ]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // header
  ctx.textAlign = "center";
  ctx.fillStyle = "#7c3aed";
  ctx.font = `800 32px ${font()}`;
  ctx.fillText("M Ů J   M A Z L Í Č E K", W / 2, 120);
  ctx.fillStyle = "#1e1b4b";
  ctx.font = `800 104px ${font()}`;
  ctx.fillText(info.name, W / 2, 235, W - 120);

  // stage + level
  ctx.font = `800 34px ${font()}`;
  const a = ctx.measureText(info.stage).width + 52;
  const b = ctx.measureText(`Level ${info.level}`).width + 52;
  const left = W / 2 - (a + b + 16) / 2;
  pill(ctx, info.stage, left + a / 2, 280, "#7c3aed", "#fff");
  pill(ctx, `Level ${info.level}`, left + a + 16 + b / 2, 280, "#fff", "#4c1d95");

  // the pet on a soft spotlight
  const glow = ctx.createRadialGradient(W / 2, 760, 40, W / 2, 760, 400);
  glow.addColorStop(0, "rgba(255,255,255,0.95)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 360, W, 800);
  const size = 760 * ((200 + 2 * PAD) / 200);
  const offset = 760 * (PAD / 200);
  ctx.drawImage(await svgImage(svg), W / 2 - size / 2, 380 - offset, size, size);

  // stats: three equal tiles, big number over a small label, each squeezed to fit its tile
  const bar = { x: 90, y: 1110, w: W - 180, h: 140 };
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.roundRect(bar.x, bar.y, bar.w, bar.h, 40);
  ctx.fill();
  const tile = bar.w / 3;
  const stats = [
    { value: `🔥 ${info.streak}`, label: plural(info.streak, "den v řadě", "dny v řadě", "dní v řadě") },
    { value: `⭐ ${compactXp(info.xp)}`, label: "XP" },
    { value: `🏆 ${info.achievements}`, label: plural(info.achievements, "achievement", "achievementy", "achievementů") },
  ];
  ctx.textAlign = "center";
  stats.forEach((s, i) => {
    const cx = bar.x + tile * (i + 0.5);
    ctx.font = `800 52px ${font()}`;
    ctx.fillStyle = "#1e1b4b";
    ctx.fillText(s.value, cx, bar.y + 68, tile - 36);
    ctx.font = `700 26px ${font()}`;
    ctx.fillStyle = "#6b7280";
    ctx.fillText(s.label, cx, bar.y + 110, tile - 36);
    if (i) {
      ctx.fillStyle = "#ede9fe";
      ctx.fillRect(bar.x + tile * i - 1, bar.y + 30, 2, bar.h - 60);
    }
  });

  // footer
  ctx.font = `800 40px ${font()}`;
  ctx.fillStyle = "#7c3aed";
  ctx.fillText("nanečisto", W / 2, 1296);
  ctx.font = `600 28px ${font()}`;
  ctx.fillStyle = "#6b7280";
  ctx.fillText(`učím se na Scio s mazlíčkem · ${info.site}`, W / 2, 1333);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/png"));
}

"use client";

// Shareable picture of the pet (1080×1350, the portrait size Instagram, WhatsApp and stories crop well),
// drawn in the browser from the pet SVG already on the page.

export interface PetCardInfo {
  name: string;
  stage: string;
  level: number;
  xp: number;
  streak: number;
  achievements: string;
  site: string;
}

const W = 1080;
const H = 1350;

function svgImage(svg: SVGSVGElement): Promise<HTMLImageElement> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", "800");
  clone.setAttribute("height", "800");
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
  ctx.drawImage(await svgImage(svg), W / 2 - 380, 380, 760, 760);

  // stats
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.roundRect(90, 1110, W - 180, 110, 36);
  ctx.fill();
  ctx.font = `800 38px ${font()}`;
  ctx.fillStyle = "#1e1b4b";
  const stats = [`🔥 ${info.streak} ${info.streak === 1 ? "den" : info.streak > 1 && info.streak < 5 ? "dny" : "dní"}`, `⭐ ${info.xp.toLocaleString("cs-CZ")} XP`, `🏆 ${info.achievements}`];
  stats.forEach((s, i) => ctx.fillText(s, 90 + ((W - 180) / 3) * (i + 0.5), 1178));

  // footer
  ctx.font = `800 40px ${font()}`;
  ctx.fillStyle = "#7c3aed";
  ctx.fillText("nanečisto", W / 2, 1288);
  ctx.font = `600 28px ${font()}`;
  ctx.fillStyle = "#6b7280";
  ctx.fillText(`učím se na Scio s mazlíčkem · ${info.site}`, W / 2, 1326);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/png"));
}

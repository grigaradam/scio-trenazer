import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

// Link preview (Messenger, WhatsApp, Slack…) – a still of the landing page hero.
// Colors mirror the light theme in globals.css.
export const alt = "Nanečisto – Nanečisto teď. Načisto u zkoušky.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const font = (file: string) => readFile(join(process.cwd(), "assets/fonts", file));

const options = ["truhlář – stůl", "kuchař – kuchyně", "zedník – cihla", "malíř – štětec"];

export default async function OpengraphImage() {
  const [display, sansMedium, sansBold] = await Promise.all([
    font("BricolageGrotesque-ExtraBold.ttf"),
    font("PlusJakartaSans-Medium.ttf"),
    font("PlusJakartaSans-Bold.ttf"),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          gap: 56,
          padding: "0 72px",
          fontFamily: "Jakarta",
          color: "#1c1830",
          backgroundColor: "#f7f6fb",
          backgroundImage: "radial-gradient(ellipse at top, #ede9fe, #f7f6fb 70%)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <svg viewBox="0 0 64 64" width="56" height="56" style={{ borderRadius: 17, boxShadow: "0 4px 0 0 #5b21b6" }}>
              <defs>
                <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#8b5cf6" />
                  <stop offset="1" stopColor="#14b8a6" />
                </linearGradient>
              </defs>
              <rect width="64" height="64" rx="19" fill="url(#g)" />
              <circle cx="29" cy="36" r="15" fill="none" stroke="rgba(255,255,255,.5)" strokeWidth="3" strokeDasharray="5 5" strokeLinecap="round" />
              <path d="M20 35.5 28.5 44 49 17" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="49" cy="17" r="3.5" fill="#fde047" />
            </svg>
            <div style={{ display: "flex", fontFamily: "Bricolage", fontSize: 38, letterSpacing: -1 }}>
              nane<span style={{ color: "#7c3aed" }}>čisto</span>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignSelf: "flex-start",
              marginTop: 40,
              padding: "8px 18px",
              borderRadius: 999,
              backgroundColor: "#fff",
              border: "1px solid #e4e1ee",
              fontSize: 22,
              fontWeight: 700,
              color: "#6d28d9",
            }}
          >
            🔒 Soukromá tréninková aplikace
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginTop: 24,
              fontFamily: "Bricolage",
              fontSize: 76,
              lineHeight: 1.02,
              letterSpacing: -2.5,
            }}
          >
            <span>Nanečisto teď.</span>
            <span
              style={{
                backgroundImage: "linear-gradient(90deg, #7c3aed, #14b8a6)",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              Načisto u zkoušky.
            </span>
          </div>

          <div style={{ display: "flex", marginTop: 26, fontSize: 26, lineHeight: 1.4, color: "#6b6684" }}>
            Testy na čas, rozbor každé chyby s AI lektorem a nekonečný trénink úloh, které ti nejdou.
          </div>
        </div>

        <div style={{ display: "flex", position: "relative", width: 420 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: "100%",
              padding: 24,
              borderRadius: 28,
              backgroundColor: "#fff",
              border: "2px solid #e4e1ee",
              boxShadow: "0 25px 50px -12px rgba(76, 29, 149, 0.18)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 18 }}>
              <span style={{ padding: "4px 14px", borderRadius: 999, backgroundColor: "#ede9fe", color: "#6d28d9", fontWeight: 700 }}>
                Ukázka
              </span>
              <span style={{ fontWeight: 700 }}>12:30</span>
            </div>
            <div style={{ display: "flex", marginTop: 16, fontSize: 20, fontWeight: 700, letterSpacing: 0.5 }}>
              PEKAŘ : CHLÉB = ______ : ______
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
              {options.map((o, i) => (
                <div
                  key={o}
                  style={{
                    display: "flex",
                    padding: "11px 16px",
                    borderRadius: 18,
                    fontSize: 18,
                    fontWeight: 700,
                    border: `2px solid ${i === 0 ? "#10b981" : "#e4e1ee"}`,
                    backgroundColor: i === 0 ? "#ecfdf5" : "#fff",
                    color: i === 0 ? "#065f46" : "#1c1830",
                  }}
                >
                  <span style={{ marginRight: 10, color: "#6b6684" }}>{"ABCD"[i]}</span>
                  {o}
                </div>
              ))}
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                marginTop: 18,
                padding: 14,
                borderRadius: 18,
                backgroundColor: "#f1eff8",
                fontSize: 17,
                fontWeight: 500,
              }}
            >
              <span style={{ backgroundColor: "rgba(253, 224, 71, 0.8)", padding: "0 4px", borderRadius: 4 }}>Pekař vyrábí chléb</span>
              <span>&nbsp;→ stejný vztah má jen&nbsp;</span>
              <span style={{ fontWeight: 700 }}>truhlář a stůl</span>
              <span>.</span>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              position: "absolute",
              right: -16,
              top: -22,
              transform: "rotate(6deg)",
              padding: "10px 16px",
              borderRadius: 18,
              backgroundColor: "#f97316",
              color: "#fff",
              fontFamily: "Bricolage",
              fontSize: 24,
              boxShadow: "0 10px 15px -3px rgba(0,0,0,.15)",
            }}
          >
            🔥 12 dní
          </div>
          <div
            style={{
              display: "flex",
              position: "absolute",
              left: -16,
              bottom: -22,
              transform: "rotate(-6deg)",
              padding: "10px 16px",
              borderRadius: 18,
              backgroundColor: "#7c3aed",
              color: "#fff",
              fontFamily: "Bricolage",
              fontSize: 24,
              boxShadow: "0 10px 15px -3px rgba(0,0,0,.15)",
            }}
          >
            +15 XP
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Bricolage", data: display, weight: 800, style: "normal" },
        { name: "Jakarta", data: sansMedium, weight: 500, style: "normal" },
        { name: "Jakarta", data: sansBold, weight: 700, style: "normal" },
      ],
    },
  );
}

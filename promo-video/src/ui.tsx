import React from "react";
import {
  AbsoluteFill,
  interpolate,
  random,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { C, clamp, display, easeOut, gradientText, sans } from "./theme";

/** Opacity + upward slide, starting at `start` (frames). */
export const fadeUp = (frame: number, start: number, distance = 40, duration = 20) => ({
  opacity: interpolate(frame, [start, start + duration], [0, 1], { ...clamp, easing: easeOut }),
  translate: `0px ${interpolate(frame, [start, start + duration], [distance, 0], { ...clamp, easing: easeOut })}px`,
});

/** Bouncy 0→1 spring starting at `start`. */
export const usePop = (start: number, damping = 12) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - start, fps, config: { damping, stiffness: 170, mass: 0.8 } });
};

/** Shared animated backdrop: deep violet with drifting brand glows and a faint grid. */
export const Background: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          width: 1600,
          height: 1600,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(124,58,237,0.42) 0%, rgba(124,58,237,0) 62%)",
          left: -520 + Math.sin(frame / 70) * 120,
          top: -760 + Math.cos(frame / 90) * 90,
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 1500,
          height: 1500,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(20,184,166,0.28) 0%, rgba(20,184,166,0) 62%)",
          right: -560 + Math.cos(frame / 80) * 110,
          bottom: -780 + Math.sin(frame / 65) * 90,
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
          backgroundPosition: `0px ${-frame * 0.4}px`,
          maskImage: "radial-gradient(ellipse at center, black 20%, transparent 75%)",
        }}
      />
    </AbsoluteFill>
  );
};

export const Pill: React.FC<{
  children: React.ReactNode;
  bg: string;
  color: string;
  style?: React.CSSProperties;
}> = ({ children, bg, color, style }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      padding: "10px 22px",
      borderRadius: 999,
      backgroundColor: bg,
      color,
      fontFamily: sans,
      fontWeight: 700,
      fontSize: 26,
      ...style,
    }}
  >
    {children}
  </span>
);

export const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({
  children,
  style,
}) => (
  <div
    style={{
      backgroundColor: C.surface,
      border: `3px solid ${C.border}`,
      borderRadius: 44,
      padding: 44,
      boxShadow: "0 40px 120px rgba(8, 4, 24, 0.55), 0 8px 24px rgba(8, 4, 24, 0.25)",
      color: C.text,
      fontFamily: sans,
      ...style,
    }}
  >
    {children}
  </div>
);

/** Left-hand headline block used by the feature scenes. */
export const SceneText: React.FC<{
  kicker: string;
  title: React.ReactNode;
  subtitle: string;
  accent?: [string, string];
}> = ({ kicker, title, subtitle, accent = [C.brand400, C.teal400] }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ width: 720, display: "flex", flexDirection: "column", gap: 34 }}>
      <div style={fadeUp(frame, 4)}>
        <Pill bg="rgba(255,255,255,0.08)" color={C.brand300} style={{ fontSize: 30, border: "2px solid rgba(255,255,255,0.12)" }}>
          {kicker}
        </Pill>
      </div>
      <div
        style={{
          ...fadeUp(frame, 10, 60),
          fontFamily: display,
          fontWeight: 800,
          fontSize: 108,
          lineHeight: 1,
          letterSpacing: -3,
          color: C.textOnDark,
        }}
      >
        {title}
      </div>
      <div
        style={{
          ...fadeUp(frame, 20),
          fontFamily: sans,
          fontWeight: 500,
          fontSize: 40,
          lineHeight: 1.4,
          color: C.mutedOnDark,
        }}
      >
        {subtitle}
      </div>
      <div
        style={{
          height: 8,
          borderRadius: 8,
          width: interpolate(frame, [26, 56], [0, 180], { ...clamp, easing: easeOut }),
          backgroundImage: `linear-gradient(90deg, ${accent[0]}, ${accent[1]})`,
        }}
      />
    </div>
  );
};

export const Accent: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span style={gradientText(C.brand400, C.teal400)}>{children}</span>
);

/** Two-column feature layout: text left, mock UI right. */
export const FeatureLayout: React.FC<{ left: React.ReactNode; right: React.ReactNode }> = ({
  left,
  right,
}) => (
  <AbsoluteFill
    style={{
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 150px",
    }}
  >
    {left}
    <div style={{ width: 880, display: "flex", justifyContent: "center", position: "relative" }}>{right}</div>
  </AbsoluteFill>
);

/** Mouse pointer that glides in and clicks. Place inside the element it clicks (position: relative). */
export const Cursor: React.FC<{
  appear: number;
  arrive: number;
  from: [number, number];
  to: [number, number];
}> = ({ appear, arrive, from, to }) => {
  const frame = useCurrentFrame();
  const t = { ...clamp, easing: easeOut };
  const press = interpolate(frame, [arrive + 2, arrive + 6, arrive + 12], [1, 0.82, 1], clamp);
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        zIndex: 10,
        opacity: interpolate(frame, [appear, appear + 8, arrive + 40, arrive + 50], [0, 1, 1, 0], clamp),
        translate: `${interpolate(frame, [appear, arrive], [from[0], to[0]], t)}px ${interpolate(frame, [appear, arrive], [from[1], to[1]], t)}px`,
        scale: press,
        filter: "drop-shadow(0 6px 10px rgba(0,0,0,0.35))",
      }}
    >
      <svg width="54" height="80" viewBox="0 0 27 40">
        <path d="M1 1 L1 33 L9 26 L15 39 L21 36 L15 24 L26 24 Z" fill="#fff" stroke="#1c1830" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    </div>
  );
};

/** Deterministic confetti burst centred on its parent. */
export const Burst: React.FC<{ at: number; count?: number; distance?: number; seed?: string }> = ({
  at,
  count = 18,
  distance = 220,
  seed = "burst",
}) => {
  const frame = useCurrentFrame();
  const colors = [C.brand500, C.teal500, C.marker, C.orange, "#e87ba4", C.green];
  const t = frame - at;
  if (t < 0 || t > 40) return null;
  return (
    <div style={{ position: "absolute", left: "50%", top: "50%", width: 0, height: 0, zIndex: 5 }}>
      {new Array(count).fill(0).map((_, i) => {
        const angle = (i / count) * Math.PI * 2 + random(`${seed}-a-${i}`) * 0.6;
        const d = distance * (0.6 + random(`${seed}-d-${i}`) * 0.6);
        const p = interpolate(t, [0, 28], [0, 1], { ...clamp, easing: easeOut });
        const size = 12 + random(`${seed}-s-${i}`) * 12;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              width: size,
              height: size * 0.6,
              borderRadius: 3,
              backgroundColor: colors[i % colors.length],
              translate: `${Math.cos(angle) * d * p}px ${Math.sin(angle) * d * p + t * t * 0.08}px`,
              rotate: `${t * 14 + i * 40}deg`,
              opacity: interpolate(t, [0, 4, 26, 40], [0, 1, 1, 0], clamp),
            }}
          />
        );
      })}
    </div>
  );
};

/** The app's "N" logo tile. */
export const LogoTile: React.FC<{ size: number }> = ({ size }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: size * 0.3,
      display: "grid",
      placeItems: "center",
      backgroundImage: `linear-gradient(135deg, ${C.brand500}, ${C.teal500})`,
      boxShadow: `0 ${size * 0.075}px 0 0 ${C.brand800}, 0 ${size * 0.25}px ${size * 0.6}px rgba(124,58,237,0.45)`,
      fontFamily: display,
      fontWeight: 800,
      fontSize: size * 0.55,
      color: "#fff",
    }}
  >
    N
  </div>
);

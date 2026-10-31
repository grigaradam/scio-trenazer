import clsx from "clsx";
import { useId } from "react";
import type { PetMood, PetNeeds, PetOutfit, PetStage } from "@/lib/pet";

// Hand-drawn SVG pet. Pure: stage + mood + needs + outfit in, picture out (animations are CSS on the wrapper).
// The needs show gradually: low energy droops the ears and eyelids and brings the "z"s, hunger
// makes it thinner and drooling and dreaming of an apple, low joy fades the blush and the colours.

const FULL: PetNeeds = { hunger: 1, energy: 1, joy: 1 };

const BODY: Record<PetStage["code"], { r: number; fill: string; dark: string }> = {
  egg: { r: 0, fill: "#fdf4e3", dark: "#e9d5b5" },
  baby: { r: 44, fill: "#d8ccff", dark: "#b7a5f5" },
  kid: { r: 52, fill: "#c4b5fd", dark: "#a08bf0" },
  teen: { r: 56, fill: "#b19cfb", dark: "#8f74ee" },
  sage: { r: 59, fill: "#a78bfa", dark: "#8466ec" },
  legend: { r: 61, fill: "#a78bfa", dark: "#8466ec" },
};

/** How fast and how high it bobs: bouncy when joyful, slow and low when tired or sad. */
function bob(mood: PetMood, needs: PetNeeds) {
  if (mood === "asleep") return { dur: "6s", lift: "-2px" };
  if (mood === "ecstatic" || mood === "joyful") return { dur: "2.2s", lift: "-11px" };
  if (mood === "sad" || mood === "down") return { dur: "4.6s", lift: "-3px" };
  if (needs.energy < 0.35) return { dur: "5s", lift: "-3.5px" };
  return { dur: "3s", lift: "-7px" };
}

export function PetAvatar({
  stage,
  mood,
  outfit = {},
  needs = FULL,
  animate = false,
  className,
}: {
  stage: PetStage["code"];
  mood: PetMood;
  outfit?: PetOutfit;
  needs?: PetNeeds;
  /** idle bobbing; the shadow and the glow follow the pet up and down */
  animate?: boolean;
  className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const sleepy = mood === "asleep";
  const zs = sleepy ? 3 : needs.energy < 0.08 ? 3 : needs.energy < 0.2 ? 2 : needs.energy < 0.35 ? 1 : 0;
  const glad = stage !== "egg" && (mood === "ecstatic" || mood === "joyful");
  const motion = bob(mood, needs);
  // the glow is centred on the grown-up pet's body; when animated (the big pet) it may reach past the
  // 200×200 box – the svg doesn't clip then – otherwise it stays inside so nothing is cut off
  const glowY = 110;
  const glowR = animate ? 108 : 88;
  return (
    <svg
      viewBox="0 0 200 200"
      className={className}
      role="img"
      aria-label="Tvůj mazlíček"
      overflow={animate ? "visible" : undefined}
      style={animate ? ({ "--pet-bob": motion.dur, "--pet-lift": motion.lift } as React.CSSProperties) : undefined}
    >
      <defs>
        {/* soft, eased falloff (no visible edge); colours are overridden for the dark theme in globals.css */}
        <radialGradient id={`pet-aura-${uid}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" className="pet-aura-0" stopColor="#fef3c7" stopOpacity="1" />
          <stop offset="50%" className="pet-aura-1" stopColor="#fde68a" stopOpacity="0.9" />
          <stop offset="66%" className="pet-aura-2" stopColor="#fde68a" stopOpacity="0.45" />
          <stop offset="83%" className="pet-aura-3" stopColor="#fef3c7" stopOpacity="0.12" />
          <stop offset="100%" className="pet-aura-4" stopColor="#fef3c7" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="pet-shine" cx="35%" cy="30%" r="60%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {stage === "legend" && (
        // a sad or sleeping legend still glows, just dimly
        <g opacity={mood === "sad" || mood === "down" || mood === "asleep" ? 0.45 : undefined}>
          <g className={animate ? "pet-aura-move" : undefined}>
            <circle cx="100" cy={glowY} r={glowR} fill={`url(#pet-aura-${uid})`} />
          </g>
        </g>
      )}
      <ellipse
        cx="100"
        cy="186"
        rx={stage === "egg" ? 34 : 46}
        ry="7"
        fill="#000"
        opacity="0.09"
        className={clsx("pet-shadow", animate && "pet-shadow-move")}
      />
      <g className={animate ? "pet-float" : undefined}>
        {stage === "egg" ? <Egg sleepy={sleepy} /> : <Creature stage={stage} mood={mood} outfit={outfit} needs={needs} />}
      </g>
      {glad &&
        [
          [42, 74, 1, 0],
          [158, 70, 0.8, 0.9],
          [150, 120, 0.6, 1.7],
        ]
          .slice(0, mood === "ecstatic" ? 3 : 2)
          .map(([x, y, s, delay], i) => (
            <path
              key={i}
              className={animate ? "pet-heart" : undefined}
              style={animate ? { animationDelay: `${delay}s` } : undefined}
              transform={`translate(${x} ${y}) scale(${s})`}
              d="M0 4C-6 -1 -9 -4 -9 -7.5C-9 -10.5 -6.5 -12 -4.5 -12C-2.5 -12 -1 -11 0 -9.5C1 -11 2.5 -12 4.5 -12C6.5 -12 9 -10.5 9 -7.5C9 -4 6 -1 0 4Z"
              fill="#f472b6"
            />
          ))}
      {zs > 0 && (
        <g fill="#8b5cf6" fontFamily="inherit" fontWeight="800">
          {[
            [140, 62, 18],
            [152, 44, 14],
            [161, 30, 11],
          ]
            .slice(0, zs)
            .map(([x, y, size], i) => (
              <text key={i} x={x} y={y} fontSize={size} className="pet-z" style={{ animationDelay: `${i * 0.6}s` }}>
                z
              </text>
            ))}
        </g>
      )}
      {stage === "legend" &&
        [
          [36, 70, 7],
          [166, 92, 5],
          [154, 40, 6],
          [44, 140, 4],
        ].map(([x, y, s], i) => (
          <g key={i} className={animate ? "pet-twinkle" : undefined} style={animate ? { animationDelay: `${i * 0.7}s` } : undefined}>
            <Sparkle x={x} y={y} s={s} />
          </g>
        ))}
    </svg>
  );
}

function Sparkle({ x, y, s }: { x: number; y: number; s: number }) {
  return <path d={`M${x} ${y - s}Q${x} ${y} ${x + s} ${y}Q${x} ${y} ${x} ${y + s}Q${x} ${y} ${x - s} ${y}Q${x} ${y} ${x} ${y - s}Z`} fill="#facc15" />;
}

function Egg({ sleepy }: { sleepy: boolean }) {
  return (
    <g>
      <path d="M100 52C128 52 148 98 148 128C148 160 127 182 100 182C73 182 52 160 52 128C52 98 72 52 100 52Z" fill="#fdf4e3" stroke="#e9d5b5" strokeWidth="3" />
      <circle cx="80" cy="100" r="7" fill="#c4b5fd" />
      <circle cx="122" cy="88" r="5" fill="#c4b5fd" />
      <circle cx="126" cy="146" r="8" fill="#c4b5fd" />
      <circle cx="76" cy="152" r="5" fill="#c4b5fd" />
      <path d="M70 124L84 116L92 128L104 118L114 130L128 120" fill="none" stroke="#d6bf98" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <ellipse cx="84" cy="80" rx="10" ry="16" fill="#fff" opacity="0.6" transform="rotate(20 84 80)" />
      {!sleepy && (
        // two curious eyes peeking through the crack
        <g fill="#3b2a6b">
          <circle cx="93" cy="136" r="3.2" />
          <circle cx="109" cy="136" r="3.2" />
        </g>
      )}
    </g>
  );
}

function Creature({ stage, mood, outfit, needs }: { stage: PetStage["code"]; mood: PetMood; outfit: PetOutfit; needs: PetNeeds }) {
  const { r, fill, dark } = BODY[stage];
  const cx = 100;
  const cy = 182 - r - 4; // sits on the ground
  const eyeY = cy - r * 0.12;
  const eyeDx = r * 0.36;
  const big = stage !== "baby";
  const { hunger, energy, joy } = needs;
  const well = (hunger + energy + joy) / 3;
  const saturation = mood === "asleep" ? 0.5 : mood === "sad" || mood === "down" ? 0.35 + 0.35 * well : 0.45 + 0.55 * well;
  const rx = r * (0.86 + 0.14 * hunger); // hungry = thinner
  // ear angle in degrees: tired or unhappy ears hang, joyful ones stand up
  const droop = Math.max(-4, (1 - energy) * 30 + (0.5 - joy) * 24 + (mood === "sad" ? 14 : 0));
  const lid = mood === "asleep" || mood === "ecstatic" ? 0 : Math.max(0, Math.min(0.8, ((0.75 - energy) / 0.75) * 0.8));

  return (
    <g style={saturation < 0.97 ? { filter: `saturate(${saturation.toFixed(2)})` } : undefined}>
      {/* cape goes behind everything */}
      {outfit.back === "cape" && (
        <g>
          <path
            d={`M${cx - r * 0.62} ${cy - r * 0.3}Q${cx - r * 1.2} ${cy + r * 0.5} ${cx - r * 1.12} ${cy + r * 1.0}Q${cx} ${cy + r * 1.12} ${cx + r * 1.12} ${cy + r * 1.0}Q${cx + r * 1.2} ${cy + r * 0.5} ${cx + r * 0.62} ${cy - r * 0.3}Z`}
            fill="#dc2626"
            stroke="#991b1b"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <path d={`M${cx - r * 0.75} ${cy + r * 0.2}Q${cx - r * 0.95} ${cy + r * 0.6} ${cx - r * 0.9} ${cy + r * 0.98}`} stroke="#fff" strokeWidth="2" fill="none" opacity="0.25" />
        </g>
      )}
      {/* tail */}
      {big && <path d={`M${cx + r * 0.8} ${cy + r * 0.5}Q${cx + r * 1.45} ${cy + r * 0.45} ${cx + r * 1.25} ${cy - r * 0.1}Q${cx + r * 1.2} ${cy + r * 0.25} ${cx + r * 0.7} ${cy + r * 0.25}Z`} fill={dark} />}
      {/* wings */}
      {(stage === "teen" || stage === "sage" || stage === "legend") && (
        <g fill="#fff" stroke={dark} strokeWidth="2.5" opacity="0.95">
          <path d={`M${cx - r * 0.85} ${cy}Q${cx - r * 1.55} ${cy - r * 0.55} ${cx - r * 1.35} ${cy + r * 0.15}Q${cx - r * 1.2} ${cy + r * 0.4} ${cx - r * 0.85} ${cy + r * 0.3}Z`} />
          <path d={`M${cx + r * 0.85} ${cy}Q${cx + r * 1.55} ${cy - r * 0.55} ${cx + r * 1.35} ${cy + r * 0.15}Q${cx + r * 1.2} ${cy + r * 0.4} ${cx + r * 0.85} ${cy + r * 0.3}Z`} />
        </g>
      )}
      {/* ears */}
      {big && (
        <g fill={fill} stroke={dark} strokeWidth="3" strokeLinejoin="round">
          <g transform={`rotate(${-droop} ${cx - r * 0.5} ${cy - r * 0.65})`}>
            <path d={`M${cx - r * 0.75} ${cy - r * 0.45}L${cx - r * 0.72} ${cy - r * 1.2}L${cx - r * 0.25} ${cy - r * 0.85}Z`} />
            <path d={`M${cx - r * 0.66} ${cy - r * 0.62}L${cx - r * 0.65} ${cy - r * 1.0}L${cx - r * 0.42} ${cy - r * 0.82}Z`} fill="#fbcfe8" stroke="none" />
          </g>
          <g transform={`rotate(${droop} ${cx + r * 0.5} ${cy - r * 0.65})`}>
            <path d={`M${cx + r * 0.75} ${cy - r * 0.45}L${cx + r * 0.72} ${cy - r * 1.2}L${cx + r * 0.25} ${cy - r * 0.85}Z`} />
            <path d={`M${cx + r * 0.66} ${cy - r * 0.62}L${cx + r * 0.65} ${cy - r * 1.0}L${cx + r * 0.42} ${cy - r * 0.82}Z`} fill="#fbcfe8" stroke="none" />
          </g>
        </g>
      )}
      {/* feet */}
      <ellipse cx={cx - r * 0.42} cy={cy + r * 0.95} rx={r * 0.26} ry={r * 0.14} fill={dark} />
      <ellipse cx={cx + r * 0.42} cy={cy + r * 0.95} rx={r * 0.26} ry={r * 0.14} fill={dark} />
      {/* body */}
      <ellipse cx={cx} cy={cy} rx={rx} ry={r * 0.97} fill={fill} stroke={dark} strokeWidth="3" />
      <ellipse cx={cx} cy={cy + r * 0.38} rx={rx * 0.58} ry={r * 0.45} fill="#fff" opacity="0.45" />
      <ellipse cx={cx} cy={cy} rx={rx} ry={r * 0.97} fill="url(#pet-shine)" />
      {/* rumbling tummy */}
      {hunger < 0.3 && mood !== "asleep" && (
        <g stroke={dark} strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.8">
          <path d={`M${cx - r * 0.2} ${cy + r * 0.5}q4 -4 8 0t8 0`} />
          <path d={`M${cx - r * 0.05} ${cy + r * 0.66}q4 -4 8 0t8 0`} />
        </g>
      )}
      {/* baby: sprout on top and a bit of shell */}
      {stage === "baby" && (
        <>
          <path d={`M${cx} ${cy - r * 0.95}Q${cx - 2} ${cy - r * 1.25} ${cx + 4} ${cy - r * 1.35}`} stroke="#22c55e" strokeWidth="3" fill="none" strokeLinecap="round" />
          <ellipse cx={cx + 10} cy={cy - r * 1.32} rx="8" ry="4.5" fill="#4ade80" transform={`rotate(-25 ${cx + 10} ${cy - r * 1.32})`} />
          <path d={`M${cx - r * 0.95} ${cy + r * 0.55}L${cx - r * 0.6} ${cy + r * 0.38}L${cx - r * 0.35} ${cy + r * 0.6}L${cx - r * 0.05} ${cy + r * 0.42}L${cx + r * 0.3} ${cy + r * 0.6}L${cx + r * 0.6} ${cy + r * 0.4}L${cx + r * 0.95} ${cy + r * 0.55}Q${cx + r * 0.8} ${cy + r * 1.02} ${cx} ${cy + r * 1.02}Q${cx - r * 0.8} ${cy + r * 1.02} ${cx - r * 0.95} ${cy + r * 0.55}Z`} fill="#fdf4e3" stroke="#e9d5b5" strokeWidth="2.5" strokeLinejoin="round" />
        </>
      )}
      {/* sage+: a little star mark */}
      {(stage === "sage" || stage === "legend") && <Sparkle x={cx} y={cy - r * 0.55} s={6} />}
      {/* cheeks */}
      <ellipse cx={cx - eyeDx - r * 0.12} cy={eyeY + r * 0.28} rx={r * 0.13} ry={r * 0.08} fill="#f9a8d4" opacity={mood === "ecstatic" || mood === "joyful" ? 0.95 : 0.05 + 0.75 * joy} />
      <ellipse cx={cx + eyeDx + r * 0.12} cy={eyeY + r * 0.28} rx={r * 0.13} ry={r * 0.08} fill="#f9a8d4" opacity={mood === "ecstatic" || mood === "joyful" ? 0.95 : 0.05 + 0.75 * joy} />
      <Eyes mood={mood} cx={cx} y={eyeY} dx={eyeDx} r={r} lid={lid} lidColor={fill} worried={joy < 0.35 && mood !== "asleep"} />
      <Mouth mood={mood} cx={cx} y={eyeY + r * 0.32} r={r} joy={joy} />
      {/* drool */}
      {hunger < 0.5 && mood !== "asleep" && mood !== "ecstatic" && (
        <path d={`M${cx + r * 0.12} ${eyeY + r * 0.42}q-3 ${4 + (0.5 - hunger) * 14} 0 ${6 + (0.5 - hunger) * 16}q3 -2 0 ${-6 - (0.5 - hunger) * 16}`} fill="#7dd3fc" opacity="0.9" />
      )}
      {/* dreaming of food */}
      {hunger < 0.3 && mood !== "asleep" && <FoodThought x={cx - r * 1.05} y={cy - r * 1.05} />}
      <Outfit outfit={outfit} cx={cx} cy={cy} r={r} eyeY={eyeY} eyeDx={eyeDx} />
    </g>
  );
}

function FoodThought({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <circle cx={x + 26} cy={y + 30} r="3" fill="#fff" stroke="#e5e7eb" strokeWidth="1.5" />
      <circle cx={x + 18} cy={y + 20} r="5" fill="#fff" stroke="#e5e7eb" strokeWidth="1.5" />
      <ellipse cx={x} cy={y} rx="17" ry="14" fill="#fff" stroke="#e5e7eb" strokeWidth="1.5" />
      {/* apple */}
      <path d={`M${x} ${y - 3}c-4 -4 -11 -2 -11 5c0 6 5 10 8 10c1.5 0 2 -1 3 -1s1.5 1 3 1c3 0 8 -4 8 -10c0 -7 -7 -9 -11 -5z`} fill="#ef4444" />
      <path d={`M${x} ${y - 3}q0 -4 2 -6`} stroke="#78350f" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <ellipse cx={x + 4} cy={y - 8} rx="3.5" ry="1.8" fill="#22c55e" transform={`rotate(-30 ${x + 4} ${y - 8})`} />
    </g>
  );
}

function Eyes({
  mood,
  cx,
  y,
  dx,
  r,
  lid,
  lidColor,
  worried,
}: {
  mood: PetMood;
  cx: number;
  y: number;
  dx: number;
  r: number;
  /** 0 = wide awake, 0.8 = barely open */
  lid: number;
  lidColor: string;
  worried: boolean;
}) {
  const ink = "#2e1f5e";
  const clip = `pet-eye-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  if (mood === "asleep")
    return (
      <g stroke={ink} strokeWidth="3" fill="none" strokeLinecap="round">
        <path d={`M${cx - dx - 7} ${y}Q${cx - dx} ${y + 6} ${cx - dx + 7} ${y}`} />
        <path d={`M${cx + dx - 7} ${y}Q${cx + dx} ${y + 6} ${cx + dx + 7} ${y}`} />
      </g>
    );
  if (mood === "ecstatic")
    return (
      <g stroke={ink} strokeWidth="3.5" fill="none" strokeLinecap="round">
        <path d={`M${cx - dx - 7} ${y + 3}Q${cx - dx} ${y - 7} ${cx - dx + 7} ${y + 3}`} />
        <path d={`M${cx + dx - 7} ${y + 3}Q${cx + dx} ${y - 7} ${cx + dx + 7} ${y + 3}`} />
      </g>
    );
  const er = r * 0.13;
  const eh = er * 1.15;
  return (
    <g>
      {[-1, 1].map((s) => {
        const ex = cx + s * dx;
        return (
          <g key={s}>
            <clipPath id={`${clip}${s}`}>
              <ellipse cx={ex} cy={y} rx={er} ry={eh} />
            </clipPath>
            <ellipse cx={ex} cy={y} rx={er} ry={eh} fill={ink} />
            <circle cx={ex + er * 0.35} cy={y - er * 0.4} r={er * (mood === "joyful" ? 0.46 : 0.38)} fill="#fff" />
            <circle cx={ex - er * 0.3} cy={y + er * 0.4} r={er * (mood === "joyful" ? 0.24 : 0.16)} fill="#fff" />
            {mood === "joyful" && <Sparkle x={ex - er * 0.2} y={y - er * 0.15} s={er * 0.32} />}
            {lid > 0 && (
              <g clipPath={`url(#${clip}${s})`}>
                <rect x={ex - er - 1} y={y - eh - 1} width={er * 2 + 2} height={eh * 2 * lid + 1} fill={lidColor} />
                <path d={`M${ex - er} ${y - eh + eh * 2 * lid}h${er * 2}`} stroke={ink} strokeWidth="2" />
              </g>
            )}
          </g>
        );
      })}
      {(mood === "sad" || mood === "down" || worried) && (
        <g stroke={ink} strokeWidth="2.5" strokeLinecap="round">
          <path d={`M${cx - dx - 8} ${y - er * 1.6}L${cx - dx + 6} ${y - er * 2.3}`} />
          <path d={`M${cx + dx + 8} ${y - er * 1.6}L${cx + dx - 6} ${y - er * 2.3}`} />
        </g>
      )}
      {/* tears: one when down, both streaming when sad */}
      {(mood === "sad" ? [-1, 1] : mood === "down" ? [1] : []).map((s) => (
        <path
          key={s}
          className="pet-tear"
          style={{ animationDelay: `${s > 0 ? 0 : 1.1}s` }}
          d={`M${cx + s * (dx + er * 0.9)} ${y + er * 0.9}q-3.5 7 0 9.5q3.5 -2.5 0 -9.5`}
          fill="#7dd3fc"
        />
      ))}
    </g>
  );
}

function Mouth({ mood, cx, y, r, joy }: { mood: PetMood; cx: number; y: number; r: number; joy: number }) {
  const w = r * 0.16;
  const ink = "#2e1f5e";
  // a plain mouth bends with joy: a wide smile when it's glad, a frown when it's not
  const curve = (bend: number, width = 1) => {
    const lift = bend < 0 ? w * 0.7 : 0;
    return (
      <path
        d={`M${cx - w * width} ${y + lift}Q${cx} ${y + lift + w * bend * 1.3} ${cx + w * width} ${y + lift}`}
        stroke={ink}
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
    );
  };
  switch (mood) {
    case "ecstatic":
    case "joyful":
      return (
        <g>
          <path d={`M${cx - w * 1.3} ${y - 2}Q${cx} ${y + w * 2.2} ${cx + w * 1.3} ${y - 2}Z`} fill={ink} />
          <path d={`M${cx - w * 0.6} ${y + w * 0.9}Q${cx} ${y + w * 0.4} ${cx + w * 0.6} ${y + w * 0.9}Q${cx} ${y + w * 1.4} ${cx - w * 0.6} ${y + w * 0.9}Z`} fill="#fb7185" />
        </g>
      );
    case "happy":
      return curve(0.7 + 0.5 * joy, 1.05);
    case "ok":
      return curve(Math.max(0.15, joy * 0.9), 0.75);
    case "down":
      return curve(-0.55, 0.75);
    case "hungry":
      return <ellipse cx={cx} cy={y + 3} rx={w * 0.55} ry={w * 0.7} fill={ink} />;
    case "tired":
      return <ellipse cx={cx} cy={y + 4} rx={w * 0.7} ry={w * 0.9} fill={ink} opacity="0.85" />;
    case "sad":
      return (
        <path
          d={`M${cx - w * 0.9} ${y + w}Q${cx - w * 0.45} ${y + w * 0.1} ${cx} ${y + w * 0.45}Q${cx + w * 0.45} ${y + w * 0.1} ${cx + w * 0.9} ${y + w}`}
          stroke={ink}
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    case "asleep":
      return <ellipse cx={cx} cy={y + 3} rx={w * 0.35} ry={w * 0.25} fill={ink} />;
  }
}

function Outfit({ outfit, cx, cy, r, eyeY, eyeDx }: { outfit: PetOutfit; cx: number; cy: number; r: number; eyeY: number; eyeDx: number }) {
  const top = cy - r * 0.97;
  return (
    <g>
      {outfit.neck === "scarf" && (
        <g>
          <path d={`M${cx - r * 0.86} ${cy + r * 0.42}Q${cx} ${cy + r * 0.66} ${cx + r * 0.86} ${cy + r * 0.42}L${cx + r * 0.8} ${cy + r * 0.62}Q${cx} ${cy + r * 0.86} ${cx - r * 0.8} ${cy + r * 0.62}Z`} fill="#ef4444" />
          <path d={`M${cx + r * 0.3} ${cy + r * 0.66}l6 ${r * 0.34}l12 -3l-5 ${-r * 0.36}Z`} fill="#dc2626" />
          <path d={`M${cx - r * 0.55} ${cy + r * 0.52}L${cx - r * 0.5} ${cy + r * 0.7}M${cx - r * 0.15} ${cy + r * 0.58}L${cx - r * 0.13} ${cy + r * 0.76}`} stroke="#fff" strokeWidth="3" opacity="0.6" />
        </g>
      )}
      {outfit.neck === "medal" && (
        <g>
          <path d={`M${cx - r * 0.4} ${cy + r * 0.4}L${cx} ${cy + r * 0.62}L${cx + r * 0.4} ${cy + r * 0.4}`} stroke="#3b82f6" strokeWidth="5" fill="none" strokeLinejoin="round" />
          <circle cx={cx} cy={cy + r * 0.7} r={r * 0.13} fill="#facc15" stroke="#ca8a04" strokeWidth="2.5" />
          <Sparkle x={cx} y={cy + r * 0.7} s={r * 0.07} />
        </g>
      )}
      {outfit.face === "glasses" && (
        <g stroke="#1f2937" strokeWidth="3" fill="#fff" fillOpacity="0.25">
          <circle cx={cx - eyeDx} cy={eyeY} r={r * 0.22} />
          <circle cx={cx + eyeDx} cy={eyeY} r={r * 0.22} />
          <path d={`M${cx - eyeDx + r * 0.22} ${eyeY}Q${cx} ${eyeY - 6} ${cx + eyeDx - r * 0.22} ${eyeY}`} fill="none" />
        </g>
      )}
      {outfit.face === "shades" && (
        <g>
          <path d={`M${cx - eyeDx - r * 0.27} ${eyeY - r * 0.12}H${cx + eyeDx + r * 0.27}`} stroke="#111827" strokeWidth="3.5" />
          <path d={`M${cx - eyeDx - r * 0.25} ${eyeY - r * 0.12}h${r * 0.5}q0 ${r * 0.32} ${-r * 0.25} ${r * 0.32}q${-r * 0.25} 0 ${-r * 0.25} ${-r * 0.32}Z`} fill="#111827" />
          <path d={`M${cx + eyeDx - r * 0.25} ${eyeY - r * 0.12}h${r * 0.5}q0 ${r * 0.32} ${-r * 0.25} ${r * 0.32}q${-r * 0.25} 0 ${-r * 0.25} ${-r * 0.32}Z`} fill="#111827" />
          <path d={`M${cx - eyeDx - r * 0.12} ${eyeY - r * 0.04}l${r * 0.1} 0`} stroke="#fff" strokeWidth="2.5" strokeLinecap="round" opacity="0.8" />
        </g>
      )}
      {outfit.head === "flower" && (
        <g transform={`translate(${cx + r * 0.42} ${top + r * 0.18})`}>
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse key={a} cx="0" cy="-8" rx="5.5" ry="8" fill="#fde047" transform={`rotate(${a})`} />
          ))}
          <circle r="5" fill="#f97316" />
        </g>
      )}
      {outfit.head === "bow" && (
        <g transform={`translate(${cx + r * 0.38} ${top + r * 0.12})`} fill="#f472b6" stroke="#db2777" strokeWidth="2">
          <path d="M0 0L-15 -9Q-19 0 -15 9Z" />
          <path d="M0 0L15 -9Q19 0 15 9Z" />
          <circle r="4.5" />
        </g>
      )}
      {outfit.head === "cap" && (
        <g transform={`translate(${cx} ${top + 4})`}>
          <path d={`M${-r * 0.42} -2V-12H${r * 0.42}V-2Q0 6 ${-r * 0.42} -2Z`} fill="#1f2937" />
          <path d={`M0 -26L${r * 0.75} -14L0 -2L${-r * 0.75} -14Z`} fill="#111827" />
          <path d={`M${r * 0.55} -16V2`} stroke="#facc15" strokeWidth="2.5" />
          <circle cx={r * 0.55} cy="4" r="3.5" fill="#facc15" />
        </g>
      )}
      {outfit.neck === "bowtie" && (
        <g transform={`translate(${cx} ${cy + r * 0.5})`} fill="#1e3a8a" stroke="#172554" strokeWidth="1.5" strokeLinejoin="round">
          <path d="M0 0L-15 -9Q-18 0 -15 9Z" />
          <path d="M0 0L15 -9Q18 0 15 9Z" />
          <rect x="-4" y="-5" width="8" height="10" rx="2.5" fill="#3b82f6" />
          <circle cx="-9" cy="-2" r="1.3" fill="#fff" stroke="none" />
          <circle cx="9" cy="2" r="1.3" fill="#fff" stroke="none" />
        </g>
      )}
      {outfit.face === "monocle" && (
        <g fill="none" stroke="#ca8a04" strokeWidth="2.5">
          <circle cx={cx + eyeDx} cy={eyeY} r={r * 0.22} fill="#fff" fillOpacity="0.25" />
          <path d={`M${cx + eyeDx + r * 0.16} ${eyeY + r * 0.16}Q${cx + eyeDx + r * 0.35} ${cy + r * 0.25} ${cx + eyeDx + r * 0.1} ${cy + r * 0.45}`} strokeWidth="1.5" strokeDasharray="2 2" />
        </g>
      )}
      {outfit.hand === "book" && (
        <g transform={`translate(${cx - r * 0.82} ${cy + r * 0.42}) rotate(-12)`}>
          <rect x="-14" y="-11" width="28" height="22" rx="3" fill="#2563eb" stroke="#1e3a8a" strokeWidth="2" />
          <rect x="-11" y="-8" width="22" height="16" rx="1.5" fill="#fef3c7" />
          <path d="M0 -8V8" stroke="#1e3a8a" strokeWidth="1.5" />
          <path d="M-8 -3h5M-8 1h5M3 -3h5M3 1h5" stroke="#94a3b8" strokeWidth="1.2" />
          <ellipse cx="13" cy="6" rx="6" ry="5" fill="#d8ccff" stroke="#8466ec" strokeWidth="2" />
        </g>
      )}
      {outfit.hand === "trophy" && (
        <g transform={`translate(${cx - r * 0.85} ${cy + r * 0.38})`}>
          <path d="M-10 -14H10V-6Q10 6 0 7Q-10 6 -10 -6Z" fill="#facc15" stroke="#ca8a04" strokeWidth="2" />
          <path d="M-10 -11Q-17 -11 -16 -5Q-15 0 -9 0M10 -11Q17 -11 16 -5Q15 0 9 0" fill="none" stroke="#ca8a04" strokeWidth="2" />
          <path d="M-2 7V12H2V7" fill="#facc15" stroke="#ca8a04" strokeWidth="1.5" />
          <rect x="-8" y="12" width="16" height="5" rx="1.5" fill="#92400e" />
          <Sparkle x={-3} y={-7} s={3} />
          <ellipse cx="11" cy="9" rx="6" ry="5" fill="#d8ccff" stroke="#8466ec" strokeWidth="2" />
        </g>
      )}
      {outfit.head === "headphones" && (
        <g>
          <path d={`M${cx - r * 0.9} ${eyeY - r * 0.05}Q${cx - r * 0.95} ${top - r * 0.25} ${cx} ${top - r * 0.22}Q${cx + r * 0.95} ${top - r * 0.25} ${cx + r * 0.9} ${eyeY - r * 0.05}`} fill="none" stroke="#334155" strokeWidth="5" strokeLinecap="round" />
          <rect x={cx - r * 1.07} y={eyeY - r * 0.22} width={r * 0.3} height={r * 0.42} rx={r * 0.1} fill="#f43f5e" stroke="#334155" strokeWidth="2.5" />
          <rect x={cx + r * 0.77} y={eyeY - r * 0.22} width={r * 0.3} height={r * 0.42} rx={r * 0.1} fill="#f43f5e" stroke="#334155" strokeWidth="2.5" />
        </g>
      )}
      {outfit.head === "wizard" && (
        <g transform={`translate(${cx} ${top + 8})`}>
          <path d={`M${-r * 0.5} 0Q-4 -30 6 -58Q10 -40 ${r * 0.5} 0Z`} fill="#6d28d9" stroke="#4c1d95" strokeWidth="2.5" strokeLinejoin="round" />
          <ellipse cx="0" cy="0" rx={r * 0.78} ry="7" fill="#7c3aed" stroke="#4c1d95" strokeWidth="2.5" />
          <Sparkle x={-6} y={-22} s={5} />
          <Sparkle x={6} y={-40} s={3.5} />
          <circle cx={r * 0.18} cy="-10" r="2" fill="#fde047" />
        </g>
      )}
      {outfit.head === "halo" && (
        <g>
          <ellipse cx={cx} cy={top - 12} rx={r * 0.5} ry="7" fill="none" stroke="#fde047" strokeWidth="6" opacity="0.5" />
          <ellipse cx={cx} cy={top - 12} rx={r * 0.5} ry="7" fill="none" stroke="#facc15" strokeWidth="3" />
        </g>
      )}
      {outfit.head === "crown" && (
        <g transform={`translate(${cx} ${top + 6})`}>
          <path d="M-22 0L-24 -22L-11 -10L0 -28L11 -10L24 -22L22 0Z" fill="#facc15" stroke="#ca8a04" strokeWidth="2.5" strokeLinejoin="round" />
          <circle cx="0" cy="-8" r="3.5" fill="#f43f5e" />
          <circle cx="-13" cy="-5" r="2.5" fill="#38bdf8" />
          <circle cx="13" cy="-5" r="2.5" fill="#38bdf8" />
        </g>
      )}
    </g>
  );
}

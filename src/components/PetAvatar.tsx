import type { PetMood, PetOutfit, PetStage } from "@/lib/pet";

// Hand-drawn SVG pet. Pure: stage + mood + outfit in, picture out (animations are CSS on the wrapper).

const BODY: Record<PetStage["code"], { r: number; fill: string; dark: string }> = {
  egg: { r: 0, fill: "#fdf4e3", dark: "#e9d5b5" },
  baby: { r: 44, fill: "#d8ccff", dark: "#b7a5f5" },
  kid: { r: 52, fill: "#c4b5fd", dark: "#a08bf0" },
  teen: { r: 56, fill: "#b19cfb", dark: "#8f74ee" },
  sage: { r: 59, fill: "#a78bfa", dark: "#8466ec" },
  legend: { r: 61, fill: "#a78bfa", dark: "#8466ec" },
};

export function PetAvatar({
  stage,
  mood,
  outfit = {},
  className,
}: {
  stage: PetStage["code"];
  mood: PetMood;
  outfit?: PetOutfit;
  className?: string;
}) {
  const sleepy = mood === "asleep";
  return (
    <svg viewBox="0 0 200 200" className={className} role="img" aria-label="Tvůj mazlíček">
      <defs>
        <radialGradient id="pet-aura" cx="50%" cy="55%" r="50%">
          <stop offset="0%" stopColor="#fde68a" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#fde68a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="pet-shine" cx="35%" cy="30%" r="60%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {stage === "legend" && <circle cx="100" cy="118" r="92" fill="url(#pet-aura)" />}
      <ellipse cx="100" cy="186" rx={stage === "egg" ? 34 : 46} ry="7" fill="#000" opacity="0.09" />
      {stage === "egg" ? <Egg sleepy={sleepy} /> : <Creature stage={stage} mood={mood} outfit={outfit} />}
      {sleepy && (
        <g fill="#8b5cf6" fontFamily="inherit" fontWeight="800" opacity="0.7">
          <text x="140" y="62" fontSize="18">z</text>
          <text x="152" y="44" fontSize="14">z</text>
          <text x="161" y="30" fontSize="11">z</text>
        </g>
      )}
      {stage === "legend" &&
        [
          [36, 70, 7],
          [166, 92, 5],
          [154, 40, 6],
          [44, 140, 4],
        ].map(([x, y, s], i) => <Sparkle key={i} x={x} y={y} s={s} />)}
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

function Creature({ stage, mood, outfit }: { stage: PetStage["code"]; mood: PetMood; outfit: PetOutfit }) {
  const { r, fill, dark } = BODY[stage];
  const cx = 100;
  const cy = 182 - r - 4; // sits on the ground
  const eyeY = cy - r * 0.12;
  const eyeDx = r * 0.36;
  const big = stage !== "baby";
  const muted = mood === "sad" || mood === "asleep";

  return (
    <g style={muted ? { filter: "saturate(0.6)" } : undefined}>
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
          <path d={`M${cx - r * 0.75} ${cy - r * 0.45}L${cx - r * 0.72} ${cy - r * 1.2}L${cx - r * 0.25} ${cy - r * 0.85}Z`} />
          <path d={`M${cx + r * 0.75} ${cy - r * 0.45}L${cx + r * 0.72} ${cy - r * 1.2}L${cx + r * 0.25} ${cy - r * 0.85}Z`} />
          <path d={`M${cx - r * 0.66} ${cy - r * 0.62}L${cx - r * 0.65} ${cy - r * 1.0}L${cx - r * 0.42} ${cy - r * 0.82}Z`} fill="#fbcfe8" stroke="none" />
          <path d={`M${cx + r * 0.66} ${cy - r * 0.62}L${cx + r * 0.65} ${cy - r * 1.0}L${cx + r * 0.42} ${cy - r * 0.82}Z`} fill="#fbcfe8" stroke="none" />
        </g>
      )}
      {/* feet */}
      <ellipse cx={cx - r * 0.42} cy={cy + r * 0.95} rx={r * 0.26} ry={r * 0.14} fill={dark} />
      <ellipse cx={cx + r * 0.42} cy={cy + r * 0.95} rx={r * 0.26} ry={r * 0.14} fill={dark} />
      {/* body */}
      <ellipse cx={cx} cy={cy} rx={r} ry={r * 0.97} fill={fill} stroke={dark} strokeWidth="3" />
      <ellipse cx={cx} cy={cy + r * 0.38} rx={r * 0.58} ry={r * 0.45} fill="#fff" opacity="0.45" />
      <ellipse cx={cx} cy={cy} rx={r} ry={r * 0.97} fill="url(#pet-shine)" />
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
      <ellipse cx={cx - eyeDx - r * 0.12} cy={eyeY + r * 0.28} rx={r * 0.13} ry={r * 0.08} fill="#f9a8d4" opacity={mood === "ecstatic" ? 0.95 : 0.7} />
      <ellipse cx={cx + eyeDx + r * 0.12} cy={eyeY + r * 0.28} rx={r * 0.13} ry={r * 0.08} fill="#f9a8d4" opacity={mood === "ecstatic" ? 0.95 : 0.7} />
      <Eyes mood={mood} cx={cx} y={eyeY} dx={eyeDx} r={r} />
      <Mouth mood={mood} cx={cx} y={eyeY + r * 0.32} r={r} />
      <Outfit outfit={outfit} cx={cx} cy={cy} r={r} eyeY={eyeY} eyeDx={eyeDx} />
    </g>
  );
}

function Eyes({ mood, cx, y, dx, r }: { mood: PetMood; cx: number; y: number; dx: number; r: number }) {
  const ink = "#2e1f5e";
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
  return (
    <g>
      {[-1, 1].map((s) => (
        <g key={s}>
          <ellipse cx={cx + s * dx} cy={y} rx={er} ry={er * 1.15} fill={ink} />
          <circle cx={cx + s * dx + er * 0.35} cy={y - er * 0.4} r={er * 0.38} fill="#fff" />
          <circle cx={cx + s * dx - er * 0.3} cy={y + er * 0.4} r={er * 0.16} fill="#fff" />
        </g>
      ))}
      {mood === "sad" && (
        <g stroke={ink} strokeWidth="2.5" strokeLinecap="round">
          <path d={`M${cx - dx - 8} ${y - er * 1.6}L${cx - dx + 6} ${y - er * 2.3}`} />
          <path d={`M${cx + dx + 8} ${y - er * 1.6}L${cx + dx - 6} ${y - er * 2.3}`} />
        </g>
      )}
      {mood === "sad" && <path d={`M${cx + dx + er * 0.9} ${y + er}q-3 7 0 9q3 -2 0 -9`} fill="#7dd3fc" />}
    </g>
  );
}

function Mouth({ mood, cx, y, r }: { mood: PetMood; cx: number; y: number; r: number }) {
  const w = r * 0.16;
  const ink = "#2e1f5e";
  switch (mood) {
    case "ecstatic":
      return (
        <g>
          <path d={`M${cx - w * 1.3} ${y - 2}Q${cx} ${y + w * 2.2} ${cx + w * 1.3} ${y - 2}Z`} fill={ink} />
          <path d={`M${cx - w * 0.6} ${y + w * 0.9}Q${cx} ${y + w * 0.4} ${cx + w * 0.6} ${y + w * 0.9}Q${cx} ${y + w * 1.4} ${cx - w * 0.6} ${y + w * 0.9}Z`} fill="#fb7185" />
        </g>
      );
    case "happy":
      return <path d={`M${cx - w} ${y}Q${cx} ${y + w * 1.2} ${cx + w} ${y}`} stroke={ink} strokeWidth="3" fill="none" strokeLinecap="round" />;
    case "ok":
      return <path d={`M${cx - w * 0.7} ${y + 1}Q${cx} ${y + w * 0.6} ${cx + w * 0.7} ${y + 1}`} stroke={ink} strokeWidth="3" fill="none" strokeLinecap="round" />;
    case "hungry":
      return <ellipse cx={cx} cy={y + 3} rx={w * 0.55} ry={w * 0.7} fill={ink} />;
    case "sad":
      return <path d={`M${cx - w * 0.8} ${y + w * 0.8}Q${cx} ${y - w * 0.2} ${cx + w * 0.8} ${y + w * 0.8}`} stroke={ink} strokeWidth="3" fill="none" strokeLinecap="round" />;
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

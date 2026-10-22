// Synthesizes the promo's background music and UI sound effects into public/audio/.
// Everything is generated from scratch (no samples), so there are no licensing concerns.
// Run: node scripts/synth-audio.mjs
import fs from "node:fs";
import path from "node:path";

const SR = 48000;
const OUT = path.join(import.meta.dirname, "..", "public", "audio");
const BPM = 120; // 1 beat = 0.5 s = 15 frames at 30 fps
const BEAT = 60 / BPM;
const VIDEO_SECONDS = 1135 / 30;

// ---------- helpers ----------
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const TAU = Math.PI * 2;

function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Biquad {
  constructor(type, freq, q = 0.707) {
    this.type = type;
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
    this.set(freq, q);
  }
  set(freq, q = this.q) {
    this.q = q;
    const w = (TAU * Math.min(freq, SR * 0.45)) / SR;
    const cos = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    let b0, b1, b2;
    if (this.type === "lowpass") [b0, b1, b2] = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2];
    else if (this.type === "highpass") [b0, b1, b2] = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
    else [b0, b1, b2] = [alpha, 0, -alpha]; // bandpass
    const a0 = 1 + alpha;
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = (-2 * cos) / a0;
    this.a2 = (1 - alpha) / a0;
  }
  process(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/** Small Freeverb-style stereo reverb. */
function reverb(input, { room = 0.84, damp = 0.3, wet = 1 } = {}) {
  const combs = [1557, 1617, 1491, 1422, 1277, 1356, 1188, 1116];
  const allpasses = [556, 441, 341, 225];
  const run = (spread) => {
    const out = new Float32Array(input.length);
    const cb = combs.map((d) => ({ buf: new Float32Array(Math.round((d + spread) * (SR / 44100))), i: 0, f: 0 }));
    const ab = allpasses.map((d) => ({ buf: new Float32Array(Math.round((d + spread) * (SR / 44100))), i: 0 }));
    for (let n = 0; n < input.length; n++) {
      const x = input[n] * 0.015;
      let s = 0;
      for (const c of cb) {
        const y = c.buf[c.i];
        c.f = y * (1 - damp) + c.f * damp;
        c.buf[c.i] = x + c.f * room;
        c.i = (c.i + 1) % c.buf.length;
        s += y;
      }
      for (const a of ab) {
        const y = a.buf[a.i];
        a.buf[a.i] = s + y * 0.5;
        a.i = (a.i + 1) % a.buf.length;
        s = y - s;
      }
      out[n] = s * wet;
    }
    return out;
  };
  return [run(0), run(23)];
}

function writeWav(name, L, R = L, peak = 0.89) {
  let max = 0;
  for (let i = 0; i < L.length; i++) max = Math.max(max, Math.abs(L[i]), Math.abs(R[i]));
  const gain = max > 0 ? peak / max : 1;
  const data = Buffer.alloc(L.length * 4);
  for (let i = 0; i < L.length; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * gain)) * 32767), i * 4);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * gain)) * 32767), i * 4 + 2);
  }
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(2, 22);
  h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * 4, 28);
  h.writeUInt16LE(4, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(path.join(OUT, `${name}.wav`), Buffer.concat([h, data]));
  console.log(`✓ ${name}.wav  ${(L.length / SR).toFixed(2)} s`);
}

const buf = (seconds) => new Float32Array(Math.ceil(seconds * SR));

/** Bell/pluck tone added into `out` at time t. */
function addTone(out, t, freq, { dur = 0.4, amp = 0.5, decay = 6, partials = [[1, 1]], attack = 0.003 } = {}) {
  const start = Math.floor(t * SR);
  const len = Math.floor(dur * SR);
  for (let i = 0; i < len && start + i < out.length; i++) {
    const s = i / SR;
    const env = Math.min(1, s / attack) * Math.exp(-decay * s);
    let v = 0;
    for (const [mul, a] of partials) v += Math.sin(TAU * freq * mul * s) * a;
    out[start + i] += v * env * amp;
  }
}

// ---------- music ----------
function music() {
  const total = VIDEO_SECONDS + 0.2;
  const N = Math.ceil(total * SR);
  const L = new Float32Array(N);
  const R = new Float32Array(N);
  const padL = new Float32Array(N);
  const padR = new Float32Array(N);
  const pluck = new Float32Array(N);
  const bass = new Float32Array(N);
  const drums = new Float32Array(N);
  const send = new Float32Array(N);
  const rand = rng(7);

  // 4-second chord blocks: Fmaj7 – Cadd9/E – Dm7 – Bbmaj7, ending on F.
  const chords = [
    { pad: [53, 57, 60, 64], root: 41 },
    { pad: [52, 55, 60, 62], root: 36 },
    { pad: [50, 53, 57, 60], root: 38 },
    { pad: [46, 50, 53, 57], root: 34 },
  ];
  const BLOCK = 8 * BEAT;
  const OUTRO = 32; // seconds: drums out, final chord rings
  const chordAt = (t) => (t >= OUTRO ? chords[0] : chords[Math.floor(t / BLOCK) % 4]);

  // Pad: detuned saws per chord block, crossfaded.
  const blocks = [];
  for (let t = 0; t < OUTRO; t += BLOCK) blocks.push([t, t + BLOCK, chordAt(t)]);
  blocks.push([OUTRO, total, chords[0]]);
  for (const [t0, t1, chord] of blocks) {
    const s0 = Math.max(0, Math.floor((t0 - 0.05) * SR));
    const s1 = Math.min(N, Math.floor((t1 + 0.6) * SR));
    chord.pad.forEach((m, ni) => {
      [-8, 0, 8].forEach((cents, vi) => {
        const f = mtof(m) * 2 ** (cents / 1200);
        let ph = rand();
        const pan = vi === 0 ? 0.8 : vi === 2 ? 0.2 : 0.5;
        for (let n = s0; n < s1; n++) {
          const t = n / SR;
          const env = Math.min(1, (t - t0 + 0.05) / 0.5) * Math.min(1, Math.max(0, (t1 + 0.6 - t) / 0.6));
          ph += f / SR;
          ph -= Math.floor(ph);
          const v = (2 * ph - 1) * env * 0.05 * (ni === 0 ? 1.1 : 1);
          padL[n] += v * (1 - pan);
          padR[n] += v * pan;
        }
      });
    });
  }
  const lpL = new Biquad("lowpass", 800, 0.8);
  const lpR = new Biquad("lowpass", 800, 0.8);
  for (let n = 0; n < N; n++) {
    const t = n / SR;
    if (n % 64 === 0) {
      const open = t < 4 ? 450 + (t / 4) * 1000 : 1450;
      const cut = open + Math.sin(TAU * 0.11 * t) * 250;
      lpL.set(cut);
      lpR.set(cut);
    }
    padL[n] = lpL.process(padL[n]);
    padR[n] = lpR.process(padR[n]);
  }

  // Pluck arpeggio on 8th notes (enters at 2 s).
  const arp = [0, 2, 1, 3, 2, 1, 3, 2];
  for (let i = 0; ; i++) {
    const t = 2 + i * (BEAT / 2);
    if (t > total - 1.2) break;
    const chord = chordAt(t);
    const m = chord.pad[arp[i % 8]] + 12;
    const accent = i % 2 === 0 ? 1 : 0.7;
    addTone(pluck, t, mtof(m), {
      dur: 0.5,
      amp: 0.16 * accent * (t >= OUTRO ? Math.max(0, 1 - (t - OUTRO) / 4) : 1),
      decay: 9,
      partials: [
        [1, 1],
        [2, 0.35],
        [3, 0.12],
      ],
    });
  }

  // Drums & bass between 4 s and the outro.
  const kickTimes = [];
  for (let b = 0; ; b++) {
    const t = 4 + b * BEAT;
    if (t >= OUTRO) break;
    kickTimes.push(t);
    // kick
    const ks = Math.floor(t * SR);
    let ph = 0;
    for (let i = 0; i < 0.4 * SR; i++) {
      const s = i / SR;
      ph += (45 + 85 * Math.exp(-s * 28)) / SR;
      drums[ks + i] += Math.sin(TAU * ph) * Math.exp(-s * 9) * 0.55;
    }
    // offbeat hat
    const hs = Math.floor((t + BEAT / 2) * SR);
    const hp = new Biquad("highpass", 7000);
    for (let i = 0; i < 0.06 * SR; i++) {
      const v = hp.process(rand() * 2 - 1) * Math.exp(-(i / SR) * 60) * 0.12;
      drums[hs + i] += v;
    }
    // clap on 2 and 4 from 8 s
    if (t >= 8 && b % 2 === 1) {
      const bp = new Biquad("bandpass", 1500, 0.9);
      for (let i = 0; i < 0.25 * SR; i++) {
        const s = i / SR;
        const flutter = s < 0.03 ? (Math.floor(s / 0.01) % 2 === 0 ? 1 : 0.4) : 1;
        const v = bp.process(rand() * 2 - 1) * Math.exp(-s * 18) * flutter * 0.4;
        drums[ks + i] += v;
        send[ks + i] += v * 0.6;
      }
    }
    // bass: root on the beat, octave pickup on the "and" of beat 4
    const root = chordAt(t).root;
    const notes = [[t, root, 0.42]];
    if (b % 4 === 3) notes.push([t + BEAT / 2, root + 12, 0.2]);
    for (const [bt, bm, len] of notes) {
      const bs = Math.floor(bt * SR);
      const f = mtof(bm);
      for (let i = 0; i < len * SR; i++) {
        const s = i / SR;
        const env = Math.min(1, s / 0.01) * Math.min(1, (len - s) / 0.05);
        const v = Math.tanh((Math.sin(TAU * f * s) + 0.3 * Math.sin(TAU * 2 * f * s)) * 1.6) * env * 0.22;
        bass[bs + i] += v;
      }
    }
  }

  // Ping-pong delay on the pluck.
  const dly = Math.floor(BEAT * 0.75 * SR);
  const pl = new Float32Array(N);
  const pr = new Float32Array(N);
  for (let n = 0; n < N; n++) {
    pl[n] = pluck[n] + (n >= dly ? pr[n - dly] * 0.38 : 0);
    pr[n] = (n >= dly ? pl[n - dly] * 0.38 : 0) + pluck[n] * 0.15;
  }

  // Sidechain ducking from the kick.
  const duck = new Float32Array(N).fill(1);
  for (const t of kickTimes) {
    const s = Math.floor(t * SR);
    for (let i = 0; i < 0.3 * SR && s + i < N; i++) duck[s + i] = Math.min(duck[s + i], 1 - 0.45 * Math.exp(-(i / SR) * 12));
  }

  for (let n = 0; n < N; n++) send[n] += (padL[n] + padR[n]) * 0.35 + (pl[n] + pr[n]) * 0.5;
  const [rvL, rvR] = reverb(send);

  for (let n = 0; n < N; n++) {
    const t = n / SR;
    const fade = Math.min(1, t / 0.4) * Math.min(1, Math.max(0, (total - 0.1 - t) / 3));
    const d = duck[n];
    const mixL = padL[n] * d + pl[n] + bass[n] * d + drums[n] + rvL[n] * 0.9;
    const mixR = padR[n] * d + pr[n] + bass[n] * d + drums[n] + rvR[n] * 0.9;
    L[n] = Math.tanh(mixL * 1.3) * fade;
    R[n] = Math.tanh(mixR * 1.3) * fade;
  }
  writeWav("music", L, R, 0.85);
}

// ---------- sound effects ----------
function sfx() {
  const rand = rng(42);

  // Mouse click
  {
    const o = buf(0.08);
    const hp = new Biquad("bandpass", 3500, 1.2);
    for (let i = 0; i < o.length; i++) {
      const s = i / SR;
      const burst = (s < 0.004 ? 1 : 0) + (s > 0.022 && s < 0.026 ? 0.6 : 0);
      o[i] = hp.process((rand() * 2 - 1) * burst) + Math.sin(TAU * 2200 * s) * Math.exp(-s * 300) * 0.4;
    }
    writeWav("click", o);
  }

  // Bubbly UI pop
  {
    const o = buf(0.2);
    let ph = 0;
    for (let i = 0; i < o.length; i++) {
      const s = i / SR;
      ph += (380 + 620 * (1 - Math.exp(-s * 40))) / SR;
      o[i] = Math.sin(TAU * ph) * Math.min(1, s / 0.002) * Math.exp(-s * 26);
    }
    writeWav("pop", o);
  }

  // Soft tick (counters, tiles)
  {
    const o = buf(0.06);
    for (let i = 0; i < o.length; i++) {
      const s = i / SR;
      o[i] = (Math.sin(TAU * 1700 * s) + (rand() * 2 - 1) * 0.3) * Math.exp(-s * 120);
    }
    writeWav("tick", o);
  }

  // Whoosh for scene transitions
  {
    const len = 0.7;
    const L = buf(len);
    const R = buf(len);
    const bp = new Biquad("bandpass", 400, 1.4);
    for (let i = 0; i < L.length; i++) {
      const s = i / SR;
      const p = s / len;
      if (i % 32 === 0) bp.set(300 + Math.sin(Math.PI * p) * 2800, 1.4);
      const env = Math.sin(Math.PI * Math.min(1, p * 1.15)) ** 2;
      const v = bp.process(rand() * 2 - 1) * env;
      L[i] = v * (1 - p * 0.7);
      R[i] = v * (0.3 + p * 0.7);
    }
    writeWav("whoosh", L, R);
  }

  const bell = [
    [1, 1],
    [2.01, 0.25],
    [3.02, 0.08],
  ];

  // Correct answer: rising two-note chime
  {
    const o = buf(1.0);
    addTone(o, 0, mtof(83), { dur: 0.9, decay: 6, partials: bell });
    addTone(o, 0.09, mtof(88), { dur: 0.9, decay: 5, partials: bell });
    const [rl, rr] = reverb(o, { room: 0.7 });
    writeWav("success", o.map((v, i) => v + rl[i] * 0.4), o.map((v, i) => v + rr[i] * 0.4));
  }

  // Wrong answer: soft, low "bonk-bonk"
  {
    const o = buf(0.45);
    const lp = new Biquad("lowpass", 900);
    for (const [t, m] of [
      [0, 57],
      [0.13, 53],
    ]) {
      const st = Math.floor(t * SR);
      for (let i = 0; i < 0.25 * SR; i++) {
        const s = i / SR;
        const sq = Math.sign(Math.sin(TAU * mtof(m) * s)) * 0.5 + Math.sin(TAU * mtof(m) * s);
        o[st + i] += sq * Math.min(1, s / 0.004) * Math.exp(-s * 14);
      }
    }
    writeWav("error", o.map((v) => lp.process(v)));
  }

  // XP coin
  {
    const o = buf(0.4);
    for (const [t, m, d] of [
      [0, 83, 0.07],
      [0.07, 88, 0.3],
    ]) {
      const st = Math.floor(t * SR);
      for (let i = 0; i < d * SR; i++) {
        const s = i / SR;
        const v = Math.sin(TAU * mtof(m) * s) + 0.25 * Math.sign(Math.sin(TAU * mtof(m) * s));
        o[st + i] += v * Math.min(1, (d - s) / 0.03) * (t > 0 ? Math.exp(-s * 8) : 1) * 0.6;
      }
    }
    writeWav("coin", o);
  }

  // Level up: fast arpeggio + shimmering chord
  {
    const len = 2.2;
    const o = buf(len);
    [72, 76, 79, 84, 88].forEach((m, i) => addTone(o, i * 0.065, mtof(m), { dur: 0.5, decay: 7, amp: 0.45, partials: bell }));
    [72, 76, 79, 84, 91].forEach((m) =>
      addTone(o, 0.36, mtof(m), {
        dur: 1.8,
        decay: 2.2,
        amp: 0.22,
        attack: 0.01,
        partials: [
          [1, 1],
          [2, 0.3],
          [4, 0.08],
        ],
      }),
    );
    for (let k = 0; k < 26; k++) {
      addTone(o, 0.35 + rand() * 1.1, 2500 + rand() * 4000, { dur: 0.25, decay: 20, amp: 0.07 });
    }
    const [rl, rr] = reverb(o, { room: 0.8 });
    writeWav("levelup", o.map((v, i) => v + rl[i] * 0.5), o.map((v, i) => v + rr[i] * 0.5));
  }

  // Sparkle (title reveal, confetti)
  {
    const L = buf(1.0);
    const R = buf(1.0);
    for (let k = 0; k < 22; k++) {
      const t = (k / 22) * 0.55 + rand() * 0.05;
      const f = 2200 + (k / 22) * 3000 + rand() * 800;
      const target = rand() < 0.5 ? L : R;
      addTone(target, t, f, { dur: 0.35, decay: 14, amp: 0.25 });
      addTone(target === L ? R : L, t, f, { dur: 0.35, decay: 14, amp: 0.1 });
    }
    const [rl] = reverb(L, { room: 0.75 });
    const [, rr] = reverb(R, { room: 0.75 });
    writeWav("sparkle", L.map((v, i) => v + rl[i] * 0.5), R.map((v, i) => v + rr[i] * 0.5));
  }

  // Highlighter marker stroke
  {
    const len = 0.6;
    const o = buf(len);
    const bp = new Biquad("bandpass", 2500, 0.7);
    for (let i = 0; i < o.length; i++) {
      const p = i / o.length;
      const grain = 0.75 + 0.25 * Math.sin(TAU * 38 * (i / SR));
      o[i] = bp.process(rand() * 2 - 1) * Math.sin(Math.PI * p) ** 0.6 * grain;
    }
    writeWav("marker", o);
  }
}

fs.mkdirSync(OUT, { recursive: true });
music();
sfx();

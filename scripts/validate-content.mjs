#!/usr/bin/env node
// Validates content/osp/tests/*.json against the content model in src/lib/content/types.ts.
// usage: node scripts/validate-content.mjs [file ...]
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const dir = path.join(root, "content/osp/tests");
const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => path.join(dir, f));

const VERBAL = ["doplnovani", "analogie", "synonyma", "nesoulad", "vyplyvani", "porozumeni", "dva_texty"];
const ANALYTIC = ["data", "porovnani", "dostatecnost", "slovni", "vyrazy", "podminky"];
const LIMITS = { verbal: 35 * 60, analytic: 50 * 60 };

let errorCount = 0;
let warnCount = 0;

for (const file of files) {
  const errors = [];
  const warns = [];
  const err = (m) => errors.push(m);
  const warn = (m) => warns.push(m);
  let t;
  try {
    t = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    console.log(`✗ ${path.basename(file)}: invalid JSON – ${e.message}`);
    errorCount++;
    continue;
  }
  for (const k of ["id", "exam", "title", "date", "variant", "source", "stats", "sections"]) {
    if (t[k] === undefined) err(`missing top-level "${k}"`);
  }
  if (t.id && path.basename(file, ".json") !== t.id) err(`id "${t.id}" does not match filename`);
  for (const k of ["participants", "mean", "median", "sd", "maxScore", "minScore"]) {
    if (typeof t.stats?.[k] !== "number") err(`stats.${k} must be a number`);
  }
  if (!/^\d{4}-\d{2}$/.test(t.date ?? "")) err(`date must be YYYY-MM`);

  const seenN = new Set();
  const groupIds = new Set();
  const typeCounts = {};
  (t.sections ?? []).forEach((s, si) => {
    const expected = si === 0 ? "verbal" : "analytic";
    if (s.id !== expected) err(`section ${si} id should be "${expected}"`);
    if (s.timeLimitSec !== LIMITS[s.id]) err(`section ${s.id} timeLimitSec should be ${LIMITS[s.id]}`);
    const allowed = s.id === "verbal" ? VERBAL : ANALYTIC;
    for (const g of s.groups ?? []) {
      if (!g.id || groupIds.has(g.id)) err(`group id missing/duplicate: ${g.id}`);
      groupIds.add(g.id);
      if (!allowed.includes(g.taskType)) err(`group ${g.id}: taskType "${g.taskType}" not allowed in ${s.id}`);
      if (!g.instruction?.trim()) err(`group ${g.id}: empty instruction`);
      typeCounts[g.taskType] = (typeCounts[g.taskType] ?? 0) + (g.questions?.length ?? 0);
      checkFigure(g.figure, `group ${g.id}`);
      checkText(g.passage, `group ${g.id} passage`);
      for (const q of g.questions ?? []) {
        const where = `q${q.n}`;
        if (!Number.isInteger(q.n)) err(`${where}: n must be integer`);
        if (seenN.has(q.n)) err(`${where}: duplicate number`);
        seenN.add(q.n);
        if (!q.stem?.trim() && !q.compare) err(`${where}: empty stem`);
        checkText(q.stem, where);
        if (q.compare) {
          if (!q.compare.left?.trim() || !q.compare.right?.trim()) err(`${where}: compare needs left+right`);
          checkText(q.compare.left, where + " left");
          checkText(q.compare.right, where + " right");
        }
        if (g.taskType === "porovnani" && !q.compare) warn(`${where}: porovnani without compare{}`);
        checkFigure(q.figure, where);
        if (!q.solution?.trim()) err(`${where}: missing solution`);
        const parts = q.parts ?? [];
        if (g.taskType === "synonyma") {
          if (parts.length !== 2) err(`${where}: synonyma must have 2 parts`);
          else {
            if (parts[0].label !== "synonymum" || parts[1].label !== "antonymum") err(`${where}: part labels`);
            checkPart(parts[0], ["A", "B", "C", "D"], where + " syn");
            checkPart(parts[1], ["E", "F", "G", "H"], where + " ant");
          }
        } else {
          if (parts.length !== 1) err(`${where}: must have exactly 1 part`);
          else checkPart(parts[0], ["A", "B", "C", "D"], where);
        }
      }
    }
  });
  for (let n = 1; n <= 66; n++) if (!seenN.has(n)) err(`question ${n} missing`);
  if (seenN.size !== 66) err(`expected 66 questions, got ${seenN.size}`);

  // answer distribution sanity
  const dist = {};
  for (const s of t.sections ?? [])
    for (const g of s.groups ?? [])
      for (const q of g.questions ?? [])
        for (const p of q.parts ?? []) dist[p.answer] = (dist[p.answer] ?? 0) + 1;

  function checkPart(p, keys, where) {
    const got = (p.options ?? []).map((o) => o.key).join("");
    if (got !== keys.join("")) err(`${where}: option keys ${got} (expected ${keys.join("")})`);
    for (const o of p.options ?? []) {
      if (!o.text?.trim()) err(`${where}: empty option ${o.key}`);
      checkText(o.text, `${where} option ${o.key}`);
    }
    const texts = (p.options ?? []).map((o) => o.text.trim());
    if (new Set(texts).size !== texts.length && !texts.every((x) => /Hodnota|tvrzení|Nelze/.test(x)))
      warn(`${where}: duplicate option texts`);
    if (!keys.includes(p.answer)) err(`${where}: answer "${p.answer}" not in ${keys.join("")}`);
  }
  function checkFigure(fig, where) {
    if (!fig) return;
    if (!fig.startsWith("/figures/")) err(`${where}: figure must start with /figures/`);
    else if (!fs.existsSync(path.join(root, "public", fig))) err(`${where}: figure file missing ${fig}`);
  }
  function checkText(s, where) {
    if (!s) return;
    const dollars = (s.replace(/\\\$/g, "").match(/\$/g) ?? []).length;
    if (dollars % 2 !== 0) err(`${where}: unbalanced $ in math`);
    if (/�|­/.test(s)) warn(`${where}: suspicious character`);
    if (/[^\S\n]{3,}/.test(s.replace(/\| *\|/g, ""))) warn(`${where}: multiple spaces`);
    if (/-\n/.test(s)) warn(`${where}: hyphenated line break`);
  }

  const name = path.basename(file);
  if (errors.length) {
    console.log(`✗ ${name}: ${errors.length} errors, ${warns.length} warnings`);
    errors.forEach((e) => console.log("   error:", e));
  } else {
    console.log(`✓ ${name}: OK (${warns.length} warnings) answers ${JSON.stringify(dist)} types ${JSON.stringify(typeCounts)}`);
  }
  warns.forEach((w) => console.log("   warn:", w));
  errorCount += errors.length;
  warnCount += warns.length;
}
console.log(`\n${files.length} files, ${errorCount} errors, ${warnCount} warnings`);
process.exit(errorCount ? 1 : 0);

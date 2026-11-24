#!/usr/bin/env node
/**
 * Offline assertions for the skill dataset and renderer.
 *
 * The network verifier (verify-skills.mjs) proves the data matches the wiki. This proves the
 * *rendering* is sound — that placeholders actually resolve, that level selection moves the
 * numbers, and that the text substitution does not corrupt neighbouring tokens.
 *
 * These are the checks that would have caught the multi-line description bug (Type 100) and the
 * slash-separated value bug (StG44) before they reached the page.
 *
 * Run:  node scripts/check-skills.ts
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  MAX_SKILL_LEVEL,
  fmtSkillValue,
  groupSkills,
  resolveSkill,
  tierLabel,
} from "../src/lib/skills.ts";
import type { DollSkill, SkillData } from "../src/lib/dolls.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(
  fs.readFileSync(path.join(ROOT, "src", "data", "skills.json"), "utf8"),
) as SkillData;

let checks = 0;
let failures = 0;

function ok(name: string, condition: boolean, detail = "") {
  checks += 1;
  if (!condition) {
    failures += 1;
    if (failures <= 25) console.error(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function eq(name: string, actual: unknown, expected: unknown) {
  ok(name, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const all: Array<{ slug: string; skill: DollSkill }> = Object.entries(data.skills).flatMap(
  ([slug, list]) => list.map((skill) => ({ slug, skill })),
);

// ---------------------------------------------------------------------------
// 1. Every skill at every level renders with no leftover placeholder tokens.
// ---------------------------------------------------------------------------

let rendered = 0;
for (const { slug, skill } of all) {
  if (skill.isPlaceholder) continue;
  for (let level = 1; level <= MAX_SKILL_LEVEL; level += 1) {
    const resolved = resolveSkill(skill, level);
    rendered += 1;

    // A token like "($foo)" or "$foo" surviving means substitution failed.
    const leftover = resolved.text.match(/\(\$[a-z0-9_]+\)|\$[a-z0-9_]+/gi);
    ok(
      `${slug} ${skill.name} L${level}: no leftover tokens`,
      leftover === null,
      leftover ? `found ${leftover.join(", ")}` : "",
    );

    ok(
      `${slug} ${skill.name} L${level}: text is non-empty`,
      resolved.text.trim().length > 0,
    );

    ok(
      `${slug} ${skill.name} L${level}: nothing unresolved`,
      resolved.unresolved.length === 0,
      resolved.unresolved.join(", "),
    );
  }
}

// ---------------------------------------------------------------------------
// 2. Level selection actually changes the numbers (for skills that have curves).
// ---------------------------------------------------------------------------

let varying = 0;
for (const { skill } of all) {
  if (skill.isPlaceholder || skill.placeholders.length === 0) continue;
  const low = resolveSkill(skill, 1);
  const high = resolveSkill(skill, MAX_SKILL_LEVEL);
  if (low.text !== high.text) varying += 1;
}
ok("most skills change text between level 1 and 10", varying > all.length * 0.7, `${varying}/${all.length} vary`);

// Spot-check a known skill: Kar98k's min_dam_value goes 0.7 at L1 to 2.8 at L10.
const kar = data.skills["kar98k"]?.find((s) => s.slot === 1 && s.tier === "base");
if (kar) {
  const l1 = resolveSkill(kar, 1);
  const l10 = resolveSkill(kar, 10);
  ok("Kar98k L1 mentions 0.7", l1.text.includes("0.7"), l1.text.slice(0, 120));
  ok("Kar98k L10 mentions 2.8", l10.text.includes("2.8"), l10.text.slice(0, 120));
  eq("Kar98k cooldown L1", l1.cooldown, 16);
  eq("Kar98k cooldown L10", l10.cooldown, 12);
  eq("Kar98k initial", l10.initial, 4);
} else {
  ok("Kar98k base skill present", false);
}

// ---------------------------------------------------------------------------
// 3. Substitution must not corrupt longer placeholder names with shorter prefixes.
// ---------------------------------------------------------------------------

// A synthetic skill where "$dam_value" is a prefix of "$dam_value2".
const prefixed: DollSkill = {
  source: "test",
  tier: "base",
  slot: 1,
  name: "Prefix Test",
  icon: null,
  text: "First ($dam_value) then ($dam_value2) and finally ($dam_value).",
  placeholders: ["dam_value", "dam_value2"],
  cooldown: null,
  initial: null,
  curves: { dam_value: [10, 20], dam_value2: [99, 88] },
  singleValues: {},
  levels: 2,
  page: "test",
};
const prefixResolved = resolveSkill(prefixed, 1);
eq(
  "longest placeholder substituted first",
  prefixResolved.text,
  "First 10 then 99 and finally 10.",
);

// ---------------------------------------------------------------------------
// 4. Slash-separated (tiered) values keep their slashes.
// ---------------------------------------------------------------------------

const tieredSkill: DollSkill = {
  source: "test",
  tier: "base",
  slot: 1,
  name: "Tiered Test",
  icon: null,
  text: "Deals ($damage_value)x damage.",
  placeholders: ["damage_value"],
  cooldown: null,
  initial: null,
  curves: {},
  tieredCurves: { damage_value: [[1.8, 0.7, 0.4], [4.5, 1.8, 1]] },
  singleValues: {},
  levels: 2,
  page: "test",
};
eq(
  "tiered value keeps its bands",
  resolveSkill(tieredSkill, 1).text,
  "Deals 1.8/0.7/0.4x damage.",
);
eq(
  "tiered value at level 2",
  resolveSkill(tieredSkill, 2).text,
  "Deals 4.5/1.8/1x damage.",
);

// ---------------------------------------------------------------------------
// 5. Out-of-range and malformed input is clamped, not crashed.
// ---------------------------------------------------------------------------

const clamped = resolveSkill(prefixed, 999);
eq("level clamps to the curve length", clamped.level, MAX_SKILL_LEVEL);
ok("level 999 still renders", clamped.unresolved.length === 0);

const emptySkill: DollSkill = {
  source: "test",
  tier: "base",
  slot: 1,
  name: "Empty",
  icon: null,
  text: "",
  placeholders: [],
  cooldown: null,
  initial: null,
  curves: {},
  singleValues: {},
  levels: 0,
  page: "test",
};
ok("empty skill does not throw", resolveSkill(emptySkill, 1).text === "");

// ---------------------------------------------------------------------------
// 6. Grouping collapses MOD variants under one skill.
// ---------------------------------------------------------------------------

const m4 = data.skills["m4a1"] ?? [];
const groups = groupSkills(m4);
ok("M4A1 has two skill groups", groups.length === 2, `got ${groups.length}`);
eq("first group is the primary skill", groups[0]?.slot, 1);
eq("second group is the secondary", groups[1]?.slot, 2);
ok(
  "primary group has base and MOD1 variants",
  (groups[0]?.variants.length ?? 0) >= 2,
  `got ${groups[0]?.variants.length}`,
);
ok(
  "variants ordered base first",
  groups[0]?.variants[0]?.tier === "base",
  groups[0]?.variants.map((v) => v.tier).join(","),
);

// tierLabel must describe each tier readably.
for (const { skill } of all) {
  const label = tierLabel(skill);
  ok(`tier label for ${skill.page}`, typeof label === "string" && label.length > 0);
}

// ---------------------------------------------------------------------------
// 7. Formatting.
// ---------------------------------------------------------------------------

eq("integer stays whole", fmtSkillValue(30), "30");
eq("decimal keeps two places", fmtSkillValue(1.5), "1.5");
eq("long decimal is rounded", fmtSkillValue(1.23456), "1.23");
eq("zero", fmtSkillValue(0), "0");

// ---------------------------------------------------------------------------
// 8. Coverage of the dataset itself.
// ---------------------------------------------------------------------------

ok("at least 620 skill entries extracted", all.length >= 620, String(all.length));
ok("every non-placeholder skill has a description", all.every((e) => e.skill.isPlaceholder || e.skill.text.trim().length > 0));
ok(
  "every non-placeholder skill has ten-level curves or tiered values",
  all.every(
    (e) =>
      e.skill.isPlaceholder ||
      Object.keys(e.skill.curves).length > 0 ||
      Object.keys(e.skill.tieredCurves ?? {}).length > 0 ||
      e.skill.placeholders.length === 0,
  ),
);

// ---------------------------------------------------------------------------

if (failures === 0) {
  console.log(`OK  ${checks} assertions over ${all.length} skill entries (${rendered} level renders).`);
} else {
  console.error(`\n${failures} of ${checks} assertions failed.`);
  process.exit(1);
}

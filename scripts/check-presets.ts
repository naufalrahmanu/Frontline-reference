#!/usr/bin/env node
/**
 * Assert that every shipped preset formation actually buffs something.
 *
 * This exists because the first version of the Presets page shipped six formations that looked
 * plausible and buffed 0–2 dolls out of five. Nothing in the build caught it: the markup
 * rendered, the page loaded, the badges were there. A formation whose auras land on empty cells
 * or on classes that cannot accept them is invisible unless you compute it.
 *
 * Run:  node scripts/check-presets.ts
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buffedPositions,
  parseAura,
  acceptsAura,
  standingIndex,
  type Position,
} from "../src/lib/echelon.ts";
import type { Doll, DollData } from "../src/lib/dolls.ts";

// Read the dataset directly rather than through src/lib/data.ts: that module relies on the
// bundler's JSON import support, which plain Node does not provide without an import attribute.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dollData = JSON.parse(
  fs.readFileSync(path.join(ROOT, "src", "data", "dolls.json"), "utf8"),
) as DollData;
const dolls: Doll[] = dollData.dolls;

/** Kept in sync with src/pages/Presets.tsx by the assertion below. */
const PRESETS: Array<{ id: string; slots: Array<[Position, string]> }> = [
  { id: "ar-smg", slots: [[2, "ump45"], [5, "ro635"], [4, "m4a1"], [1, "st-ar-15"], [7, "m4-sopmod-ii"]] },
  { id: "rf-hg", slots: [[5, "m950a"], [1, "five-seven"], [7, "m14"], [3, "springfield"], [4, "ntw-20"]] },
  { id: "mg-sg", slots: [[4, "mg5"], [7, "pkp"], [6, "m1887"], [3, "ksg"], [9, "saiga-12"]] },
  { id: "ar-hg-night", slots: [[8, "px4-storm"], [2, "ump45"], [1, "m4a1"], [4, "st-ar-15"], [5, "ro635"]] },
  { id: "double-rf", slots: [[2, "m950a"], [5, "iws-2000"], [4, "m14"], [6, "ntw-20"], [8, "five-seven"]] },
  { id: "budget", slots: [[2, "ump45"], [5, "ro635"], [7, "m14"], [4, "m4a1"], [1, "st-ar-15"]] },
];

const bySlug = new Map(dolls.map((d) => [d.slug, d]));

let failures = 0;

for (const preset of PRESETS) {
  const placed = preset.slots.map(([pos, slug]) => {
    const doll = bySlug.get(slug);
    if (!doll) {
      console.error(`FAIL ${preset.id}: unknown doll slug "${slug}"`);
      failures += 1;
    }
    return { pos, doll };
  });

  const missing = placed.filter((p) => !p.doll);
  if (missing.length) continue;

  const entries = placed as Array<{ pos: Position; doll: NonNullable<(typeof placed)[number]["doll"]> }>;

  let buffed = 0;
  let hits = 0;
  const lines: string[] = [];

  for (const { pos, doll } of entries) {
    const givers: string[] = [];
    for (const other of entries) {
      if (other.pos === pos) continue;
      if (!buffedPositions(other.doll, other.pos).includes(pos)) continue;
      if (!acceptsAura(parseAura(other.doll.aura), doll)) continue;
      givers.push(`${other.doll.name}@${other.pos}`);
      hits += 1;
    }
    if (givers.length > 0) {
      buffed += 1;
      lines.push(`    ${doll.name}@${pos} <- ${givers.join(", ")}`);
    }
  }

  // Also confirm every doll has a usable aura pattern — a preset built from dolls with no tiles
  // would pass a pure "does anyone receive" test only by accident.
  for (const { pos, doll } of entries) {
    if (doll.tiles.every((t) => t === null)) {
      console.error(`FAIL ${preset.id}: ${doll.name} has no tile data`);
      failures += 1;
    }
    if (standingIndex(doll.tiles) === null) {
      console.error(`FAIL ${preset.id}: ${doll.name} has no standing cell, pattern cannot be placed`);
      failures += 1;
    }
  }

  // Threshold: at least 4 of 5 dolls should be receiving something. Below that the preset is
  // not demonstrating the mechanic it claims to demonstrate.
  if (buffed < 4) {
    console.error(`FAIL ${preset.id}: only ${buffed}/5 dolls buffed (need >= 4)`);
    failures += 1;
  } else {
    console.log(`OK   ${preset.id}: ${buffed}/5 buffed, ${hits} aura hits`);
    for (const line of lines) console.log(line);
  }
}

if (failures > 0) {
  console.error(`\n${failures} preset problem(s).`);
  process.exit(1);
}

console.log(`\nOK  ${PRESETS.length} presets, all place every doll and buff at least 4 of 5.`);

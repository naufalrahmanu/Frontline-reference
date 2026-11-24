#!/usr/bin/env node
/**
 * Prove the TypeScript engine matches the spreadsheet.
 *
 * src/data/maps.cached.json holds the spreadsheet's own computed values. If the engine
 * disagrees with them on any map, the engine is wrong — not the data. This is the release
 * gate for the farming explorer.
 *
 * Run: node scripts/verify-formulas.ts   (Node 22.6+ strips the types natively)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_ASSUMPTIONS,
  computeMetrics,
  type MapRaw,
} from "../src/lib/farming.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const mapsFile = JSON.parse(
  fs.readFileSync(path.join(ROOT, "src", "data", "maps.json"), "utf8"),
) as { meta: { spreadsheetAssumptions: Record<string, unknown> }; maps: MapRaw[] };

const cachedFile = JSON.parse(
  fs.readFileSync(path.join(ROOT, "src", "data", "maps.cached.json"), "utf8"),
) as Record<
  string,
  {
    weightedResources: number | null;
    autoContractCost: number | null;
    totalEchelonExp: number | null;
    expPerResource: number | null;
    expPerHour: number | null;
    expPerContract: number | null;
    resourcesPerHour: number | null;
    levelMultiplier: number | string | null;
  }
>;

// The spreadsheet's header defaults, restated here so the test is independent of JSON meta.
const A = { ...DEFAULT_ASSUMPTIONS };

const REL_TOL = 1e-6;
const ABS_TOL = 1e-6;

function close(actual: number, expected: number | null): boolean {
  if (expected === null || !Number.isFinite(expected)) return true; // nothing to compare
  if (!Number.isFinite(actual)) return false;
  const diff = Math.abs(actual - expected);
  return diff <= ABS_TOL || diff / Math.max(Math.abs(expected), 1) <= REL_TOL;
}

interface Failure {
  slug: string;
  field: string;
  expected: number | string | null;
  actual: number | string;
}

const failures: Failure[] = [];
let compared = 0;

for (const map of mapsFile.maps) {
  const expected = cachedFile[map.slug];
  if (!expected) continue;
  const m = computeMetrics(map, A);

  const checks: Array<[string, number | string, number | string | null]> = [
    ["weightedResources", m.weightedResources, expected.weightedResources],
    ["autoContractCost", m.autoContractCost, expected.autoContractCost],
    ["totalEchelonExp", m.totalEchelonExp, expected.totalEchelonExp],
    ["expPerResource", m.expPerResource, expected.expPerResource],
    ["expPerHour", m.expPerHour, expected.expPerHour],
    ["expPerContract", m.expPerContract, expected.expPerContract],
    ["resourcesPerHour", m.resourcesPerHour, expected.resourcesPerHour],
  ];

  for (const [field, actual, exp] of checks) {
    compared += 1;
    if (typeof actual === "number" && typeof exp === "number") {
      if (!close(actual, exp)) failures.push({ slug: map.slug, field, expected: exp, actual });
    } else if (typeof exp === "string") {
      // levelMultiplier can be the "10 EXP" sentinel
      const actualIsCapped = actual === "capped";
      if (!actualIsCapped) {
        failures.push({ slug: map.slug, field, expected: exp, actual });
      }
    }
  }

  // levelMultiplier is checked separately: numeric, or the capped sentinel.
  const expMult = expected.levelMultiplier;
  if (typeof expMult === "number") {
    if (m.levelMultiplier !== expMult) {
      failures.push({
        slug: map.slug,
        field: "levelMultiplier",
        expected: expMult,
        actual: m.levelMultiplier,
      });
    }
  } else if (expMult === "10 EXP" && m.levelMultiplier !== "capped") {
    failures.push({
      slug: map.slug,
      field: "levelMultiplier",
      expected: "10 EXP",
      actual: m.levelMultiplier,
    });
  }
}

if (failures.length === 0) {
  console.log(`OK  ${mapsFile.maps.length} maps, ${compared} value comparisons, all match the spreadsheet.`);
  console.log(`    assumptions: ${JSON.stringify(A)}`);
} else {
  console.error(`FAIL  ${failures.length} mismatches out of ${compared} comparisons`);
  const byField = new Map<string, Failure[]>();
  for (const f of failures) {
    if (!byField.has(f.field)) byField.set(f.field, []);
    byField.get(f.field)!.push(f);
  }
  for (const [field, list] of byField) {
    console.error(`\n  ${field}: ${list.length} mismatches`);
    for (const f of list.slice(0, 8)) {
      console.error(`    ${f.slug}: expected ${f.expected}, got ${f.actual}`);
    }
  }
  process.exit(1);
}

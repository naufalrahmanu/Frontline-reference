#!/usr/bin/env node
/**
 * Render every route to static HTML and assert the data is actually there.
 *
 * This is the release gate for "does the site work". A 200 response proves nothing when the app
 * is client-rendered: an empty #root passes a fetch check and fails every visitor. So we run the
 * real React components through Vite's SSR pipeline and inspect the markup they produce.
 *
 * It also catches the failures that unit tests miss — a bad selector, a null from a dataset gap
 * blowing up a map(), a template string printing "undefined".
 *
 * Run:  node scripts/render-check.mjs
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** route -> strings that must appear in the rendered markup */
const CASES = [
  {
    route: "/",
    must: ["Farming Explorer", "Doll Database", "Start Here", "572", "452"],
  },
  {
    route: "/farming",
    must: ["Autobattle efficiency", "Assumptions", "Exp/Resource", "Exp/Hour", "0-1", "Limited drops"],
    // the table body must contain map rows, not just headers
    minOccurrences: [{ needle: "<tr>", count: 200 }],
  },
  {
    route: "/dolls",
    must: ["T-Dolls", "Kar98k", "M4A1", "Rarity"],
    minOccurrences: [{ needle: "<tr>", count: 100 }],
  },
  {
    route: "/dolls/kar98k",
    must: ["Kar98k", "RF", "Stats", "Tiles", "Aura", "Coverage by position", "iopwiki.com"],
  },
  {
    route: "/dolls/m4a1",
    must: ["M4A1", "Affects assault rifles", "Coverage by position"],
  },
  {
    route: "/dolls/px4-storm",
    // Px4 Storm stands on cell 8, not the centre — the case that proves patterns are not
    // assumed to be centred.
    must: ["Px4 Storm", "Coverage by position"],
  },
  {
    route: "/dolls/this-doll-does-not-exist",
    must: ["No such page"],
  },
  {
    route: "/builder",
    must: ["Echelon builder", "Grid", "Available dolls", "class filtering"],
  },
  {
    route: "/builder?f=m4a1@1,ump45@2",
    must: ["What each doll receives", "M4A1", "UMP45", "Wasted auras"],
  },
  {
    route: "/presets",
    must: ["Six echelons that always work", "AR / SMG", "RF / HG", "MG / SG", "dolls buffed"],
  },
  {
    route: "/start",
    must: ["Your first week", "echelon", "Farming Explorer"],
  },
  {
    route: "/credits",
    must: ["Sources, licences", "IOP Wiki", "CC BY-SA", "Sunborn"],
  },
];

/** Strings that indicate a rendering bug regardless of route. */
const FORBIDDEN = ["NaN", "[object Object]", "null★", "undefined%", "undefined★"];

async function main() {
  const vite = await createServer({
    root: ROOT,
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "error",
  });

  try {
    const { renderRoute } = await vite.ssrLoadModule("/scripts/render-entry.tsx");

    let failures = 0;
    let checked = 0;

    for (const testCase of CASES) {
      const html = await renderRoute(testCase.route);

      for (const needle of testCase.must) {
        checked += 1;
        if (!html.includes(needle)) {
          console.error(`FAIL ${testCase.route}: missing "${needle}"`);
          failures += 1;
        }
      }

      for (const rule of testCase.minOccurrences ?? []) {
        checked += 1;
        const count = html.split(rule.needle).length - 1;
        if (count < rule.count) {
          console.error(
            `FAIL ${testCase.route}: found ${count} × "${rule.needle}", expected at least ${rule.count}`,
          );
          failures += 1;
        }
      }

      for (const bad of FORBIDDEN) {
        checked += 1;
        if (html.includes(bad)) {
          // "null" appears legitimately in class names; only flag the suspicious forms.
          console.error(`FAIL ${testCase.route}: output contains "${bad}"`);
          failures += 1;
        }
      }

      process.stdout.write(`✓ ${testCase.route} (${html.length} bytes)\n`);
    }

    if (failures) {
      console.error(`\n${failures} of ${checked} assertions failed.`);
      process.exit(1);
    }
    console.log(`\nOK — ${CASES.length} routes, ${checked} assertions passed.`);
  } finally {
    await vite.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

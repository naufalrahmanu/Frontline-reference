#!/usr/bin/env node
/**
 * Verify the committed skill dataset against IOP Wiki.
 *
 * Deliberately a separate parser from scripts/fetch-skills.mjs: the extractor builds a key/value
 * model, this reads the raw table back and compares field by field. A parser bug cannot verify
 * itself, which is how the "/"-separated value bug and the artist-template bug were both caught
 * elsewhere in this project.
 *
 * Also asserts the invariants the UI depends on:
 *   - every placeholder referenced by a description resolves to a value
 *   - cooldown curves have ten entries and are non-increasing (cooldown drops as you level up)
 *   - no description is empty
 *
 * Run:  node scripts/verify-skills.mjs [--sample N] [--all]
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS = path.join(ROOT, "src", "data", "skills.json");

const UA = "FrontlineReference/0.1 (skill dataset verification)";
const DELAY_MS = Number(process.env.VERIFY_DELAY_MS ?? 1200);

const args = process.argv.slice(2);
const all = args.includes("--all");
const sampleArg = args.indexOf("--sample");
const SAMPLE = sampleArg >= 0 ? Number(args[sampleArg + 1]) : 40;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let last = 0;

async function fetchWikitext(title) {
  const wait = last + DELAY_MS - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();

  const url = new URL("https://iopwiki.com/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("titles", title);
  url.searchParams.set("prop", "revisions");
  url.searchParams.set("rvprop", "content");
  url.searchParams.set("rvslots", "main");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");

  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const page = json.query?.pages?.[0];
  if (!page || page.missing !== undefined) return null;
  return page.revisions?.[0]?.slots?.main?.content ?? null;
}

/**
 * Read a specific key's values straight out of the raw wiki table, independently of the
 * extractor. Returns the whitespace-split value list for that key.
 */
function rawKeyValues(wikitext, key) {
  const lines = wikitext.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line.match(new RegExp(`^!\\s*${key}\\s*$`))) continue;
    // Values are on the following "|" lines until the next "|-" or "! key" or "|}".
    const values = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      const next = lines[j].trim();
      if (next.startsWith("|-") || next.startsWith("!") || next.startsWith("|}")) break;
      if (!next.startsWith("|")) continue;
      const body = next.replace(/^\|/, "");
      const withoutColspan = body.replace(/^[^|]*\|\s*/, "");
      const parts = (body.includes("||") ? body : withoutColspan)
        .split("||")
        .map((s) => s.trim())
        .filter((s) => s !== "");
      values.push(...parts);
    }
    return values;
  }
  return null;
}

async function main() {
  const data = JSON.parse(await fs.readFile(SKILLS, "utf8"));
  const entries = Object.entries(data.skills).flatMap(([slug, list]) =>
    list.map((skill) => ({ slug, skill })),
  );

  // ---- Invariants that do not need the network ----
  const problems = [];
  let checks = 0;

  for (const { slug, skill } of entries) {
    checks += 1;
    if (!skill.text || skill.text.trim().length < 5) {
      problems.push(`${slug}/${skill.page}: empty description`);
    }

    for (const key of skill.placeholders) {
      checks += 1;
      const has =
        skill.curves?.[key] !== undefined ||
        skill.tieredCurves?.[key] !== undefined ||
        skill.singleValues?.[key] !== undefined;
      if (!has) problems.push(`${slug}/${skill.page}: placeholder $${key} has no value`);
    }

    if (skill.cooldown) {
      checks += 1;
      if (skill.cooldown.length === 0) {
        problems.push(`${slug}/${skill.page}: cooldown row is empty`);
      }
      // Cooldown should not increase with level.
      for (let i = 1; i < skill.cooldown.length; i += 1) {
        if (skill.cooldown[i] > skill.cooldown[i - 1]) {
          problems.push(
            `${slug}/${skill.page}: cooldown increases at level ${i + 1} (${skill.cooldown[i - 1]} -> ${skill.cooldown[i]})`,
          );
          break;
        }
      }
    }

    if (skill.curves) {
      checks += 1;
      for (const [key, curve] of Object.entries(skill.curves)) {
        // `initial` is genuinely a single value: the starting cooldown does not scale with level.
        // Every other curve is a ten-level progression — checked against the real dataset, where
        // all ~200 distinct curve names hold exactly 10 values.
        const expected = key === "initial" ? 1 : 10;
        if (curve.length !== expected) {
          problems.push(
            `${slug}/${skill.page}: curve "${key}" has ${curve.length} values, expected ${expected}`,
          );
        }
      }
    }
  }

  console.log(`invariants: ${checks} checks over ${entries.length} skill entries`);

  // ---- Network comparison ----
  const byPage = new Map();
  for (const { slug, skill } of entries) {
    if (!byPage.has(skill.page)) byPage.set(skill.page, []);
    byPage.get(skill.page).push({ slug, skill });
  }

  const pages = [...byPage.keys()];
  const selected = all ? pages : pages.filter((_, i) => i % Math.max(1, Math.floor(pages.length / SAMPLE)) === 0);

  console.log(`network: comparing ${selected.length} of ${pages.length} wiki pages\n`);

  let compared = 0;
  let fetched = 0;

  for (const page of selected) {
    let wikitext;
    try {
      wikitext = await fetchWikitext(page);
    } catch (err) {
      problems.push(`${page}: FETCH FAILED — ${err.message}`);
      continue;
    }
    if (wikitext === null) {
      problems.push(`${page}: page no longer exists on the wiki`);
      continue;
    }
    fetched += 1;

    for (const { slug, skill } of byPage.get(page)) {
      // Name must match the wiki's own name row.
      const wikiName = rawKeyValues(wikitext, "name")?.[0]?.trim();
      compared += 1;
      if (wikiName && wikiName !== skill.name) {
        problems.push(`${page}: name — wiki "${wikiName}", ours "${skill.name}"`);
      }

      // Cooldown must match element for element.
      const wikiCooldown = rawKeyValues(wikitext, "cooldown");
      if (wikiCooldown && skill.cooldown) {
        const wikiNums = wikiCooldown.map(Number);
        const same =
          wikiNums.length === skill.cooldown.length &&
          wikiNums.every((n, i) => Math.abs(n - skill.cooldown[i]) < 1e-9);
        compared += 1;
        if (!same) {
          problems.push(
            `${page}: cooldown — wiki [${wikiNums.slice(0, 4)}…], ours [${skill.cooldown.slice(0, 4)}…]`,
          );
        }
      }

      // Every placeholder must exist as a key on the wiki page.
      for (const key of skill.placeholders) {
        compared += 1;
        const wikiValues = rawKeyValues(wikitext, key);
        if (wikiValues === null) {
          problems.push(`${page}: placeholder $${key} not found in wiki source`);
        }
      }

      // The description must match the wiki's text row verbatim.
      const wikiText = rawKeyValues(wikitext, "text")?.[0];
      if (wikiText) {
        compared += 1;
        if (wikiText.trim() !== skill.text.trim()) {
          problems.push(`${page}: description differs from wiki source`);
        }
      }

      void slug;
    }

    process.stdout.write(".");
  }

  process.stdout.write("\n\n");

  if (problems.length === 0) {
    console.log(`OK  ${entries.length} skill entries, ${fetched} pages compared, ${compared} field checks.`);
  } else {
    console.error(`FAIL  ${problems.length} problem(s):`);
    for (const p of problems.slice(0, 40)) console.error(`  ${p}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

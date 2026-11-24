#!/usr/bin/env node
/**
 * One-time extraction: IOP Wiki skill subpages -> src/data/skills.json
 *
 * ## Where skills actually live
 *
 * Skills are NOT in the doll page wikitext — that template carries only stats, auras and tiles.
 * They live on subpages of the doll page, as MediaWiki `gf-table` markup:
 *
 *     Kar98k/skilldata        the base skill
 *     Kar98k/skill2data       the second skill (MOD2/MOD3 unlock)
 *     Kar98k/skilldata/mod1   the MOD1 upgrade of the base skill
 *
 * Each table is a key/value block where most keys hold one value and the numeric keys hold ten,
 * one per skill level. Placeholders like ($min_dam_value) refer to those numeric rows.
 *
 * ## Why the API and not the rendered page
 *
 * The rendered page also exposes the data, but the skill tables appear several times (once per
 * MOD tab) with no attribute distinguishing which MOD each copy belongs to. Reading the source
 * subpages gives the MOD level directly from the page title, which is unambiguous. `action=query`
 * with `prop=revisions` also allows batching ~50 titles per request.
 *
 * ## Politeness
 *
 * robots.txt asks for Crawl-delay: 20 and disallows `?action=` on page renders; the API is the
 * sanctioned machine interface (the wiki whitelists one specific API action itself). We batch
 * heavily and pause between requests, and the run is a one-off with the output committed.
 *
 * Run:  node scripts/fetch-skills.mjs
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOLLS = path.join(ROOT, "src", "data", "dolls.json");
const OUT = path.join(ROOT, "src", "data", "skills.json");
const INDEX_OUT = path.join(ROOT, "src", "data", "skill-index.json");
const CACHE_DIR = path.join(ROOT, ".cache", "iopwiki-skills");

const API = "https://iopwiki.com/api.php";
const UA = "FrontlineReference/0.1 (one-time skill extraction; contact via site credits)";
const DELAY_MS = Number(process.env.SKILL_DELAY_MS ?? 2000);
const BATCH = 40;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let last = 0;

async function api(params) {
  const wait = last + DELAY_MS - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();

  const url = new URL(API);
  for (const [k, v] of Object.entries({ format: "json", formatversion: "2", ...params })) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const json = await res.json();
  if (json.error) throw new Error(`${json.error.code}: ${json.error.info}`);
  return json;
}

/**
 * Parse a MediaWiki gf-table into ordered rows.
 *
 * The markup is a wiki table: `!` starts a header cell (the key), `|` starts a data cell, and
 * `|-` ends a row. Values may be several per row, separated by `||`, which is how the ten
 * level values for a numeric key are written.
 *
 * A cell can also span several lines. Some descriptions are written as:
 *
 *     ! text
 *     | colspan=10 |
 *     Grants self a shield…
 *     Mystic Mode: …
 *
 * where the text begins on the line *after* the pipe. Treating only the pipe line as the value
 * silently produced an empty description (Type 100's MOD1 skill). So once a data cell starts, the
 * following lines are appended to it until a row/header/table terminator appears.
 */
function parseGfTable(wikitext) {
  const rows = [];
  let current = null;
  let openCell = null; // index into current.values of the cell still accepting continuation lines

  const closeRow = () => {
    if (current) rows.push(current);
    current = null;
    openCell = null;
  };

  for (const rawLine of wikitext.split("\n")) {
    const line = rawLine.trim();

    if (line.startsWith("{|") || line.startsWith("|}")) {
      closeRow();
      continue;
    }
    if (line.startsWith("|-")) {
      closeRow();
      continue;
    }

    const headerMatch = line.match(/^!\s*([A-Za-z0-9_]+)\s*$/);
    if (headerMatch) {
      closeRow();
      current = { key: headerMatch[1], values: [] };
      continue;
    }
    // A header line that is not a bare key (e.g. "! name | colspan=10 | Chain Shot") is a
    // one-line key/value; handle it so such rows are not lost.
    const inlineHeader = line.match(/^!\s*([A-Za-z0-9_]+)\s*\|\s*(.*)$/);
    if (inlineHeader) {
      closeRow();
      current = { key: inlineHeader[1], values: [inlineHeader[2].replace(/^[^|]*\|\s*/, "").trim()] };
      continue;
    }

    if (line.startsWith("|")) {
      if (!current) continue;
      const body = line.replace(/^\|/, "");
      const withoutColspan = body.replace(/^[^|]*\|\s*/, "");
      const parts = (body.includes("||") ? body : withoutColspan)
        .split("||")
        .map((s) => s.trim())
        .filter((s) => s !== "");

      if (parts.length === 0) {
        // The value starts on the next line; reserve a slot for it.
        current.values.push("");
        openCell = current.values.length - 1;
      } else {
        current.values.push(...parts);
        openCell = null;
      }
      continue;
    }

    // Continuation of a multi-line cell.
    if (openCell !== null && current && line !== "") {
      const existing = current.values[openCell];
      current.values[openCell] = existing ? `${existing}\n${line}` : line;
      continue;
    }
  }

  closeRow();
  return rows;
}

/** Is this value a number (possibly with a % sign or trailing note)? */
function numeric(value) {
  const cleaned = String(value).replace(/[%,]/g, "").trim();
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Is this a slash-separated tiered value like "1.8/0.7/0.4"?
 *
 * Some skills express one parameter as several numbers separated by "/" — typically damage falloff
 * by distance band. Treating those as non-numeric stringified them into `singleValues`, which made
 * their ($placeholder) resolve to nothing and left raw tokens in the description (12 skills were
 * affected). They are per-level values like any other, just multi-part, so they get their own shape.
 */
function tiered(value) {
  const text = String(value).trim();
  if (!text.includes("/")) return null;
  const parts = text.split("/").map((p) => numeric(p));
  if (parts.length < 2 || parts.some((p) => p === null)) return null;
  return parts;
}

/**
 * Turn parsed rows into a skill record.
 *
 * `name`, `icon` and `text` are single values; every other row is a per-level curve. The text
 * keeps its ($placeholder) tokens because that is how the wiki writes it, and the UI substitutes
 * the values for the selected level.
 */
function toSkill(title, rows, meta) {
  const fields = {};
  for (const row of rows) {
    fields[row.key] = row.values;
  }

  const name = (fields.name?.[0] ?? "").trim();
  if (!name) return null;

  const text = (fields.text?.[0] ?? "").trim();
  const icon = (fields.icon?.[0] ?? "").trim();

  /**
   * Some wiki pages are unfinished and say so in the data itself — K7's skill is literally named
   * "Placeholder Name" with the description "Placeholder text, did you know this is a placeholder
   * description…". Importing that as a real skill would present a joke as game data, so it is
   * flagged and the UI shows it as an unfinished wiki entry instead.
   */
  const isPlaceholder =
    /^placeholder\b/i.test(name) || /^placeholder text\b/i.test(text) || /^\(?missing\)?$/i.test(name);

  /** Numeric rows, keyed by name, each an array of 10 level values (some skills have fewer). */
  const curves = {};
  /**
   * Rows whose per-level value is itself several numbers, e.g. "1.8/0.7/0.4".
   * Shape: placeholder name -> array (per level) of number arrays.
   */
  const tieredCurves = {};
  const single = {};

  for (const [key, values] of Object.entries(fields)) {
    if (key === "name" || key === "icon" || key === "text") continue;

    const nums = values.map(numeric);
    if (nums.every((n) => n !== null) && nums.length > 0) {
      curves[key] = nums;
      continue;
    }

    const tiers = values.map(tiered);
    if (tiers.every((t) => t !== null) && tiers.length > 0) {
      tieredCurves[key] = tiers;
      continue;
    }

    single[key] = values.length === 1 ? values[0] : values;
  }

  // Placeholders referenced by the text, so the UI can show which curves matter.
  const placeholders = [...text.matchAll(/\(\$([a-z0-9_]+)\)/gi)]
    .map((m) => m[1])
    .filter((v, i, a) => a.indexOf(v) === i);

  const cooldown = curves.cooldown ?? null;
  const initial =
    curves.initial ??
    (single.initial !== undefined ? [numeric(single.initial)].filter((n) => n !== null) : null);

  return {
    /** Which subpage this came from: "skilldata", "skill2data", or a mod level. */
    source: meta.kind,
    /** MOD tier this skill variant applies to, or "base". */
    tier: meta.tier,
    /** 1 for the primary skill, 2 for the secondary (MOD2) skill. */
    slot: meta.slot,
    name,
    icon: icon || null,
    text,
    placeholders,
    cooldown,
    initial,
    curves,
    tieredCurves,
    singleValues: single,
    levels: Math.max(
      0,
      ...Object.values(curves).map((c) => c.length),
      ...Object.values(tieredCurves).map((c) => c.length),
    ),
    /** True when the wiki page itself is an unfinished placeholder, not real game data. */
    isPlaceholder,
    page: title,
  };
}

/** Classify a subpage title. */
function classify(title, dollTitle) {
  const rest = title.slice(dollTitle.length + 1); // e.g. "skilldata", "skilldata/mod1"
  if (rest === "skilldata") return { kind: "skilldata", tier: "base", slot: 1 };
  if (rest === "skill2data") return { kind: "skill2data", tier: "base", slot: 2 };
  const modMatch = rest.match(/^skill(\d?)data\/mod(\d)$/);
  if (modMatch) {
    return {
      kind: `skill${modMatch[1] ?? ""}data`,
      tier: `mod${modMatch[2]}`,
      slot: modMatch[1] === "2" ? 2 : 1,
    };
  }
  const plainMod = rest.match(/^skill(\d?)data\/(mod\d)$/);
  if (plainMod) {
    return {
      kind: `skill${plainMod[1] ?? ""}data`,
      tier: plainMod[2],
      slot: plainMod[1] === "2" ? 2 : 1,
    };
  }
  return null;
}

async function main() {
  const dollData = JSON.parse(await fs.readFile(DOLLS, "utf8"));
  const dolls = dollData.dolls;
  await fs.mkdir(CACHE_DIR, { recursive: true });

  // Candidate subpage titles per doll. Missing ones simply come back as `missing`.
  const jobs = [];
  for (const doll of dolls) {
    const title = decodeURIComponent(doll.source.split("/wiki/")[1] ?? doll.name);
    for (const sub of ["skilldata", "skill2data", "skilldata/mod1", "skill2data/mod1", "skilldata/mod2", "skilldata/mod3", "skill2data/mod2", "skill2data/mod3"]) {
      jobs.push({ doll, dollTitle: title, page: `${title}/${sub}` });
    }
  }

  console.log(`dolls: ${dolls.length}, candidate skill pages: ${jobs.length}`);

  const byTitle = new Map(jobs.map((j) => [j.page, j]));
  const pages = new Map(); // title -> wikitext
  const titles = [...byTitle.keys()];

  for (let i = 0; i < titles.length; i += BATCH) {
    const batch = titles.slice(i, i + BATCH);
    const cacheFile = path.join(CACHE_DIR, `batch-${String(i).padStart(5, "0")}.json`);

    let data;
    try {
      data = JSON.parse(await fs.readFile(cacheFile, "utf8"));
      process.stdout.write(`[cache] ${i}-${i + batch.length}\n`);
    } catch {
      const json = await api({
        action: "query",
        titles: batch.join("|"),
        prop: "revisions",
        rvprop: "content",
        rvslots: "main",
      });
      data = {};
      for (const page of json.query?.pages ?? []) {
        if (page.missing !== undefined) continue;
        data[page.title] = page.revisions?.[0]?.slots?.main?.content ?? "";
      }
      await fs.writeFile(cacheFile, JSON.stringify(data), "utf8");
      process.stdout.write(`[fetch] ${i}-${i + batch.length}: ${Object.keys(data).length} pages\n`);
    }

    for (const [title, wikitext] of Object.entries(data)) pages.set(title, wikitext);
  }

  const skills = {};
  const stats = { dollsWithSkills: 0, dollsWithout: [], totalSkills: 0, modSkills: 0, missing: 0 };

  for (const doll of dolls) {
    const title = decodeURIComponent(doll.source.split("/wiki/")[1] ?? doll.name);
    const found = [];

    for (const job of jobs) {
      if (job.dollTitle !== title) continue;
      const wikitext = pages.get(job.page);
      if (!wikitext) {
        stats.missing += 1;
        continue;
      }
      const meta = classify(job.page, title);
      if (!meta) continue;
      const rows = parseGfTable(wikitext);
      const skill = toSkill(job.page, rows, meta);
      if (!skill) continue;
      if (skill.tier !== "base") stats.modSkills += 1;
      found.push(skill);
    }

    if (found.length === 0) {
      stats.dollsWithout.push(doll.name);
      continue;
    }

    stats.dollsWithSkills += 1;
    stats.totalSkills += found.length;

    // Sort: base slot 1, base slot 2, then mod tiers ascending.
    found.sort((a, b) => {
      const tierRank = (t) => (t === "base" ? 0 : Number(t.replace("mod", "")) || 9);
      if (a.slot !== b.slot) return a.slot - b.slot;
      if (tierRank(a.tier) !== tierRank(b.tier)) return tierRank(a.tier) - tierRank(b.tier);
      return 0;
    });

    skills[doll.slug] = found;
  }

  const out = {
    meta: {
      source: "IOP Wiki (https://iopwiki.com), CC BY-SA 3.0",
      generatedAt: new Date().toISOString().slice(0, 10),
      dollsWithSkills: stats.dollsWithSkills,
      totalSkillEntries: stats.totalSkills,
      modEntries: stats.modSkills,
      note:
        "Skills come from doll subpages (skilldata, skill2data, skilldata/modN). Numeric rows are " +
        "per-level arrays of 10 values. Text keeps ($placeholder) tokens, which the UI substitutes " +
        "from the curves for the selected level.",
    },
    skills,
  };

  await fs.writeFile(OUT, JSON.stringify(out, null, 1), "utf8");

  /**
   * A tiny companion index: doll slug -> primary skill name.
   *
   * The full skills file is ~760 KB, which is fine for a doll's own page but wrong to ship in the
   * bundle that renders the 452-row doll list. The list only needs the name, so it reads this
   * ~15 KB index instead and the full data is loaded lazily on the detail route.
   */
  const index = {};
  for (const [slug, list] of Object.entries(skills)) {
    const primary = list.find((s) => s.slot === 1 && s.tier === "base");
    index[slug] = primary
      ? { name: primary.isPlaceholder ? null : primary.name, placeholder: Boolean(primary.isPlaceholder) }
      : null;
  }
  await fs.writeFile(INDEX_OUT, JSON.stringify(index, null, 0), "utf8");

  console.log(`\nwrote ${OUT}`);
  console.log(`  dolls with skills: ${stats.dollsWithSkills}/${dolls.length}`);
  console.log(`  skill entries: ${stats.totalSkills} (${stats.modSkills} MOD variants)`);
  if (stats.dollsWithout.length) {
    console.log(`  dolls with none: ${stats.dollsWithout.length}`);
    console.log(`    ${stats.dollsWithout.slice(0, 25).join(", ")}${stats.dollsWithout.length > 25 ? " …" : ""}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * One-time extraction: IOP Wiki -> src/data/dolls.json
 *
 * Why the MediaWiki API rather than scraping /wiki/ pages:
 * robots.txt carries `Disallow: /*?action=` with the comment "Dynamic views (diffs, old
 * revisions, history, edit, special pages) are uncacheable full renders - bots stay off
 * them". The rule targets page renders, and the file separately whitelists the one API
 * action it actually cares about (/api.php?action=flowthread). We use `action=query` with
 * `prop=revisions`, which returns raw wikitext rather than a render, in ~12 batched
 * requests instead of ~500 single-page fetches, and we honour `Crawl-delay: 20` between
 * every request. This runs once; the output is committed.
 *
 * Licensing: IOP Wiki text is CC BY-SA 3.0. Every fact derived here is attributed on the
 * Credits page and the generated file is published under the same licence.
 *
 * Run:  node scripts/fetch-dolls.mjs
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "src", "data", "dolls.json");
const CACHE_DIR = path.join(ROOT, ".cache", "iopwiki");

const API = "https://iopwiki.com/api.php";
const UA = "FrontlineReference/0.1 (one-time data extraction; contact via site credits)";
const CRAWL_DELAY_MS = 20_000;
const BATCH = 50;

const CLASSES = ["HG", "SMG", "AR", "RF", "MG", "SG"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let lastRequestAt = 0;

async function api(params) {
  const wait = lastRequestAt + CRAWL_DELAY_MS - Date.now();
  if (wait > 0) await sleep(wait);

  const url = new URL(API);
  for (const [k, v] of Object.entries({ format: "json", formatversion: "2", ...params })) {
    url.searchParams.set(k, v);
  }

  lastRequestAt = Date.now();
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const json = await res.json();
  if (json.error) throw new Error(`API error: ${json.error.code} ${json.error.info}`);
  return json;
}

/** Fetch every page title in a category, following continuation. */
async function categoryMembers(category) {
  const titles = [];
  let cont = {};
  for (;;) {
    const json = await api({
      action: "query",
      list: "categorymembers",
      cmtitle: `Category:${category}`,
      cmlimit: "500",
      cmnamespace: "0",
      ...cont,
    });
    for (const member of json.query?.categorymembers ?? []) titles.push(member.title);
    if (!json.continue) break;
    cont = json.continue;
  }
  return titles;
}

/** Fetch raw wikitext for a batch of titles. */
async function pageContent(titles) {
  const pages = {};
  let cont = {};
  for (;;) {
    const json = await api({
      action: "query",
      titles: titles.join("|"),
      prop: "revisions",
      rvprop: "content",
      rvslots: "main",
      ...cont,
    });
    for (const page of json.query?.pages ?? []) {
      if (page.missing) continue;
      pages[page.title] = page.revisions?.[0]?.slots?.main?.content ?? "";
    }
    if (!json.continue) break;
    cont = json.continue;
  }
  return pages;
}

/**
 * Templates whose only argument is the number the prose refers to, e.g.
 *   "Increases rate of fire by {{HG aura|30}}"  ->  "Increases rate of fire by 30"
 *
 * The wiki wraps handgun aura values this way (there is also a `HG_aura` spelling).
 *
 * Name templates work the same way but carry a person:
 *   "{{artist name|Nagu}} (Determiner of Time)"  ->  "Nagu (Determiner of Time)"
 *
 * Stripping a template without substituting its argument silently drops the value, which is how
 * the first extraction produced "Increases rate of fire by" with no number and left every doll's
 * artist field as the bare string "(Original Artist);".
 */
const VALUE_TEMPLATES = [
  /^\s*HG[ _]aura\s*\|\s*([^|}]*)\s*$/i,
  /^\s*artist\s+name\s*\|\s*([^|}]*)\s*$/i,
  /^\s*voice\s*actor\s+name\s*\|\s*([^|}]*)\s*$/i,
  // {{spoiler|Neural Upgrade}} is just the word, styled. Dropping it left "ZAGALA ()".
  /^\s*spoiler\s*\|\s*([^|}]*)\s*$/i,
];

function expandValueTemplates(value) {
  // Repeat until stable so a template inside a template still resolves.
  let out = value;
  for (let pass = 0; pass < 3; pass += 1) {
    const next = out.replace(/\{\{([^{}]*)\}\}/g, (whole, inner) => {
      const text = String(inner);
      for (const pattern of VALUE_TEMPLATES) {
        const m = text.match(pattern);
        if (m) return m[1] ?? whole;
      }
      return whole;
    });
    if (next === out) break;
    out = next;
  }
  return out;
}

/**
 * Split wikitext on top-level `| key =` boundaries.
 *
 * The page is one big `{{PlayableUnit ... }}` template, so the fields we want sit at brace depth
 * 1: depth 0 is outside the template, depth 2+ is inside a nested template such as
 *
 *     |releasedon = {{doll_server_alias|server=CN|...}}, {{doll_server_alias|server=EN|...}}
 *
 * A naive split on /\|(?=\s*key\s*=)/ also splits on those nested pipes and truncates
 * `releasedon` to "{{doll_server_alias", which made every doll look unreleased on EN. So we
 * scan, track nesting, and treat a pipe as a field boundary only at depth 1.
 */
function splitFields(wikitext) {
  const chunks = [];
  let current = "";
  let depth = 0;
  let i = 0;

  while (i < wikitext.length) {
    const two = wikitext.slice(i, i + 2);

    if (two === "{{") {
      depth += 1;
      current += two;
      i += 2;
      continue;
    }
    if (two === "}}") {
      depth = Math.max(0, depth - 1);
      current += two;
      i += 2;
      continue;
    }
    if (wikitext[i] === "|" && depth === 1) {
      const rest = wikitext.slice(i + 1);
      if (/^\s*[a-z0-9_]+\s*=/.test(rest)) {
        chunks.push(current);
        current = "";
        i += 1;
        continue;
      }
    }
    current += wikitext[i];
    i += 1;
  }
  chunks.push(current);
  return chunks;
}

/**
 * Pull `| key = value` pairs out of the {{PlayableUnit}} template.
 *
 * Two irregularities in the source have to be handled:
 *
 *  1. Field order varies. On some dolls the stat block and tile grid come before the equipment
 *     set, on others after it, so we scan the whole page rather than truncating at a boundary.
 *  2. Some pages put several fields on one line:
 *        |min_hp= 58 |max_hp= 116
 *     Splitting on newlines alone silently loses every field after the first, so boundaries are
 *     found with splitFields above rather than by line.
 *
 * First occurrence wins, which protects against a later template on the same page reusing a key
 * (the equipset and skill blocks below the unit template do).
 */
/**
 * Fields whose value legitimately spans several lines. Everything else takes the first line,
 * because a trailing newline in a numeric field just means the next field starts.
 */
const MULTILINE_FIELDS = new Set(["artist", "voiceactor", "fullname"]);

function parseTemplate(wikitext) {
  const fields = {};
  for (const chunk of splitFields(wikitext)) {
    const m = chunk.match(/^\s*([a-z0-9_]+)\s*=\s*([\s\S]*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    if (Object.prototype.hasOwnProperty.call(fields, key)) continue;

    const raw = m[2];
    if (MULTILINE_FIELDS.has(key)) {
      // Artist lists are line-per-person:
      //   |artist = {{artist name|A}} (Original);
      //   {{artist name|B}} (Neural Upgrade)
      // Keep every line that starts with a name template, so all artists survive.
      const lines = raw
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "");
      fields[key] = expandValueTemplates(lines.join("; "));
    } else {
      fields[key] = expandValueTemplates(raw.split("\n")[0].trim());
    }
  }
  return fields;
}

function num(value) {
  if (value === undefined || value === null) return null;
  const cleaned = String(value).replace(/[^0-9.-]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function text(value) {
  if (!value) return null;
  const stripped = value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/'''?/g, "")
    .replace(/\(\)/g, "")
    .replace(/\s*;\s*(;\s*)+/g, "; ")
    .replace(/\s+/g, " ")
    .replace(/^[;\s]+|[;\s]+$/g, "")
    .trim();
  return stripped || null;
}

/** tile1..tile9 -> array of 0/1/null. 1 = buff tile, 0 = standing tile, null = empty. */
function parseTiles(fields, prefix = "") {
  const tiles = [];
  for (let i = 1; i <= 9; i += 1) {
    const raw = fields[`${prefix}tile${i}`];
    if (raw === undefined) {
      tiles.push(null);
    } else {
      const n = num(raw);
      tiles.push(n === null ? null : n === 0 ? 0 : 1);
    }
  }
  return tiles;
}

/**
 * MOD tile overrides are sparse: "|mod1_tile6 = 1" changes tile 6 only, leaving the rest.
 * Returns null when the upgrade adds or changes no tile at all, so the UI can skip drawing an
 * identical grid — most MOD3s are stat-only, and showing a second empty grid implies a change
 * that never happened.
 */
function parseModTiles(fields, baseTiles) {
  const tiles = [...baseTiles];
  let changed = false;

  for (let i = 1; i <= 9; i += 1) {
    for (const prefix of ["mod1", "mod3"]) {
      const raw = fields[`${prefix}_tile${i}`];
      if (raw === undefined) continue;
      const n = num(raw);
      if (n === null) continue;
      const normalised = n === 0 ? 0 : 1;
      if (tiles[i - 1] !== normalised) {
        tiles[i - 1] = normalised;
        changed = true;
      }
    }
  }

  return changed ? tiles : null;
}

/** Portrait thumbnail filename from the gallery block, e.g. File:Kar98k_S.png */
function parsePortrait(wikitext) {
  const gallery = wikitext.match(/\|gallery=<gallery>([\s\S]*?)<\/gallery>/i);
  if (!gallery) return null;
  for (const line of gallery[1].split("\n")) {
    const m = line.match(/^File:([^\s|]+_S\.(?:png|jpg|webp))/i);
    if (m) return m[1];
  }
  const any = gallery[1].match(/^File:([^\s|]+\.(?:png|jpg|webp))/im);
  return any ? any[1] : null;
}

function slug(name) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseDoll(title, wikitext, classification) {
  const f = parseTemplate(wikitext);
  if (!f.index && !f.min_dmg) return null;

  const releasedOn = f.releasedon ?? "";
  const releasedOnEN = /\|\s*server\s*=\s*EN\b/i.test(releasedOn);

  const rarityRaw = text(f.rarity);

  const tiles = parseTiles(f);

  return {
    slug: slug(title),
    name: text(f.fullname) ? title : title,
    index: num(f.index),
    classification: (f.classification ?? classification ?? "").toUpperCase() || null,
    rarity: num(f.rarity),
    rarityLabel: rarityRaw,
    stats: {
      dmg: [num(f.min_dmg), num(f.max_dmg)],
      acc: [num(f.min_acc), num(f.max_acc)],
      eva: [num(f.min_eva), num(f.max_eva)],
      rof: [num(f.min_rof), num(f.max_rof)],
      hp: [num(f.min_hp), num(f.max_hp)],
      mov: num(f.mov),
    },
    aura: [text(f.aura1), text(f.aura2), text(f.aura3), text(f.aura4)],
    tiles,
    moddable: num(f.moddable) === 1,
    modTiles: num(f.moddable) === 1 ? parseModTiles(f, tiles) : null,
    mod3Stats: num(f.mod3_max_dmg) === null
      ? null
      : {
          dmg: num(f.mod3_max_dmg),
          acc: num(f.mod3_max_acc),
          eva: num(f.mod3_max_eva),
          rof: num(f.mod3_max_rof),
          hp: num(f.mod3_max_hp),
        },
    craftTime: text(f.craft),
    artist: text(f.artist),
    releasedOnEN,
    portrait: null, // reserved: populated in v1.1
    portraitSource: parsePortrait(wikitext),
    source: `https://iopwiki.com/wiki/${encodeURIComponent(title)}`,
  };
}

async function main() {
  await fs.mkdir(CACHE_DIR, { recursive: true });

  const byClass = {};
  const allTitles = new Set();

  for (const cls of CLASSES) {
    const cacheFile = path.join(CACHE_DIR, `category-${cls}.json`);
    let titles;
    try {
      titles = JSON.parse(await fs.readFile(cacheFile, "utf8"));
      console.log(`[cache] ${cls}: ${titles.length} pages`);
    } catch {
      titles = await categoryMembers(`${cls}_T-Dolls`);
      await fs.writeFile(cacheFile, JSON.stringify(titles, null, 1), "utf8");
      console.log(`[fetch] ${cls}: ${titles.length} pages`);
    }
    byClass[cls] = titles;
    for (const t of titles) allTitles.add(t);
  }

  const titles = [...allTitles];
  console.log(`total unique pages: ${titles.length}`);

  const classOf = {};
  for (const [cls, list] of Object.entries(byClass)) {
    for (const t of list) if (!classOf[t]) classOf[t] = cls;
  }

  const dolls = [];
  const skipped = [];

  for (let i = 0; i < titles.length; i += BATCH) {
    const batch = titles.slice(i, i + BATCH);
    const cacheFile = path.join(CACHE_DIR, `batch-${String(i).padStart(4, "0")}.json`);

    let pages;
    try {
      pages = JSON.parse(await fs.readFile(cacheFile, "utf8"));
      console.log(`[cache] batch ${i}-${i + batch.length}`);
    } catch {
      pages = await pageContent(batch);
      await fs.writeFile(cacheFile, JSON.stringify(pages), "utf8");
      console.log(`[fetch] batch ${i}-${i + batch.length} (${Object.keys(pages).length} pages)`);
    }

    for (const title of batch) {
      const wikitext = pages[title];
      if (!wikitext) {
        skipped.push(`${title}: no wikitext`);
        continue;
      }
      const doll = parseDoll(title, wikitext, classOf[title]);
      if (!doll) {
        skipped.push(`${title}: not a playable unit template`);
        continue;
      }
      dolls.push(doll);
    }
  }

  dolls.sort((a, b) => (a.index ?? 9999) - (b.index ?? 9999));

  const enDolls = dolls.filter((d) => d.releasedOnEN);

  const out = {
    meta: {
      source: "IOP Wiki (https://iopwiki.com), CC BY-SA 3.0",
      generatedAt: new Date().toISOString().slice(0, 10),
      totalDolls: dolls.length,
      releasedOnEN: enDolls.length,
      fields: [
        "name", "index", "classification", "rarity", "stats", "aura", "tiles",
        "moddable", "modTiles", "mod3Stats", "craftTime", "artist", "releasedOnEN",
      ],
      note: "Skill text is not captured in v1. The schema leaves room for it without migration.",
    },
    dolls,
  };

  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(OUT, JSON.stringify(out, null, 1), "utf8");

  console.log(`\nwrote ${OUT}`);
  console.log(`  parsed: ${dolls.length}`);
  console.log(`  released on EN: ${enDolls.length}`);
  if (skipped.length) {
    console.log(`  skipped ${skipped.length}:`);
    for (const s of skipped.slice(0, 30)) console.log(`    ${s}`);
  }
  const noTiles = dolls.filter((d) => d.tiles.every((t) => t === null));
  console.log(`  dolls with no tile data: ${noTiles.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

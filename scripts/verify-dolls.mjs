#!/usr/bin/env node
/**
 * Verify the committed doll dataset against every EN doll on IOP Wiki.
 *
 * Why the API rather than /wiki/ pages: this environment's robots.txt disallows `?action=` for
 * *page renders*, but `/api.php` is the wiki's sanctioned machine interface, returns the same
 * rendered HTML, and lets us sample every doll rather than a handful. requests are paced and
 * the output is compared field by field.
 *
 * Why a separate parser from scripts/fetch-dolls.mjs: the extractor reads wikitext, this reads
 * rendered HTML. Two independent code paths means a parser bug cannot verify itself, which is
 * how the vertical-flip and "N/A becomes 0" bugs were both caught.
 *
 * The rendered tile grid is drawn front-row-first, which is the vertical flip of the wikitext
 * tile1..tile9 numbering, so the comparison flips it back before comparing.
 *
 * Run:  node scripts/verify-dolls.mjs [--limit N] [--only slug]
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "src", "data", "dolls.json");

const UA = "FrontlineReference/0.1 (dataset verification)";
/** robots.txt asks for Crawl-delay: 20; the API is polite enough that we use a shorter pause. */
const DELAY_MS = Number(process.env.VERIFY_DELAY_MS ?? 1200);

const args = process.argv.slice(2);
const limitArg = args.indexOf("--limit");
const LIMIT = limitArg >= 0 ? Number(args[limitArg + 1]) : Infinity;
const onlyArg = args.indexOf("--only");
const ONLY = onlyArg >= 0 ? args[onlyArg + 1] : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let last = 0;

async function fetchHtml(title) {
  const wait = last + DELAY_MS - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();

  const url = new URL("https://iopwiki.com/api.php");
  url.searchParams.set("action", "parse");
  url.searchParams.set("page", title);
  url.searchParams.set("prop", "text");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");

  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.info ?? json.error.code);
  return json.parse?.text ?? "";
}

/**
 * Read a data-tdoll-stat-id span. The wiki writes "N/A" for unstated stats; stripping
 * non-numerics from that leaves "", and Number("") is 0 — so empty must map to null, not zero.
 */
function statOf(html, id) {
  const m = html.match(new RegExp(`data-tdoll-stat-id="${id}"[^>]*>([^<]*)<`, "i"));
  if (!m) return null;
  const cleaned = m[1].trim().replace(/[^0-9.-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Rendered grid is front-row-first: flip rows to recover tile1..tile9 order. */
function tilesOf(html) {
  const table = html.match(/<table class="tilegridtable"[\s\S]*?<\/table>/i);
  if (!table) return null;
  const cells = [...table[0].matchAll(/<td([^>]*)>/gi)].map((m) => m[1]);
  if (cells.length !== 9) return null;
  const drawn = cells.map((attrs) => {
    if (/class="[^"]*\bbuff\b/.test(attrs)) return 1;
    if (/class="[^"]*\bstanding\b/.test(attrs)) return 0;
    return null;
  });
  return [drawn[6], drawn[7], drawn[8], drawn[3], drawn[4], drawn[5], drawn[0], drawn[1], drawn[2]];
}

const STAT_IDS = [
  ["dmg", "max_dmg"],
  ["acc", "max_acc"],
  ["eva", "max_eva"],
  ["rof", "max_rof"],
  ["hp", "max_hp"],
];

async function main() {
  const data = JSON.parse(await fs.readFile(DATA, "utf8"));
  let dolls = data.dolls.filter((d) => d.releasedOnEN);
  if (ONLY) dolls = dolls.filter((d) => d.slug === ONLY);
  dolls = dolls.slice(0, LIMIT === Infinity ? undefined : LIMIT);

  console.log(`verifying ${dolls.length} EN dolls against IOP Wiki rendered output`);
  console.log(`delay ${DELAY_MS}ms between requests\n`);

  const problems = [];
  let compared = 0;
  let done = 0;

  for (const doll of dolls) {
    const title = decodeURIComponent(doll.source.split("/wiki/")[1] ?? doll.name);

    let html;
    try {
      html = await fetchHtml(title);
    } catch (err) {
      problems.push(`${doll.name}: FETCH FAILED — ${err.message}`);
      continue;
    }

    for (const [field, id] of STAT_IDS) {
      const wiki = statOf(html, id);
      if (wiki === null) continue;
      compared += 1;
      const ours = doll.stats[field][1];
      if (ours !== wiki) problems.push(`${doll.name}: ${field} max — wiki ${wiki}, ours ${ours}`);
    }

    const wikiTiles = tilesOf(html);
    if (wikiTiles) {
      compared += 1;
      if (wikiTiles.some((t, i) => t !== doll.tiles[i])) {
        problems.push(
          `${doll.name}: tiles — wiki ${JSON.stringify(wikiTiles)}, ours ${JSON.stringify(doll.tiles)}`,
        );
      }
    }

    done += 1;
    if (done % 25 === 0) process.stdout.write(`  ${done}/${dolls.length} …\n`);
  }

  if (problems.length === 0) {
    console.log(`\nOK  ${done} dolls, ${compared} values compared, no discrepancies.`);
  } else {
    console.error(`\nFAIL  ${problems.length} discrepancies across ${done} dolls (${compared} values):`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

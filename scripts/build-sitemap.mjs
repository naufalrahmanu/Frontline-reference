#!/usr/bin/env node
/**
 * Generate public/sitemap.xml from the committed datasets.
 *
 * Every doll gets its own URL, which is the point: individual doll pages are what people search
 * for and share, so they need to be discoverable. The sitemap is regenerated from data rather
 * than hand-listed, so it can never drift out of sync with what actually exists.
 *
 * Run:  node scripts/build-sitemap.mjs [--base https://example.com]
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const baseArg = process.argv.indexOf("--base");
const BASE = (baseArg >= 0 ? process.argv[baseArg + 1] : "https://frontline-reference.pages.dev").replace(/\/$/, "");

const STATIC_ROUTES = [
  { path: "/", priority: "1.0", changefreq: "monthly" },
  { path: "/farming", priority: "0.9", changefreq: "monthly" },
  { path: "/dolls", priority: "0.9", changefreq: "monthly" },
  { path: "/builder", priority: "0.7", changefreq: "monthly" },
  { path: "/presets", priority: "0.7", changefreq: "monthly" },
  { path: "/start", priority: "0.8", changefreq: "monthly" },
  { path: "/credits", priority: "0.3", changefreq: "yearly" },
];

async function main() {
  const dollsData = JSON.parse(
    await fs.readFile(path.join(ROOT, "src", "data", "dolls.json"), "utf8"),
  );
  const mapsData = JSON.parse(
    await fs.readFile(path.join(ROOT, "src", "data", "maps.json"), "utf8"),
  );

  const lastmod = [
    dollsData.meta?.generatedAt ?? "",
    mapsData.meta?.generatedAt ?? "",
  ]
    .filter(Boolean)
    .sort()
    .pop();

  const urls = [
    ...STATIC_ROUTES.map(
      (route) => `  <url>
    <loc>${BASE}${route.path}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${route.changefreq}</changefreq>
    <priority>${route.priority}</priority>
  </url>`,
    ),
    // Only EN dolls are reachable in the UI, so only those belong in the sitemap.
    ...dollsData.dolls
      .filter((doll) => doll.releasedOnEN)
      .map(
        (doll) => `  <url>
    <loc>${BASE}/dolls/${doll.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.5</priority>
  </url>`,
      ),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;

  const out = path.join(ROOT, "public", "sitemap.xml");
  await fs.writeFile(out, xml, "utf8");

  console.log(`wrote public/sitemap.xml — ${urls.length} URLs (${lastmod})`);
  console.log(`  base: ${BASE}`);
  if (BASE.includes("frontline-reference.pages.dev")) {
    console.log("  note: change the base with --base <url> once the real domain is known");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

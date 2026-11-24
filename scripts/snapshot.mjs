#!/usr/bin/env node
/**
 * Produce standalone HTML snapshots of rendered routes for visual inspection.
 *
 * The environment can't launch a browser (named pipes and shared-memory channels are blocked),
 * so screenshots aren't available. Instead this inlines the built CSS around the SSR markup,
 * which is enough to open in any browser and eyeball the layout, and enough to diff when a
 * style change goes wrong.
 *
 * Run:  node scripts/snapshot.mjs [route ...]
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, ".snapshots");

const DEFAULT_ROUTES = ["/", "/farming", "/dolls", "/dolls/m4a1", "/builder?f=m4a1@1,ump45@2", "/presets", "/start", "/credits"];

const routes = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_ROUTES;

const vite = await createServer({
  root: ROOT,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
});

try {
  const { renderRoute } = await vite.ssrLoadModule("/scripts/render-entry.tsx");
  const css = await fs.readFile(path.join(ROOT, "src", "styles.css"), "utf8");
  await fs.mkdir(OUT, { recursive: true });

  for (const route of routes) {
    const html = await renderRoute(route);
    // Keep only what App renders, so the snapshot is the page and not the SSR wrapper.
    const body = html.slice(html.indexOf('<div class="shell">'));
    const doc = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${route}</title>
<style>${css}</style></head>
<body>${body}</body></html>`;

    const name = route.replace(/[/?=@&]/g, "_").replace(/^_/, "") || "home";
    const file = path.join(OUT, `${name}.html`);
    await fs.writeFile(file, doc, "utf8");
    console.log(`${route.padEnd(34)} -> .snapshots/${name}.html (${(doc.length / 1024).toFixed(0)} KB)`);
  }
} finally {
  await vite.close();
}

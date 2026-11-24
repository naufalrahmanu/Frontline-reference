/**
 * SSR entry used only by scripts/render-check.mjs.
 *
 * Renders one route of the real app to static markup so the smoke test can assert on what a
 * user would actually see, without needing a browser.
 *
 * react-router 7 exports StaticRouter from the package root (the `/server` subpath from v6 is
 * gone), so this imports from "react-router-dom" directly.
 *
 * ## Why this renders twice
 *
 * The skill dataset is code-split and the doll page sets it from a `useEffect`, so a single
 * `renderToString` only ever produces the "Loading skill data…" placeholder — which would make
 * the render check silently stop verifying skills at all (it did: five assertions failed the
 * moment skills became lazy). To assert real content, the first pass primes the module-level
 * loader cache, then a second pass renders with the promise already resolved. `loadSkills()`
 * memoises, so the second pass hits the cache synchronously.
 */

import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import { App } from "../src/App.tsx";
import { loadSkills } from "../src/lib/data.ts";

function renderOnce(url: string): string {
  return renderToString(
    <StrictMode>
      <StaticRouter location={url}>
        <App />
      </StaticRouter>
    </StrictMode>,
  );
}

export async function renderRoute(url: string): Promise<string> {
  // Resolve the code-split skill dataset first. DollDetail seeds its initial state from the
  // synchronous cache, so once this resolves the very first server render already has skills.
  await loadSkills();
  return renderOnce(url);
}

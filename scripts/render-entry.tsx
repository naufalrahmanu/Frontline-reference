/**
 * SSR entry used only by scripts/render-check.mjs.
 *
 * Renders one route of the real app to static markup so the smoke test can assert on what a
 * user would actually see, without needing a browser.
 *
 * react-router 7 exports StaticRouter from the package root (the `/server` subpath from v6 is
 * gone), so this imports from "react-router-dom" directly.
 */

import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import { App } from "../src/App.tsx";

export function renderRoute(url: string): string {
  return renderToString(
    <StrictMode>
      <StaticRouter location={url}>
        <App />
      </StaticRouter>
    </StrictMode>,
  );
}

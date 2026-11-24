# Frontline Reference

An archival reference site for **Girls' Frontline 1** (the original game, not GFL2: Exilium).

Two things it does that are hard to find elsewhere:

1. **Farming Explorer** — autobattle efficiency for all 572 maps, computed from raw resource cost,
   duration and base exp, with the five assumptions left movable. Change the autobattle card, EXP Up,
   T-Doll level or link count and every number recomputes.
2. **Doll Database** — every EN doll's max stats, aura text and exact 3×3 tile layout, plus a
   formation builder that aggregates the buffs each doll actually receives.

No backend, no accounts, no news feed. Everything is a static build over committed JSON.

See [`SPEC.md`](./SPEC.md) for the full design record and every decision behind it.

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

```bash
npm run build        # type-check + production build into dist/
npm run preview      # serve dist/ on :4173
```

## Deploying

This deploys as a **Cloudflare Worker with static assets**, not as Cloudflare Pages. The build and
the deploy are separate steps, and the deploy needs `wrangler.toml` to say where the files are:

```bash
npm run build        # produces dist/
npx wrangler deploy  # uploads dist/ per [assets] in wrangler.toml
```

`wrangler.toml` must contain:

```toml
[assets]
directory = "./dist"
not_found_handling = "single-page-application"
```

Without the `[assets]` block, `wrangler deploy` fails with *"Missing entry-point to Worker script or
to assets directory"* — **after the build has already succeeded**, so the log looks like a build
problem when it is not. Pages is a different product: it reads the output directory from the
dashboard and does not use this file the same way.

There is no `main` entry and no server code; the site is a static bundle. SPA fallback is declared
once, in `wrangler.toml`. Do not also add a blanket `/* /index.html 200` to `_redirects` — two
declarations of the same rule is how they drift apart.

## Checks

These are the release gates. `npm run check` runs all the offline ones in order.

```bash
npm run check               # everything below except the network verifiers
npm run typecheck           # tsc --noEmit
npm run data:verify         # formula engine vs. all 4,004 spreadsheet values
npm run check:echelon       # tile geometry and aura parsing (70 assertions)
npm run check:presets       # every shipped formation actually buffs someone
npm run check:skills        # skill rendering: every skill at all 10 levels (19,307 assertions)
npm run check:render        # SSR every route, assert real data appears
npm run verify:dolls        # doll dataset vs. IOP Wiki (~5 min, network)
npm run verify:skills       # skill dataset vs. all 623 wiki pages (~8 min, network)
```

`check:echelon` and `check:presets` exist for a specific reason: the tile-buff engine is the one
part of this site that can be *completely wrong while still looking right*. An earlier version
assumed only the centre doll projects auras — the output was plausible and entirely incorrect, and
nothing in the build complained. Those two scripts are the assertions that catch that class of
mistake, and they should be extended whenever the buff logic changes.

`verify:dolls` hits the network and respects a crawl delay; run it when doll data changes, not on
every commit.

## Data pipeline

Both datasets are generated once and committed. Nothing is fetched at runtime or at build time —
a dead wiki can never break the deployed site.

### Maps — `src/data/maps.json`

```bash
pip install openpyxl
python scripts/build-maps.py     # xlsx -> src/data/maps.json
npm run data:verify              # prove the TS engine reproduces the spreadsheet
```

The map script is the only Python in the project. It runs once and needs `openpyxl`; if the
interpreter on your PATH lacks it, the script says so instead of throwing a traceback. The
generated JSON is committed, so a normal build never needs Python at all.

Source: the community *GFL EN Autobattle Comparison* spreadsheet (see Credits on the live site).

Only **raw inputs** are stored: resource cost, parts, duration, base exp, level penalty, CE. Every
derived number (exp per resource, per hour, per contract) is recomputed in the browser, which is
what lets the assumptions move. `src/data/maps.cached.json` holds the spreadsheet's own computed
columns solely so `verify-formulas` can prove the engine matches them — the site never reads it.

Normalisation applied at import: NBSP stripping, whitespace collapse, chapter vocabulary, stable
slugs. 62 of the 572 maps are not released on EN and are flagged, not dropped.

### Dolls — `src/data/dolls.json`

```bash
npm run data:dolls               # IOP Wiki -> src/data/dolls.json  (respects Crawl-delay: 20)
npm run verify:dolls             # compare against rendered wiki pages
```

Source: [IOP Wiki](https://iopwiki.com), CC BY-SA 3.0. The extractor uses the MediaWiki API with
batched `revision` requests, caches raw wikitext in `.cache/iopwiki/` so re-parsing is free, and
commits the result. Parsing handles the wiki's irregularities explicitly: fields that share a line,
values that span lines, and templates such as `{{HG aura|30}}` whose argument is the actual number.

The verifier is deliberately a **separate parser** reading rendered HTML, so a parser bug cannot
verify itself. It has already caught three real ones — a truncated field boundary, artist templates
being dropped, and `N/A` stats parsing as zero.

### Skills — `src/data/skills.json`

```bash
npm run data:skills              # IOP Wiki subpages -> src/data/skills.json
npm run verify:skills            # compare all 623 entries against the wiki (~8 min, network)
```

Skills are **not** on the doll page. They live on subpages (`<Doll>/skilldata`,
`<Doll>/skilldata/mod1`, `<Doll>/skill2data`) as `gf-table` markup: `name`/`icon`/`text` are single
values, every other row is a ten-value per-level curve, and the description carries `($placeholder)`
tokens pointing at those curves. That is why the doll page has a level selector — it is substituting
different numbers into the same sentence.

Coverage: 623 entries across 459 of 460 dolls, including 82 MOD1 variants. KGP-9 has no skill page on
the wiki; K7's is an unfinished placeholder and is labelled as such rather than presented as data.

Three source irregularities are handled explicitly, each of which silently produced wrong output
before being found: values that begin on the line *after* the pipe (empty descriptions), values that
are slash-separated bands like `1.8/0.7/0.4` (unresolved placeholders in prose), and pages whose
content is literally the word "Placeholder".

## Repository layout

```
scripts/
  build-maps.py          xlsx -> maps.json
  fetch-dolls.mjs        IOP Wiki -> dolls.json
  fetch-skills.mjs       IOP Wiki subpages -> skills.json
  build-sitemap.mjs      data -> sitemap.xml
  verify-formulas.ts     engine vs. spreadsheet (4,004 comparisons)
  verify-dolls.mjs       dataset vs. rendered wiki pages
  verify-skills.mjs      dataset vs. all 623 wiki skill pages
  check-echelon.ts       tile geometry and aura parsing (70 assertions)
  check-presets.ts       every shipped formation actually buffs someone
  check-skills.ts        skill rendering at all 10 levels
  render-check.mjs       SSR every route, assert data is present
  render-entry.tsx       SSR entry used by render-check
  snapshot.mjs           write standalone HTML previews to .snapshots/
src/
  lib/farming.ts         the autobattle formula engine
  lib/echelon.ts         tile geometry, aura parsing, buff aggregation
  lib/skills.ts          skill placeholder substitution and grouping
  lib/dolls.ts           doll and skill types
  lib/data.ts            static data access, merges skills into dolls
  pages/                 one file per route
  components/            TileGrid, SkillPanel, DataStamp
  data/                  generated JSON (CC BY-SA 3.0) — see LICENSE-DATA.md
```

## Corrections

Data is edited as JSON and committed; there is no admin UI and no database (see SPEC §12).

- **Map numbers** — fix `src/data/maps.json`, then run `npm run data:verify`.
- **Doll facts** — fix `src/data/dolls.json` and note why in the commit. Re-running the extractor
  overwrites hand edits, so corrections that should survive a re-crawl belong in the extractor.
- **Formula behaviour** — change `src/lib/farming.ts`, never the JSON, and re-run `data:verify`.

## Licences

- **Code** (`src/`, `scripts/`) — MIT, see [`LICENSE`](./LICENSE).
- **Data files** (`src/data/*.json`) — CC BY-SA 3.0, see
  [`src/data/LICENSE-DATA.md`](./src/data/LICENSE-DATA.md), because the doll facts derive from
  IOP Wiki. Attribution and share-alike apply to any redistribution.
- **Guide prose** — original to this site.

Girls' Frontline is the property of Sunborn Network Technology / MICA Team. This site is an
unofficial, non-commercial fan reference and is not affiliated with them. No character artwork is
hosted here.

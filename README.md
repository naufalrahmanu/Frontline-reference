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

## Checks

These are the release gates. `npm run check` runs all the offline ones in order.

```bash
npm run check               # everything below except verify:dolls
npm run typecheck           # tsc --noEmit
npm run data:verify         # formula engine vs. all 4,004 spreadsheet values
npm run check:echelon       # tile geometry and aura parsing (70 assertions)
npm run check:presets       # every shipped formation actually buffs someone
npm run check:render        # SSR every route, assert real data appears
npm run verify:dolls        # compare the doll dataset against IOP Wiki (~5 min, network)
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

## Repository layout

```
scripts/
  build-maps.py          xlsx -> maps.json
  fetch-dolls.mjs        IOP Wiki -> dolls.json
  verify-formulas.ts     engine vs. spreadsheet (4,004 comparisons)
  verify-dolls.mjs       dataset vs. rendered wiki pages
  render-check.mjs       SSR every route, assert data is present
  snapshot.mjs           write standalone HTML previews to .snapshots/
src/
  lib/farming.ts         the autobattle formula engine
  lib/echelon.ts         tile geometry, aura parsing, buff aggregation
  lib/dolls.ts           doll types
  lib/data.ts            static data access
  pages/                 one file per route
  components/            TileGrid
  data/                  generated JSON — do not hand-edit except for corrections
```

## Corrections

Data is edited as JSON and committed; there is no admin UI and no database (see SPEC §12).

- **Map numbers** — fix `src/data/maps.json`, then run `npm run data:verify`.
- **Doll facts** — fix `src/data/dolls.json` and note why in the commit. Re-running the extractor
  overwrites hand edits, so corrections that should survive a re-crawl belong in the extractor.
- **Formula behaviour** — change `src/lib/farming.ts`, never the JSON, and re-run `data:verify`.

## Licences

- **Code** — MIT.
- **Data files** (`src/data/*.json`) — CC BY-SA 3.0, because doll facts derive from IOP Wiki.
- **Guide prose** — original to this site.

Girls' Frontline is the property of Sunborn Network Technology / MICA Team. This site is an
unofficial, non-commercial fan reference and is not affiliated with them.

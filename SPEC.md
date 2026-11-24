# Frontline Reference — SPEC

A static, English-language reference site for **Girls' Frontline 1** (the original game, not GFL2: Exilium).

Status: **v1 in build**. This document records every decision made during the design interview. If a
week-2 decision starts to drift, this file wins.

---

## 1. What this site is

An **archival reference**, not a live news site.

The GFL1 main story ended with Episode 15.9 "Quantum Fluctuation" (EN ran it 2026-05-12 → 2026-06-02).
EN changelog activity thinned out and stopped being recorded after 2026-09-15. The game's data is
therefore effectively frozen — which makes a well-built reference site *more* durable, not less.

Consequences that follow from this:

- Every dataset carries a visible **"last verified" patch badge**. It is a feature, not an apology.
- No news section. No "updated hourly" promises.
- No account system, no login, no tracker. Nothing that implies ongoing service.

## 2. Audience

Two audiences, two routes, one homepage:

1. **New players** — arrive from a search, need to know what to do first. Served by one long
   `Start Here` page.
2. **Intermediate / veteran players** — arrive knowing the game, want numbers. Served by the two tools.

Homepage is **tool-first**: two large tool cards plus one `Start Here` block. It does not pick a
winner between the tools before there is usage data.

## 3. Scope of v1

| Area | What ships | Notes |
|---|---|---|
| **Farming Explorer** | All 572 autobattle maps, sortable/filterable table, 5 user-adjustable assumptions, live recomputation, ranking views | The flagship. Default filter: EN-released only. |
| **Doll Database** | All EN dolls, table + per-doll detail page with 3×3 tile buff grid and full skill text with a level selector | Limited stat fields, but skills are complete. See §5. |
| **Start Here** | One long page, ~1,500–2,000 words | The new-player entry point. |
| **Echelon presets** | 6 archetypal formations, static | Useful even if the builder never ships. |
| **Builder (minimal)** | 3×3 drag grid, tile buff aggregation per doll, shareable URL | *Stretch goal.* May be cut. |

### Explicitly out of scope for v1

- Composition validation rules (type-invalid tiles, 2 SMG/2 AR caps, CE checks) → v1.1
- Skill simulation / damage modelling → not on the roadmap
- Account tracker, collections, resource budgets → dropped entirely
- Side-by-side doll comparison mode → deferred
- Backend of any kind → **none, ever, for v1**
- Multi-language → English only

### Definition of done

Farming Explorer and Doll Database are live and spot-verified, Start Here is published, credits are
complete. The builder is a bonus, not a requirement.

## 4. Priority order when the 3 weeks run out

This was asked directly and answered: **farming explorer first, builder expendable.**

| Week | Deliverable |
|---|---|
| 1 | Scaffold, data pipeline, map normalization, doll extraction, first deploy |
| 2 | Farming Explorer complete: table, assumptions panel, rankings, Start Here |
| 3 | Doll Database: table, detail pages, tile grid, thumbnails, credits, sitemap, sample verification |
| week-3 surplus | Minimal builder |

If week 3 ends with the doll database half-finished, that is the accepted outcome. A half-built
builder is worse than no builder.

## 5. Data

### 5.1 Farming maps

Source: `Copy of GFL EN Autobattle Comparison.xlsx` (community spreadsheet). The author's own contact
details are in the file header; the site writes its own map table from the same raw inputs.

**The site never stores derived numbers.** It stores the raw inputs and recomputes everything in the
browser, so users can move the assumptions.

Raw inputs per map:

```
chapter, mapName, mapId, night, releasedOnEN,
nonAutoBaseExp, levelPenalty, requiredCE, requiredEchelonsNoCard,
manpowerAmmoMRE, parts, autobattleHours, autobattleBaseExp,
potentialDrops, limitedDrops
```

Derived (recomputed live, never stored):

```
weightedResources = (manpowerAmmoMRE + parts) * 3
autoContractCost  = min(ceil(autobattleHours), 3)
levelMultiplier   = f(tDollLevel - levelPenalty)      // see §7
totalEchelonExp   = g(autobattleBaseExp, levelMultiplier, links, card, expUp)
expPerResource    = totalEchelonExp / weightedResources
expPerHour        = totalEchelonExp / autobattleHours
expPerContract    = totalEchelonExp / autoContractCost
resourcesPerHour  = weightedResources / autobattleHours
```

### 5.2 Map data quirks that must be normalized at import

The source spreadsheet is hand-maintained and hostile to naive import:

- **169 of 572 map names carry a trailing non-breaking space** (`U+00A0`). Strip and normalize.
- Chapter names are inconsistent: `Main Story`, `MS`, `DR`, `Singu`, `Iso`, `Iso EX`, `SC`, `SC EX`,
  `PL`, `PL EX`, plus four full event titles. Map them to a controlled vocabulary and keep a
  `chapterLabel` for display.
- Map names mix conventions: `0-1`, `CH3 - White Doll`, `Sangvis Orphan`, `③`, `Spin Echo ∞`.
- **62 of 572 maps are not released on EN.** They ship, flagged and filterable. Default view hides
  them.
- `limitedDrops` is free text, sometimes empty, sometimes the literal `"Unknown for EN"`.
- One row ("Gaze ∞ - EX") hard-codes `requiredEchelons` instead of using a formula.

### 5.3 Dolls

Source: **IOP Wiki** (`iopwiki.com`), which is the only source with clear licensing
(CC BY-SA 3.0 text) and which carries every field needed.

Extraction method: **one-time script, output committed as JSON**. Not a runtime fetch. Not a build step.

Polite-crawling rules the script obeys:

- Uses the MediaWiki API with `action=query&generator=categorymembers&prop=revisions`, batching ~50
  pages per request
- `Crawl-delay: 20` honoured between requests
- Descriptive `User-Agent`
- Runs once; never again unless the wiki changes

Fields captured (Q13: all EN dolls, limited fields):

```
name, index, classification (HG/SMG/AR/RF/MG/SG), rarity,
min/max of dmg, acc, eva, rof, hp, mov,
aura1, aura2, aura3, aura4,
tile1..tile9,          // 1 = buff tile, 0 = standing, absent = nothing
moddable, mod3 stats,
releasedOnEN,
portrait: null         // reserved field, populated in v1.1
```

Skill text is captured in a **separate dataset** (`src/data/skills.json`), because it does not
live on the doll page at all — see §5.5.

### 5.5 Skills

Skills are not in a doll's wikitext. That template carries stats, auras and tiles only. Skills
live on **subpages** of the doll page, as MediaWiki `gf-table` markup:

```
Kar98k/skilldata        base skill
Kar98k/skilldata/mod1   the MOD1 upgrade of it
Kar98k/skill2data       the secondary skill, unlocked at MOD2
```

Each table is a key/value block: `name`, `icon` and `text` are single values, and every other row
is a per-level curve of ten numbers. The description is a template with `($placeholder)` tokens
that refer to those curves, which is what makes a level selector meaningful rather than cosmetic.

Extraction (`scripts/fetch-skills.mjs`) reads the source subpages through `action=query` with
`prop=revisions`, batching ~40 titles per request, and caches raw wikitext so re-parsing is free.
Reading the subpage rather than the rendered doll page matters: on the rendered page the same skill
table appears once per MOD tab with no attribute identifying which MOD each copy belongs to, while
the subpage title states it directly.

Three source irregularities are handled explicitly, each of which silently produced wrong output
before it was found:

| Irregularity | Symptom if unhandled |
|---|---|
| A cell's value begins on the line *after* the pipe (`! text` / `\| colspan=10 \|` / text…) | Empty description (Type 100 MOD1) |
| A value is slash-separated bands, e.g. `1.8/0.7/0.4` | Placeholder never resolves, raw token in prose (12 skills, e.g. StG44) |
| A page is an unfinished placeholder (K7 is literally named "Placeholder Name") | A joke presented as game data |

Coverage: **623 skill entries across 459 of 460 dolls**, including 82 MOD1 variants. KGP-9 has no
skill page on the wiki; K7's entry is flagged `isPlaceholder` and labelled as unfinished rather than
invented.

The dataset is verified two ways: `scripts/verify-skills.mjs` re-reads all 623 wiki pages with an
independent parser and compares name, cooldown curve, description and placeholder existence
(3,227 field checks), while `scripts/check-skills.ts` renders every skill at all ten levels and
asserts no placeholder token survives (19,307 assertions).

### 5.4 Licensing

| Artifact | License |
|---|---|
| Code | MIT |
| Data files (`src/data/*.json`) | CC BY-SA 3.0 |
| Doll facts | Derived from IOP Wiki, attributed on the Credits page |
| Thumbnails | Small, self-hosted, attributed, non-commercial, with takedown contact |

Cross-checking against unlicensed datamine repos (`gf-data-tools/*`, `randomqwerty/GFLData`) is allowed
for *verification*. **Copying from them is not.** They carry no license, which means all rights reserved.

## 6. Images

- **Self-hosted thumbnails, ≤100px.** No hotlinking. Hotlinking works today but depends on a
  third-party server and breaks silently if the wiki reorganises.
- Attribution on every page that shows artwork, plus a full Credits page.
- The site is non-commercial and states so.
- `portrait: null` exists in the schema from day one so adding images later needs no migration.

## 7. The farming formula (exact)

Transcribed from the spreadsheet, not paraphrased. `card`, `expUp`, `accountForLevel`, `tDollLevel`
and `links` are the five user-adjustable assumptions.

```
levelMultiplier(levelPenalty):
  if !accountForLevel        -> 1
  d = tDollLevel - levelPenalty
  if d < 0                  -> 1
  if d < 10                 -> 0.8
  if d < 20                 -> 0.6
  if d < 30                 -> 0.4
  if d < 40                 -> 0.2
  else                      -> CAPPED          // spreadsheet calls this "10 EXP"

echelons = card ? 1 : requiredEchelonsNoCard

totalEchelonExp =
  if levelMultiplier == CAPPED
    -> 10 * 5 * echelons
  else
    -> autobattleBaseExp * 10 * levelMultiplier
       * (expUp ? 1 + 0.5 * (links - 1) : 1)
       * 5.2
       * (1 + (card ? 0.5 : 0) + (expUp ? 0.5 : 0))
```

Defaults, matching the spreadsheet: `card=Y`, `expUp=Y`, `accountForLevel=Y`, `tDollLevel=90`, `links=5`.

**Verification gate:** the TypeScript engine is checked against the spreadsheet's cached computed
values for a sample of maps before release. Any mismatch is a bug in the engine, not in the data.

## 8. Differentiation

Griffin Archive already has a doll index with filters and a formation simulator with share links, and
it auto-refreshes daily. Competing head-on is a losing bet for a 3-week solo build.

What it does *not* do, and what this site therefore leads with:

1. **Tile buff aggregation** — "this doll receives +X RoF, +Y ACC from the tiles around it", computed
   from the 3×3 grid. Nobody computes this.
2. **Farming efficiency from raw inputs with adjustable assumptions** — the autobattle spreadsheet has
   no good web counterpart since GFL Corner went inactive.
3. **6 archetypal echelon presets** — not "current meta" (which is frozen), but formations that are
   always correct, with their real coverage computed rather than asserted.

### 8.1 The tile mechanic (corrected)

An earlier draft of this spec, and the first implementation, assumed that only the doll in the
centre of the echelon projects aura tiles, with everyone else purely receiving. **That is wrong**,
and it was wrong in a way that produced plausible output — which is the dangerous kind.

The actual rule, confirmed against IOP Wiki's own formation guide and multiple class guides:

- **Every** doll in the echelon projects her aura.
- A doll's `tiles` array is a *relative* pattern drawn around her own standing cell (the cell marked
  `0`). When she is placed anywhere in the 3×3, the pattern **translates** with her, and any aura
  cells that fall outside the grid are simply wasted.
- Some dolls' standing marker is not the centre (Px4 Storm stands on cell 8), so the standing cell
  has to be found by locating the `0`, never assumed to be index 4.
- An "Affects X" line is a **class filter** on top of the tile filter: only dolls of those classes
  standing on a covered cell receive the effect. A doll whose class is not listed gets nothing, even
  on a covered tile.
- Aura values are locked in at formation setup and do not change if the provider later dies.
- The grid's physical orientation (which row faces the enemy) is disputed between sources, so the
  code works in pure cell-index space and never claims a direction. Buffing arithmetic depends only
  on relative offsets, so orientation cannot change the result.

The lesson recorded here: the buff engine is the one part of this site that can be silently and
totally wrong, so it is covered by `scripts/check-echelon.ts` (geometry and aura parsing) and
`scripts/check-presets.ts` (every shipped formation must actually buff at least 4 of 5 dolls).
Both are part of `npm run check`.

## 9. Technical

- **React + Vite + TypeScript.** Not Vue. One language from data to UI.
- Tables are plain semantic `<table>` elements with local sorting state. TanStack Table was
  installed and then removed: three sortable tables did not justify the dependency, and hand-rolled
  tables keep the SSR render path trivial.
- The builder uses native HTML drag-and-drop plus click-to-place. `dnd-kit` was installed and then
  removed for the same reason.
- State: URL query params (shareable) + `localStorage` (sticky preferences). Both optional.
- **No backend.** No auth, no database, no API routes. Formation sharing is URL-encoded.
- Routing: client-side, but every route must be prerenderable/static so it can be indexed and shared.
- Deploy: **Cloudflare Workers with static assets** (`npx wrangler deploy`), `*.workers.dev`
  subdomain. No custom domain, no custom server.
  - The original plan said "Cloudflare Pages", which is a different product with a different
    configuration surface. The first real deploy failed because of it: Pages reads the output
    directory from the dashboard, while `wrangler deploy` reads it from `wrangler.toml`. Without
    an `[assets]` block Wrangler reports *"Missing entry-point to Worker script or to assets
    directory"* and the deploy dies after a successful build. See §9.1.
- Analytics: **Umami or Cloudflare Web Analytics** — cookieless, no consent banner.
- Analytics decision drives a real decision later: if the doll database gets no traffic, the builder
  gets cut.

### 9.1 Deploy configuration

`wrangler.toml` declares:

```toml
name = "frontline-reference"
compatibility_date = "2026-11-01"

[assets]
directory = "./dist"
not_found_handling = "single-page-application"
```

- `[assets].directory` is what makes `wrangler deploy` upload anything at all. This is the
  difference between a green build and a working deploy.
- `not_found_handling` is the *single* declaration of SPA fallback. An earlier version also shipped
  a `public/_redirects` with a blanket `/* /index.html 200`; that duplicated the rule, so the file
  was deleted rather than left as a second, competing source of truth.
- There is deliberately no `main` entry: the site has no server-side code.

## 10. Responsive strategy

**Desktop-first, mobile best-effort.** Chosen explicitly, with the cost understood:

- Farming Explorer: 15-column table. Horizontal scroll on mobile. No card layout. This is acceptable.
- Start Here and doll detail pages: readable and usable on mobile.
- No separate mobile layouts.

## 11. Site identity

- Working title: **Frontline Reference**
- Neutral, makes no claim of official status, describes exactly what it is.
- Visual language: dark theme, amber accent, strong typographic hierarchy. Evokes GFL's design
  language without using its assets.
- Pages that show GFL content carry a non-affiliation disclaimer.

## 12. Maintenance

- `Q24 = a`: **no admin UI, no editor, no server.** Data is edited as JSON and pushed.
- Doll data is generated by script and hand-corrected, never typed from scratch.
- Community PRs are welcome; a written contribution guide is part of v1.
- The repo is the source of truth. The deployed site is a build artifact of it.

## 13. Open questions deferred to v1.1

- Composition validation rules
- Doll comparison mode
- Whether the builder earned its place, judged by analytics

# Data licence — CC BY-SA 3.0

The files in this directory (`maps.json`, `maps.cached.json`, `dolls.json`) are licensed under
**Creative Commons Attribution-ShareAlike 3.0 Unported**.

<https://creativecommons.org/licenses/by-sa/3.0/>

## Why

`dolls.json` is derived from [IOP Wiki](https://iopwiki.com), whose text is published under
CC BY-SA 3.0. A derivative dataset has to carry the same licence, so this directory is share-alike
while the code is MIT.

`maps.json` comes from a community spreadsheet of autobattle farming data and is released under the
same terms for consistency — the underlying facts are not copyrightable, but the compilation is
worth sharing on clear terms.

## What you must do if you reuse it

1. **Attribute** IOP Wiki (for doll data) and the *GFL EN Autobattle Comparison* spreadsheet
   (for map data), with a link back to this repository.
2. **Share alike** — if you redistribute a modified version of these files, license it under
   CC BY-SA 3.0 as well.
3. **Do not imply endorsement** by Sunborn, MICA Team, or this project.

## What this licence does not cover

Game names, marks and artwork belong to Sunborn Network Technology / MICA Team. Nothing here grants
any right to Girls' Frontline itself. This project is unofficial and non-commercial.

## Regenerating

Both files are generated, not hand-written:

- `maps.json` — `python scripts/build-maps.py` (needs `openpyxl`)
- `dolls.json` — `node scripts/fetch-dolls.mjs` (crawls IOP Wiki politely, once)

Hand corrections are welcome, but note that re-running the dolls extractor overwrites them; a
correction that should survive a re-crawl belongs in the extractor script instead.

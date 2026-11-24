#!/usr/bin/env python3
"""
One-time extraction: autobattle spreadsheet -> src/data/maps.json

Stores ONLY raw inputs. The cached computed columns from the spreadsheet are written
to a separate file (maps.cached.json) purely so scripts/verify-formulas can prove the
TypeScript engine reproduces them. The site never reads the cached file.

Run:  python scripts/build-maps.py
"""

import datetime
import json
import pathlib
import re
import sys
import unicodedata

try:
    import openpyxl
except ModuleNotFoundError:  # pragma: no cover - guidance, not logic
    sys.exit(
        "This script needs openpyxl to read the .xlsx source.\n"
        "\n"
        "  pip install openpyxl\n"
        "\n"
        "It also needs to run under a Python that has openpyxl installed — the interpreter on\n"
        "PATH may not be the one you think. Confirm with:  python -c \"import openpyxl\"\n"
        "Then run:  python scripts/build-maps.py\n"
    )

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "Copy of GFL EN Autobattle Comparison.xlsx"
OUT_DATA = ROOT / "src" / "data" / "maps.json"
OUT_CACHE = ROOT / "src" / "data" / "maps.cached.json"

FIRST_ROW = 4
LAST_ROW = 575

# Column letters in the source sheet, mapped to our field names.
COLS = {
    "entry": "A",
    "chapter": "B",
    "mapName": "C",
    "nonAutoBaseExp": "D",
    "levelPenalty": "E",
    "requiredCE": "F",
    "manpowerAmmoMRE": "H",
    "parts": "I",
    "autobattleHours": "K",
    "autobattleBaseExp": "L",
    "potentialDrops": "S",
    "limitedDrops": "T",
    "mapId": "U",
    "night": "V",
    "releasedOnEN": "W",
    "requiredEchelonsNoCard": "X",
}

CACHED = {
    "weightedResources": "J",
    "autoContractCost": "M",
    "totalEchelonExp": "N",
    "expPerResource": "O",
    "expPerHour": "P",
    "expPerContract": "Q",
    "resourcesPerHour": "R",
    "levelMultiplier": "Y",
}

COL_INDEX = {k: openpyxl.utils.column_index_from_string(v) for k, v in COLS.items()}
CACHE_INDEX = {
    k: openpyxl.utils.column_index_from_string(v) for k, v in CACHED.items()
}


def clean_text(value):
    """Normalize a hand-maintained text cell: strip NBSP, collapse whitespace, repair encoding."""
    if value is None:
        return None
    text = str(value)
    text = unicodedata.normalize("NFKC", text)
    text = text.replace("\u00a0", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text or None


def as_float(value):
    if value is None:
        return None
    if isinstance(value, str):
        return None
    return float(value)


def hours_of(value):
    """The sheet stores autobattle duration as an Excel time-of-day."""
    if value is None:
        return None
    if isinstance(value, datetime.time):
        return value.hour + value.minute / 60 + value.second / 3600
    if isinstance(value, datetime.timedelta):
        return value.total_seconds() / 3600
    if isinstance(value, (int, float)):
        return float(value) * 24  # raw Excel day fraction
    return None


def slug_for(chapter, map_name, map_id):
    base = f"{chapter or ''}-{map_name or ''}".lower()
    base = re.sub(r"[^a-z0-9]+", "-", base).strip("-")
    return f"{base}-{int(map_id) if map_id is not None else 'unknown'}"


# Derived columns whose cells are *supposed* to be formulas. Any row where one of these is
# hard-typed is a manual override by the spreadsheet author, and is recorded explicitly so
# the site can honour it and say so, instead of silently disagreeing with the source.
FORMULA_COLS = {
    "weightedResources": "J",
    "autoContractCost": "M",
    "totalEchelonExp": "N",
    "expPerResource": "O",
    "expPerHour": "P",
    "expPerContract": "Q",
    "resourcesPerHour": "R",
    "levelMultiplier": "Y",
}
FORMULA_INDEX = {
    k: openpyxl.utils.column_index_from_string(v) for k, v in FORMULA_COLS.items()
}


def find_overrides(sheet, row):
    """Return {field: value} for derived cells on this row that are hard-typed, not formulas."""
    overrides = {}
    for field, col in FORMULA_INDEX.items():
        value = sheet.cell(row=row, column=col).value
        if value is None:
            continue
        if isinstance(value, str) and value.startswith("="):
            continue
        overrides[field] = value
    return overrides or None


def build():
    formulas = openpyxl.load_workbook(SRC, data_only=False)["Data"]
    values = openpyxl.load_workbook(SRC, data_only=True)["Data"]

    assumptions = {
        "autobattleCard": formulas["G1"].value,
        "expUp": formulas["I1"].value,
        "accountForTDollLevel": formulas["K1"].value,
        "tDollLevel": formulas["M1"].value,
        "links": formulas["O1"].value,
    }

    maps = []
    cached = {}

    for row in range(FIRST_ROW, LAST_ROW + 1):
        raw = {k: values.cell(row=row, column=i).value for k, i in COL_INDEX.items()}
        if raw["entry"] is None and raw["mapName"] is None:
            continue

        chapter = clean_text(raw["chapter"])
        map_name = clean_text(raw["mapName"])
        map_id = raw["mapId"]

        entry = {
            "slug": slug_for(chapter, map_name, map_id),
            "entry": int(raw["entry"]) if raw["entry"] is not None else None,
            "chapter": chapter,
            "mapName": map_name,
            "mapId": int(map_id) if map_id is not None else None,
            "night": clean_text(raw["night"]) == "Y",
            "releasedOnEN": clean_text(raw["releasedOnEN"]) == "Y",
            "nonAutoBaseExp": as_float(raw["nonAutoBaseExp"]),
            "levelPenalty": as_float(raw["levelPenalty"]),
            "requiredCE": as_float(raw["requiredCE"]),
            "requiredEchelonsNoCard": as_float(raw["requiredEchelonsNoCard"]),
            "manpowerAmmoMRE": as_float(raw["manpowerAmmoMRE"]),
            "parts": as_float(raw["parts"]),
            "autobattleHours": hours_of(raw["autobattleHours"]),
            "autobattleBaseExp": as_float(raw["autobattleBaseExp"]),
            "potentialDrops": as_float(raw["potentialDrops"]),
            "limitedDrops": clean_text(raw["limitedDrops"]),
        }
        maps.append(entry)

        snap = {k: values.cell(row=row, column=i).value for k, i in CACHE_INDEX.items()}
        cached[entry["slug"]] = {
            "weightedResources": as_float(snap["weightedResources"]),
            "autoContractCost": as_float(snap["autoContractCost"]),
            "totalEchelonExp": as_float(snap["totalEchelonExp"]),
            "expPerResource": as_float(snap["expPerResource"]),
            "expPerHour": as_float(snap["expPerHour"]),
            "expPerContract": as_float(snap["expPerContract"]),
            "resourcesPerHour": as_float(snap["resourcesPerHour"]),
            "levelMultiplier": snap["levelMultiplier"],
        }

        override = find_overrides(formulas, row)
        if override:
            entry["manualOverride"] = {
                "fields": {k: as_float(v) for k, v in override.items()},
                "note": (
                    "The source spreadsheet hard-types these derived values instead of using "
                    "formulas, so they differ from what the formulas would produce. The site "
                    "honours the spreadsheet's numbers and flags the row."
                ),
            }
            print(f"  note: manual override on {entry['slug']} -> {sorted(override)}")

    # A slug must be unique: the sheet has no duplicate (chapter, map) pairs, but
    # slugs also fold punctuation, so de-duplicate defensively.
    seen = {}
    for entry in maps:
        slug = entry["slug"]
        if slug in seen:
            seen[slug] += 1
            entry["slug"] = f"{slug}-{seen[slug]}"
        else:
            seen[slug] = 1

    chapters = sorted({m["chapter"] for m in maps if m["chapter"]})
    out = {
        "meta": {
            "source": "GFL EN Autobattle Comparison (community spreadsheet)",
            "generatedAt": datetime.date.today().isoformat(),
            "patch": "EN client 3.08 / post-Episode 15.9",
            "mapCount": len(maps),
            "releasedCount": sum(1 for m in maps if m["releasedOnEN"]),
            "chapters": chapters,
            "spreadsheetAssumptions": assumptions,
        },
        "maps": maps,
    }

    OUT_DATA.parent.mkdir(parents=True, exist_ok=True)
    OUT_DATA.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    OUT_CACHE.write_text(
        json.dumps(cached, ensure_ascii=False, indent=1), encoding="utf-8"
    )

    print(f"wrote {OUT_DATA}  ({len(maps)} maps)")
    print(f"wrote {OUT_CACHE}  ({len(cached)} cached rows)")
    print(f"  released on EN: {out['meta']['releasedCount']}")
    print(f"  chapters: {', '.join(chapters)}")
    print(f"  assumptions from sheet: {assumptions}")

    missing = [m for m in maps if m["autobattleHours"] is None]
    if missing:
        print(f"  WARNING: {len(missing)} maps missing autobattleHours")


if __name__ == "__main__":
    build()

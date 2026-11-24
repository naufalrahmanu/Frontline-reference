/**
 * Echelon geometry and tile-buff aggregation.
 *
 * ## The mechanic
 *
 * Every doll placed in the echelon projects her own aura. There is no "only the centre buffs"
 * rule — that was a wrong assumption in an earlier version of this file, and it produced
 * plausible-looking output, which is the dangerous kind of wrong.
 *
 * A doll's `tiles` array is a *relative* pattern drawn around her own cell: one cell is marked
 * `0` (her standing position) and the cells marked `1` are the aura. When she is placed
 * anywhere in the grid the pattern **translates** with her, and aura cells that fall outside the
 * 3x3 are simply wasted.
 *
 * Two independent consequences follow, and both are easy to get wrong:
 *
 *  1. A doll does not have to stand in the centre to buff. UMP45's pattern is tiles 1/4/7 —
 *     one whole column behind her — so at position 5 she buffs 1, 4 and 7. Put her at 8 and she
 *     buffs 7 and 9 instead, and the 1/4 column is off the board.
 *  2. Some dolls' standing cell is *not* the centre (Px4 Storm stands on 8). Taking `tiles[4]`
 *     as "the centre" is wrong for those dolls; the standing cell has to be found by looking for
 *     the `0`.
 *
 * ## Numbering
 *
 * The wiki draws the grid with 7 8 9 on top and 1 2 3 at the bottom, and the in-game formation
 * screen may be rotated relative to that. Sources disagree about which physical direction is
 * "front", so this module works in plain cell-index space and never claims a compass direction.
 * Because the arithmetic is pure translation, the choice of orientation cannot change which
 * dolls buff which — only how a diagram is drawn.
 *
 * ## Class filtering
 *
 * An aura line like "Affects assault rifles" is a targeting restriction: only dolls of those
 * classes standing on a buffed cell receive the effect. A doll whose class is not listed gets
 * nothing, even on a covered tile.
 */

import type { Classification, Doll } from "./dolls.ts";

export type Position = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export const ALL_POSITIONS: readonly Position[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/**
 * Display order for the grid, matching how IOP Wiki draws a doll's tile pattern.
 * Row-major in this order: 7 8 9 / 4 5 6 / 1 2 3.
 */
export const GRID_DISPLAY_ORDER: readonly Position[] = [7, 8, 9, 4, 5, 6, 1, 2, 3];

/** Cell index (0-8) -> 2D coordinates in index space. */
export function cellCoords(index: number): { row: number; col: number } {
  return { row: Math.floor(index / 3), col: index % 3 };
}

/** Where a doll's own standing cell sits in her tile pattern. */
export function standingIndex(tiles: ReadonlyArray<number | null>): number | null {
  const i = tiles.findIndex((t) => t === 0);
  return i >= 0 ? i : null;
}

/**
 * The cells a doll buffs, given the position she occupies.
 *
 * Translates the aura pattern from her standing cell to her actual cell. Returns positions that
 * land inside the 3x3 only; the rest would be off-board in game.
 */
export function buffedPositions(
  doll: Pick<Doll, "tiles">,
  at: Position = 5,
): Position[] {
  const origin = standingIndex(doll.tiles);
  const target = at - 1;

  // No standing marker: treat the pattern as already centred on the doll.
  if (origin === null) {
    return ALL_POSITIONS.filter((p) => doll.tiles[p - 1] === 1);
  }

  const o = cellCoords(origin);
  const t = cellCoords(target);
  const dr = t.row - o.row;
  const dc = t.col - o.col;

  const out: Position[] = [];
  doll.tiles.forEach((value, index) => {
    if (value !== 1) return;
    const c = cellCoords(index);
    const row = c.row + dr;
    const col = c.col + dc;
    if (row < 0 || row > 2 || col < 0 || col > 2) return; // aura falls off the board
    out.push((row * 3 + col + 1) as Position);
  });
  return out.sort((a, b) => a - b);
}

/** Does this doll, standing at `at`, project aura onto `target`? */
export function buffsPosition(
  doll: Pick<Doll, "tiles">,
  target: Position,
  at: Position = 5,
): boolean {
  return buffedPositions(doll, at).includes(target);
}

// ---------------------------------------------------------------------------
// Aura parsing
// ---------------------------------------------------------------------------

export type StatKey = "dmg" | "rof" | "acc" | "eva" | "crit" | "armor" | "skill" | "other";

export interface AuraEffect {
  stat: StatKey;
  /** Raw value as written on the wiki, e.g. 18 for "18%". */
  value: number;
  /** True when the wiki writes it as a percentage. */
  percent: boolean;
  /** The original wiki text, always shown verbatim alongside the parse. */
  raw: string;
}

export interface ParsedAura {
  /** Classes the aura targets. Empty means every class. */
  affects: Classification[];
  /** Whether the affets line was explicitly "all guns" / "all classes". */
  affectsAll: boolean;
  effects: AuraEffect[];
  /** Set when some aura line could not be interpreted, so the UI can warn instead of guess. */
  unparsed: string[];
}

/**
 * Class vocabulary found in the wiki's "Affects ..." lines.
 *
 * The dataset contains 38 distinct spellings of this line, including "machineguns",
 * "sub machineguns", "submachineguns", "MGs", "pistols" and trailing periods. A naive set of
 * regexes silently failed on several — "Affects machineguns" matched nothing, which would have
 * made every shotgun buff invisible — and a bare /rifle/ also matched the "rifle" inside
 * "assault rifle", corrupting AR lines. See parseAffectsClause for how nesting is handled.
 */
const UNIVERSAL = /all\s+(guns?|classes?|types?|weapons?|dolls?)/;

/**
 * Extract the classes an "Affects ..." clause targets.
 *
 * Returns `{ classes, universal }`. `universal` is true for "all guns" and friends; `classes`
 * is empty and universal false when the clause could not be read at all, which the caller should
 * treat as "no restriction" rather than "nothing" — an unreadable line must not silently delete
 * a buff.
 *
 * Implementation note: the class names nest. "submachine guns" contains "machine gun", and
 * "assault rifles" contains "rifle". Rather than rely on lookbehind alone (which fails on the
 * "sub machineguns" spelling, where the prefix is separated by a space), each SMG/AR phrase is
 * blanked out of the string before the shorter MG/RF stems are tested. That makes the
 * containment explicit instead of accidental.
 */
export function parseAffectsClause(clause: string): {
  classes: Classification[];
  universal: boolean;
} {
  const normalised = clause
    .toLowerCase()
    .replace(/[().]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (UNIVERSAL.test(normalised)) return { classes: [], universal: true };

  const classes: Classification[] = [];
  const add = (cls: Classification) => {
    if (!classes.includes(cls)) classes.push(cls);
  };

  // 1. Compound names first, and remove them so their parts cannot match below.
  let rest = normalised;
  if (/assault\s*rifle/.test(rest)) {
    add("AR");
    rest = rest.replace(/assault\s*rifles?/g, " ");
  }
  if (/sub\s*machine\s*guns?|submachine\s*guns?/.test(rest)) {
    add("SMG");
    rest = rest.replace(/sub\s*machine\s*guns?|submachine\s*guns?/g, " ");
  }

  // 2. Remaining single classes, on what is left of the string.
  if (/machine\s*guns?|\bmgs?\b/.test(rest)) add("MG");
  if (/shot\s*guns?|\bsgs?\b/.test(rest)) add("SG");
  if (/hand\s*guns?|pistols?|\bhgs?\b/.test(rest)) add("HG");
  if (/rifles?|\brfs?\b/.test(rest)) add("RF");

  return { classes, universal: false };
}

/**
 * Interpret one aura line's numeric effect.
 *
 * The wiki writes these as prose ("Increases damage by 18%", "Reduce skill cooldown by 18%").
 * Parsing is deliberately shallow: it extracts a stat and a number where it confidently can and
 * reports `other` otherwise. The UI always shows the raw string next to the parse, so a bad read
 * is visible rather than silently authoritative.
 */
export function parseAuraLine(raw: string): AuraEffect {
  const lower = raw.toLowerCase();
  const percent = lower.includes("%");
  const numberMatch = lower.match(/(-?\d+(?:\.\d+)?)\s*%?/);
  const value = numberMatch ? Number(numberMatch[1]) : 0;

  let stat: StatKey = "other";
  if (/\b(damage|dmg)\b/.test(lower)) stat = "dmg";
  else if (/\b(rate of fire|rof)\b/.test(lower)) stat = "rof";
  else if (/\b(accuracy|acc)\b/.test(lower)) stat = "acc";
  else if (/\b(evasion|eva)\b/.test(lower)) stat = "eva";
  else if (/\bcrit/.test(lower)) stat = "crit";
  else if (/\barmor\b/.test(lower)) stat = "armor";
  else if (/\b(cooldown|skill)\b/.test(lower)) stat = "skill";

  return { stat, value, percent, raw };
}

/**
 * Parse a doll's four aura slots into a targeting declaration plus a list of effects.
 *
 * Slot 1 is conventionally the "Affects ..." line and the rest are the effects, but this does
 * not assume that: any line starting with "affects" is treated as targeting wherever it appears.
 */
export function parseAura(aura: ReadonlyArray<string | null>): ParsedAura {
  const affects: Classification[] = [];
  let affectsAll = false;
  const effects: AuraEffect[] = [];
  const unparsed: string[] = [];

  for (const raw of aura) {
    if (!raw) continue;
    const lower = raw.toLowerCase().trim();

    const affectsMatch = lower.match(/^affects\s+(.+)$/);
    if (affectsMatch) {
      const parsed = parseAffectsClause(affectsMatch[1] ?? "");
      if (parsed.universal) {
        affectsAll = true;
      } else {
        for (const cls of parsed.classes) {
          if (!affects.includes(cls)) affects.push(cls);
        }
        // A clause we could not read must not be treated as "affects nothing".
        if (parsed.classes.length === 0) affectsAll = true;
      }
      continue;
    }

    const effect = parseAuraLine(raw);
    if (effect.stat === "other" && effect.value === 0) {
      unparsed.push(raw);
      continue;
    }
    effects.push(effect);
  }

  return { affects, affectsAll, effects, unparsed };
}

export const STAT_LABEL: Record<StatKey, string> = {
  dmg: "Damage",
  rof: "Rate of fire",
  acc: "Accuracy",
  eva: "Evasion",
  crit: "Crit rate",
  armor: "Armor",
  skill: "Skill cooldown",
  other: "Other",
};

// ---------------------------------------------------------------------------
// Formation
// ---------------------------------------------------------------------------

export interface Placement {
  position: Position;
  dollSlug: string;
}

export interface BuffSource {
  fromSlug: string;
  fromName: string;
  fromPosition: Position;
  effect: AuraEffect;
}

export interface AggregatedBuff {
  stat: StatKey;
  total: number;
  percent: boolean;
  sources: BuffSource[];
}

/** Does `receiver` accept this aura, given the provider's targeting declaration? */
export function acceptsAura(
  parsed: ParsedAura,
  receiver: Pick<Doll, "classification">,
): boolean {
  if (parsed.affectsAll || parsed.affects.length === 0) return true;
  if (!receiver.classification) return false;
  return parsed.affects.includes(receiver.classification);
}

/**
 * Every buff a placed doll receives from the rest of the formation.
 *
 * A doll at position P receives an effect from doll D when D's aura covers P *and* the aura's
 * class filter admits P's occupant. A doll standing on her own aura tiles gets nothing from
 * herself, which is what the game does.
 */
export function incomingBuffs(
  placement: Placement,
  formation: readonly Placement[],
  bySlug: (slug: string) => Doll | undefined,
): AggregatedBuff[] {
  const receiver = bySlug(placement.dollSlug);
  if (!receiver) return [];

  const out = new Map<StatKey, AggregatedBuff>();

  for (const other of formation) {
    if (other.position === placement.position) continue; // a doll never buffs herself

    const source = bySlug(other.dollSlug);
    if (!source) continue;
    if (!buffsPosition(source, placement.position, other.position)) continue;

    const parsed = parseAura(source.aura);
    if (!acceptsAura(parsed, receiver)) continue;

    for (const effect of parsed.effects) {
      const existing = out.get(effect.stat);
      const source_ = {
        fromSlug: source.slug,
        fromName: source.name,
        fromPosition: other.position,
        effect,
      };
      if (existing) {
        existing.total += effect.value;
        existing.sources.push(source_);
      } else {
        out.set(effect.stat, {
          stat: effect.stat,
          total: effect.value,
          percent: effect.percent,
          sources: [source_],
        });
      }
    }
  }

  return [...out.values()].sort((a, b) => b.total - a.total);
}

/**
 * Which dolls in a formation are currently projecting onto a given position, ignoring class
 * filtering. Used by the builder to explain coverage independently of who is standing there.
 */
export function coverageOf(
  target: Position,
  formation: readonly Placement[],
  bySlug: (slug: string) => Doll | undefined,
): Array<{ doll: Doll; position: Position }> {
  const out: Array<{ doll: Doll; position: Position }> = [];
  for (const other of formation) {
    if (other.position === target) continue;
    const doll = bySlug(other.dollSlug);
    if (!doll) continue;
    if (buffsPosition(doll, target, other.position)) out.push({ doll, position: other.position });
  }
  return out;
}

/**
 * T-Doll types and data access.
 *
 * Field set is deliberately narrow (see SPEC §5.3): identification, max stats, aura text and
 * the 3x3 tile layout. Skill text is not captured in v1, and the schema leaves room for it
 * without a migration.
 */

export type Classification = "HG" | "SMG" | "AR" | "RF" | "MG" | "SG";

export const CLASSIFICATIONS: readonly Classification[] = ["HG", "SMG", "AR", "RF", "MG", "SG"];

/** Pair of [minimum at level 1, maximum at level 100]. Either side may be null. */
export type StatRange = [number | null, number | null];

export interface Doll {
  slug: string;
  name: string;
  /** In-game index number; ordering key for the whole database. */
  index: number | null;
  classification: Classification | null;
  /**
   * Star rarity 2-5, or null for collaboration dolls, which the wiki marks "EXTRA" and which
   * have no star rating. Check `rarityLabel` for the raw string.
   */
  rarity: number | null;
  /** Raw rarity string from the wiki, e.g. "5" or "EXTRA". */
  rarityLabel: string | null;
  stats: {
    dmg: StatRange;
    acc: StatRange;
    eva: StatRange;
    rof: StatRange;
    hp: StatRange;
    mov: number | null;
  };
  /** Up to four aura lines, in wiki order. `aura1` is usually the "Affects ..." line. */
  aura: Array<string | null>;
  /**
   * Nine entries, row-major 1-9.
   *   1 = buff tile, 0 = this doll's own standing tile, null = empty cell.
   */
  tiles: Array<number | null>;
  moddable: boolean;
  /**
   * Tile layout after Neural Upgrade, or null when the upgrade does not change any tile.
   * Most MOD3 upgrades alter stats only; rendering an identical grid would imply a change that
   * did not happen, so the extractor nulls the field when nothing differs.
   */
  modTiles: Array<number | null> | null;
  mod3Stats: {
    dmg: number | null;
    acc: number | null;
    eva: number | null;
    rof: number | null;
    hp: number | null;
  } | null;
  craftTime: string | null;
  artist: string | null;
  releasedOnEN: boolean;
  /** Reserved for v1.1; always null in v1. See SPEC §6. */
  portrait: string | null;
  /** Wiki file name the portrait would come from, kept so v1.1 needs no re-crawl. */
  portraitSource: string | null;
  source: string;
}

export interface DollData {
  meta: {
    source: string;
    generatedAt: string;
    totalDolls: number;
    releasedOnEN: number;
    fields: string[];
    note: string;
  };
  dolls: Doll[];
}

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
  /**
   * Skills live in a separate dataset (`src/data/skills.json`) keyed by doll slug, because they
   * come from different wiki pages and are fetched by a separate script. This field is populated
   * at load time in `data.ts`, not by the doll extractor.
   */
  skills?: DollSkill[];
  /** Reserved for v1.1; always null in v1. See SPEC §6. */
  portrait: string | null;
  /** Wiki file name the portrait would come from, kept so v1.1 needs no re-crawl. */
  portraitSource: string | null;
  source: string;
}

/**
 * One skill, from one wiki subpage.
 *
 * A doll can have several: the base skill (`skilldata`), the MOD2 secondary skill
 * (`skill2data`), and per-MOD variants of either (`skilldata/mod1`, …). Numeric rows are
 * per-level curves — the wiki lists ten values, one per skill level.
 */
export interface DollSkill {
  /** Which subpage kind this came from. */
  source: string;
  /** "base", or "mod1"/"mod2"/"mod3" for a Neural Upgrade variant. */
  tier: string;
  /** 1 = primary skill, 2 = the secondary skill unlocked at MOD2. */
  slot: number;
  name: string;
  icon: string | null;
  /** Description with ($placeholder) tokens intact, exactly as the wiki writes it. */
  text: string;
  /** Placeholder names referenced by the text, e.g. ["min_dam_value", "max_dam_value"]. */
  placeholders: string[];
  /** Cooldown per level, or null. */
  cooldown: number[] | null;
  /** Initial cooldown per level, or null. */
  initial: number[] | null;
  /** Every numeric row: name -> array of per-level values. */
  curves: Record<string, number[]>;
  /**
   * Rows whose per-level value is itself several slash-separated numbers, e.g. "1.8/0.7/0.4"
   * (damage falloff by distance band). Shape: name -> per level -> number[].
   */
  tieredCurves?: Record<string, number[][]>;
  /** Rows that were not numeric (rare). */
  singleValues: Record<string, string | string[]>;
  /** How many levels this skill has (usually 10). */
  levels: number;
  /** True when the wiki page itself is an unfinished placeholder rather than real game data. */
  isPlaceholder?: boolean;
  /** Source page title on the wiki, for attribution. */
  page: string;
}

export interface SkillData {
  meta: {
    source: string;
    generatedAt: string;
    dollsWithSkills: number;
    totalSkillEntries: number;
    modEntries: number;
    note: string;
  };
  skills: Record<string, DollSkill[]>;
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

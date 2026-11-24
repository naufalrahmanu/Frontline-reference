/**
 * Autobattle farming efficiency engine.
 *
 * This is a direct transcription of the community spreadsheet's formulas. The spreadsheet
 * stores derived values, which is exactly what makes it hard to reuse: you cannot ask it
 * "what if I had no autobattle card?". Here the raw inputs are the only stored data and
 * everything is recomputed, so the five assumptions can move.
 *
 * Spreadsheet column mapping (sheet "Data"):
 *   G = Required Echelons            -> echelons()
 *   J = Weighted Resources           -> weightedResources()
 *   M = Auto Contract Cost           -> autoContractCost()
 *   N = Total Ech Exp                -> totalEchelonExp()
 *   O = Exp/Resources                -> expPerResource()
 *   P = Exp/Hour                     -> expPerHour()
 *   Q = Exp/Contract                 -> expPerContract()
 *   R = Resources/Hour               -> resourcesPerHour()
 *   Y = Level Penalty Multiplier     -> levelMultiplier()
 *
 * Verified against the spreadsheet's cached values by scripts/verify-formulas.mjs.
 */

export interface MapRaw {
  slug: string;
  entry: number | null;
  chapter: string | null;
  mapName: string | null;
  mapId: number | null;
  night: boolean;
  releasedOnEN: boolean;
  nonAutoBaseExp: number | null;
  levelPenalty: number | null;
  requiredCE: number | null;
  requiredEchelonsNoCard: number | null;
  manpowerAmmoMRE: number | null;
  parts: number | null;
  autobattleHours: number | null;
  autobattleBaseExp: number | null;
  potentialDrops: number | null;
  limitedDrops: string | null;
  /**
   * Present on rows where the source spreadsheet hard-types derived values instead of using
   * formulas. The site honours the author's numbers and marks the row, rather than quietly
   * disagreeing with the source it claims to archive.
   */
  manualOverride?: {
    fields: Partial<Record<keyof MapMetrics, number>>;
    note: string;
  };
}

export interface Assumptions {
  /** Autobattle card owned: halves the echelons required and adds a +50% exp bonus. */
  autobattleCard: boolean;
  /** Exp Up active (the consumable): +50% base, plus a link-scaling bonus. */
  expUp: boolean;
  /** Whether to apply the level-penalty table at all. */
  accountForTDollLevel: boolean;
  /** Level of the T-Doll being levelled. */
  tDollLevel: number;
  /** Link count of the T-Doll being levelled (dummies). */
  links: number;
}

export const DEFAULT_ASSUMPTIONS: Assumptions = {
  autobattleCard: true,
  expUp: true,
  accountForTDollLevel: true,
  tDollLevel: 90,
  links: 5,
};

/** The spreadsheet's sentinel for "level gap too large, exp is pinned to a floor". */
export const EXP_CAPPED = "capped" as const;
export type LevelMultiplier = number | typeof EXP_CAPPED;

export interface MapMetrics {
  echelons: number;
  weightedResources: number;
  autoContractCost: number;
  levelMultiplier: LevelMultiplier;
  totalEchelonExp: number;
  expPerResource: number;
  expPerHour: number;
  expPerContract: number;
  resourcesPerHour: number;
}

/**
 * Column G: `IF(card="Y", 1, echelonsWithoutCard)`.
 *
 * The autobattle card is why one echelon can clear a map that otherwise needs two or three.
 */
export function echelons(map: MapRaw, a: Assumptions): number {
  if (a.autobattleCard) return 1;
  return map.requiredEchelonsNoCard ?? 1;
}

/**
 * Column J: `SUM(manpowerAmmoMRE, parts) * 3`.
 *
 * The `* 3` is the spreadsheet author's resource weighting: manpower/ammo/rations and parts
 * are not interchangeable at face value, and these are the author's chosen coefficients.
 */
export function weightedResources(map: MapRaw): number {
  return ((map.manpowerAmmoMRE ?? 0) + (map.parts ?? 0)) * 3;
}

/**
 * Column M: `MIN(ROUNDUP(hours, 0), 3)`.
 *
 * An autobattle contract is consumed per started hour, but capped at 3 per run.
 */
export function autoContractCost(map: MapRaw): number {
  const hours = map.autobattleHours ?? 0;
  return Math.min(Math.ceil(hours), 3);
}

/**
 * Column Y: the level penalty table.
 *
 * Level gap under 10 -> 0.8x, then 0.6, 0.4, 0.2, and past a gap of 40 the map stops
 * giving normal exp entirely and falls back to a flat 50 exp per echelon.
 */
export function levelMultiplier(map: MapRaw, a: Assumptions): LevelMultiplier {
  if (!a.accountForTDollLevel) return 1;
  const gap = a.tDollLevel - (map.levelPenalty ?? 0);
  if (gap < 0) return 1;
  if (gap < 10) return 0.8;
  if (gap < 20) return 0.6;
  if (gap < 30) return 0.4;
  if (gap < 40) return 0.2;
  return EXP_CAPPED;
}

/**
 * Column N:
 *   IF(mult = "capped", 10 * 5 * echelons,
 *      baseExp * 10 * mult
 *        * IF(expUp="N", 1, 1 + 0.5*(links-1))
 *        * 5.2
 *        * (1 + card*0.5 + expUp*0.5))
 *
 * The bare `10 * 5` in the capped branch is the spreadsheet's hard-coded floor: 10 exp per
 * doll times 5 dolls per echelon, regardless of the real base exp.
 */
export function totalEchelonExp(map: MapRaw, a: Assumptions): number {
  const mult = levelMultiplier(map, a);
  const ech = echelons(map, a);

  if (mult === EXP_CAPPED) return 10 * 5 * ech;

  const base = map.autobattleBaseExp ?? 0;
  const linkBonus = a.expUp ? 1 + 0.5 * (a.links - 1) : 1;
  const cardBonus = a.autobattleCard ? 0.5 : 0;
  const expUpBonus = a.expUp ? 0.5 : 0;

  return base * 10 * mult * linkBonus * 5.2 * (1 + cardBonus + expUpBonus);
}

function safeDiv(numerator: number, denominator: number): number {
  if (!denominator || !Number.isFinite(denominator)) return 0;
  return numerator / denominator;
}

export function computeMetrics(map: MapRaw, a: Assumptions): MapMetrics {
  const mult = levelMultiplier(map, a);
  const wr = weightedResources(map);
  const contract = autoContractCost(map);
  const exp = totalEchelonExp(map, a);
  const hours = map.autobattleHours ?? 0;

  const computed: MapMetrics = {
    echelons: echelons(map, a),
    weightedResources: wr,
    autoContractCost: contract,
    levelMultiplier: mult,
    totalEchelonExp: exp,
    expPerResource: safeDiv(exp, wr),
    expPerHour: safeDiv(exp, hours),
    expPerContract: safeDiv(exp, contract),
    resourcesPerHour: safeDiv(wr, hours),
  };

  return overrideApplies(map, a) ? { ...computed, ...map.manualOverride!.fields } : computed;
}

/**
 * Whether the spreadsheet author's hard-typed values still describe reality.
 *
 * They were typed under the sheet's default assumptions, so they only remain valid there.
 * Once the user moves an assumption, the override is stale and the formulas must win —
 * otherwise the site would show a number nobody can reproduce.
 */
export function overrideApplies(map: MapRaw, a: Assumptions): boolean {
  if (!map.manualOverride) return false;
  return (
    a.autobattleCard === DEFAULT_ASSUMPTIONS.autobattleCard &&
    a.expUp === DEFAULT_ASSUMPTIONS.expUp &&
    a.accountForTDollLevel === DEFAULT_ASSUMPTIONS.accountForTDollLevel &&
    a.tDollLevel === DEFAULT_ASSUMPTIONS.tDollLevel &&
    a.links === DEFAULT_ASSUMPTIONS.links
  );
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

export type RankMetric = "expPerResource" | "expPerHour" | "resourcesPerHour" | "expPerContract";

export interface RankedMap extends MapMetrics {
  map: MapRaw;
  rank: number;
}

/**
 * Rank maps by a metric.
 *
 * Ties are broken by raw exp per hour, then by entry index, so the ordering is stable
 * across reloads rather than depending on input order.
 */
export function rankMaps(
  maps: readonly MapRaw[],
  a: Assumptions,
  metric: RankMetric,
  { descending = true, limit }: { descending?: boolean; limit?: number } = {},
): RankedMap[] {
  const rows = maps
    .map((map) => {
      const metrics = computeMetrics(map, a);
      return { map, ...metrics, rank: 0 };
    })
    .sort((x, y) => {
      const delta = y[metric] - x[metric];
      if (delta !== 0) return descending ? delta : -delta;
      const expDelta = y.expPerHour - x.expPerHour;
      if (expDelta !== 0) return expDelta;
      return (x.map.entry ?? 0) - (y.map.entry ?? 0);
    });

  const sliced = limit === undefined ? rows : rows.slice(0, limit);
  return sliced.map((row, i) => ({ ...row, rank: i + 1 }));
}

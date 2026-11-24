/**
 * Data access layer.
 *
 * All datasets are statically imported so the site stays a pure static build — no fetch, no
 * loading state, no runtime failure mode.
 *
 * The one deliberate exception is the full skill dataset (~760 KB). Shipping it in the initial
 * bundle would make the 452-row doll list pay for data it never shows, so the list reads a small
 * `skill-index.json` (slug -> primary skill name) instead and the full file is loaded lazily by
 * the doll detail route through `loadSkills()`.
 */

import mapsJson from "../data/maps.json";
import dollsJson from "../data/dolls.json";
import skillIndexJson from "../data/skill-index.json";
import type { MapRaw } from "./farming.ts";
import type { Doll, DollData, DollSkill, SkillData } from "./dolls.ts";

export interface MapMeta {
  source: string;
  generatedAt: string;
  patch: string;
  mapCount: number;
  releasedCount: number;
  chapters: string[];
  spreadsheetAssumptions: {
    autobattleCard: string;
    expUp: string;
    accountForTDollLevel: string;
    tDollLevel: number;
    links: number;
  };
}

interface MapsFile {
  meta: MapMeta;
  maps: MapRaw[];
}

/** Slug -> what the doll list needs to know about skills without loading them. */
export type SkillIndex = Record<string, { name: string | null; placeholder: boolean } | null>;

const mapsFile = mapsJson as unknown as MapsFile;
const dollsFile = dollsJson as unknown as DollData;
const skillIndex = skillIndexJson as unknown as SkillIndex;

export const mapMeta: MapMeta = mapsFile.meta;
export const maps: readonly MapRaw[] = mapsFile.maps;

export const dollMeta = dollsFile.meta;

/** Dolls without skills attached — use `loadSkills` for the detail page. */
export const dolls: readonly Doll[] = dollsFile.dolls;

/** Counts for the credits page, derived from the index so the full dataset stays unloaded. */
export const skillStats = {
  dollsWithSkillData: Object.values(skillIndex).filter((v) => v !== null).length,
  placeholderDolls: Object.values(skillIndex).filter((v) => v?.placeholder).length,
  totalDolls: dollsFile.dolls.length,
};

const dollsBySlug = new Map(dolls.map((d) => [d.slug, d]));
const mapsBySlug = new Map(maps.map((m) => [m.slug, m]));

export function dollBySlug(slug: string): Doll | undefined {
  return dollsBySlug.get(slug);
}

export function mapBySlug(slug: string): MapRaw | undefined {
  return mapsBySlug.get(slug);
}

/** Dolls available on the EN server, which is what the site is scoped to. */
export const enDolls: readonly Doll[] = dolls.filter((d) => d.releasedOnEN);

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

let skillsPromise: Promise<SkillData> | null = null;
let skillsCache: SkillData | null = null;

/**
 * Load the full skill dataset. Code-split by the bundler, so it downloads only when a doll page
 * actually renders.
 */
export async function loadSkills(): Promise<SkillData> {
  if (!skillsPromise) {
    skillsPromise = import("../data/skills.json").then((mod) => {
      skillsCache = (mod.default ?? mod) as unknown as SkillData;
      return skillsCache;
    });
  }
  return skillsPromise;
}

/**
 * What has already been loaded, synchronously.
 *
 * Needed because `useEffect` does not run during server rendering: without this, an SSR pass can
 * only ever produce the loading placeholder, so the render check would stop verifying skill
 * output entirely. The detail page seeds its state from this and only falls back to the async
 * loader when it returns null.
 */
export function loadedSkills(): SkillData | null {
  return skillsCache;
}

/** Synchronously available skill summary for list views. */
export function skillSummary(doll: Doll): { name: string | null; placeholder: boolean } | null {
  return skillIndex[doll.slug] ?? null;
}

export function hasSkillData(doll: Doll): boolean {
  const entry = skillSummary(doll);
  return entry !== null && (entry.name !== null || entry.placeholder);
}

/** Skills for one doll out of an already-loaded dataset. */
export function skillsOf(data: SkillData, doll: Doll): DollSkill[] {
  return data.skills[doll.slug] ?? [];
}

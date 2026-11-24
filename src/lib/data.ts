/**
 * Data access layer.
 *
 * Both JSON files are imported statically so the bundler can inline them and the site stays
 * a pure static build — no fetch, no loading state, no runtime failure mode. The maps file is
 * ~200 KB and the dolls file similar; both are acceptable for a reference tool.
 */

import mapsJson from "../data/maps.json";
import dollsJson from "../data/dolls.json";
import type { MapRaw } from "./farming.ts";
import type { Doll, DollData } from "./dolls.ts";

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

const mapsFile = mapsJson as unknown as MapsFile;
const dollsFile = dollsJson as unknown as DollData;

export const mapMeta: MapMeta = mapsFile.meta;
export const maps: readonly MapRaw[] = mapsFile.maps;

export const dollMeta = dollsFile.meta;
export const dolls: readonly Doll[] = dollsFile.dolls;

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

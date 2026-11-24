import { dollMeta, mapMeta } from "../lib/data.ts";

/**
 * The "last verified" stamp.
 *
 * SPEC §1: this site is an archive, not a live feed. Saying so is a feature — a dated snapshot
 * is trustworthy in a way an undated page is not, especially for a game whose content has
 * stopped moving.
 */
export function DataStamp({ kind }: { kind: "maps" | "dolls" }) {
  const isMaps = kind === "maps";
  const date = isMaps ? mapMeta.generatedAt : dollMeta.generatedAt;
  const label = isMaps
    ? `${mapMeta.mapCount} maps`
    : `${dollMeta.releasedOnEN} dolls`;

  return (
    <span className="badge" title="This dataset is a dated snapshot, not a live feed">
      data verified {date} · {label}
    </span>
  );
}

import type { Doll } from "../lib/dolls.ts";
import { GRID_DISPLAY_ORDER, standingIndex, type Position } from "../lib/echelon.ts";

interface Props {
  tiles: Array<number | null>;
  /** Show cell numbers in every cell, useful in the builder. */
  showNumbers?: boolean;
  label?: string;
}

/**
 * A doll's tile aura pattern, drawn the way the wiki draws it.
 *
 * The pattern is *relative to the doll*: the dim cell is where she stands and the amber cells
 * are the tiles she covers. Rendering the raw pattern rather than translating it is deliberate —
 * it is the picture the player already recognises from the game and the wiki. When a doll is
 * placed off-centre the pattern shifts, and the builder shows that shifted result separately.
 *
 * Cells are laid out in IOP Wiki's draw order (7 8 9 across the top), so the picture matches the
 * page a reader may have open beside this one. The cell numbers are shown plainly and no
 * front/back direction is claimed, because sources disagree about which way the grid faces and
 * the arithmetic of buffing does not depend on it.
 */
export function TileGrid({ tiles, showNumbers = false, label }: Props) {
  const standing = standingIndex(tiles);

  return (
    <div
      className="tilegrid"
      role="img"
      aria-label={label ?? describeTiles(tiles)}
      style={{ gridTemplateColumns: "repeat(3, 44px)", gridTemplateRows: "repeat(3, 44px)" }}
    >
      {GRID_DISPLAY_ORDER.map((position) => {
        const index = position - 1;
        const value = tiles[index];
        const kind = value === 1 ? "buff" : value === 0 ? "self" : "empty";
        return (
          <div
            key={position}
            className={`tilegrid__cell tilegrid__cell--${kind}`}
            title={`Cell ${position}: ${
              kind === "buff" ? "buffed" : kind === "self" ? "her own position" : "empty"
            }`}
          >
            {kind === "buff" ? (showNumbers ? position : "▮") : showNumbers ? position : ""}
          </div>
        );
      })}
      <span className="visually-hidden">{describeTiles(tiles)}</span>
      {standing === null && showNumbers ? null : null}
    </div>
  );
}

/** Screen-reader and fallback description of a pattern. */
export function describeTiles(tiles: Array<number | null>): string {
  const buffed = tiles
    .map((value, index) => (value === 1 ? index + 1 : null))
    .filter((v): v is number => v !== null);
  const standing = standingIndex(tiles);

  if (buffed.length === 0) {
    return "No tile aura.";
  }

  const list =
    buffed.length === 1
      ? `cell ${buffed[0]}`
      : `cells ${buffed.slice(0, -1).join(", ")} and ${buffed[buffed.length - 1]}`;

  return `Covers ${list}; stands on cell ${standing === null ? "5" : standing + 1}.`;
}

/** Where a doll's aura lands when she is placed at `at`, for use in prose. */
export function coverageSentence(
  doll: Pick<Doll, "name">,
  at: Position,
  covered: readonly Position[],
): string {
  if (covered.length === 0) {
    return `${doll.name} at ${at} covers no cells — her aura falls off the board.`;
  }
  return `${doll.name} at ${at} covers ${covered.join(", ")}.`;
}

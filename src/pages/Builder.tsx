import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { enDolls, dollBySlug } from "../lib/data.ts";
import {
  ALL_POSITIONS,
  GRID_DISPLAY_ORDER,
  buffedPositions,
  incomingBuffs,
  parseAura,
  acceptsAura,
  STAT_LABEL,
  type Placement,
  type Position,
} from "../lib/echelon.ts";
import { fmtInt } from "../lib/format.ts";

/**
 * Formation builder.
 *
 * Every doll projects her aura; the pattern translates with her placement. So the useful output
 * is not "who is in the centre" but, per doll, what she receives and from whom — and, per cell,
 * who is covering it and whether the occupant's class even accepts that aura.
 *
 * The formation lives entirely in the URL, so sharing is copying the address bar. No backend.
 */

const EMPTY: Record<Position, string | null> = {
  1: null,
  2: null,
  3: null,
  4: null,
  5: null,
  6: null,
  7: null,
  8: null,
  9: null,
};

export function Builder() {
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  // URL format: ?f=slug@pos,slug@pos — stable and human-readable.
  const formation = useMemo<Placement[]>(() => {
    const raw = params.get("f") ?? "";
    const out: Placement[] = [];
    for (const chunk of raw.split(",")) {
      const [slug, pos] = chunk.split("@");
      const p = Number(pos);
      if (slug && p >= 1 && p <= 9 && dollBySlug(slug)) {
        out.push({ dollSlug: slug, position: p as Position });
      }
    }
    // One doll per cell: last write wins, as in the game.
    const seen = new Map<Position, Placement>();
    for (const p of out) seen.set(p.position, p);
    return [...seen.values()];
  }, [params]);

  const placed = useMemo(() => {
    const map = { ...EMPTY };
    for (const p of formation) map[p.position] = p.dollSlug;
    return map;
  }, [formation]);

  function writeFormation(next: Record<Position, string | null>) {
    const encoded = ALL_POSITIONS.filter((p) => next[p])
      .map((p) => `${next[p]}@${p}`)
      .join(",");
    const copy = new URLSearchParams(params);
    if (encoded) copy.set("f", encoded);
    else copy.delete("f");
    setParams(copy, { replace: true });
  }

  function place(position: Position, slug: string | null) {
    writeFormation({ ...placed, [position]: slug });
  }

  const candidates = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return enDolls.slice(0, 60);
    return enDolls
      .filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.classification?.toLowerCase() === q,
      )
      .slice(0, 60);
  }, [filter]);

  const filled = formation.length;

  return (
    <div className="wrap">
      <p className="eyebrow">Formation builder</p>
      <h1>Echelon builder</h1>
      <p className="lede">
        Place dolls on the grid and see what each one actually receives, and from whom. Every doll
        projects her own aura and the pattern moves with her, so position decides everything.
      </p>

      <div className="notice">
        <strong>What this calculates.</strong> Tile coverage with each doll&apos;s pattern shifted to
        her cell, plus the aggregated aura each doll receives after class filtering — an AR only
        gets a buff whose "Affects" line includes ARs. It does not simulate damage, validate
        composition, or check CE requirements; those are v1.1.
      </div>

      <div className="detail-columns" style={{ marginTop: 20 }}>
        <section className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Grid</h2>
            <span className="small faint">{filled}/5 dolls</span>
          </div>

          <div className="builder-grid">
            {GRID_DISPLAY_ORDER.map((pos) => {
              const slug = placed[pos];
              const doll = slug ? dollBySlug(slug) : undefined;
              return (
                <button
                  key={pos}
                  type="button"
                  className={`builder-cell ${doll ? "builder-cell--filled" : ""}`}
                  onClick={() => {
                    if (selected) place(pos, selected);
                    else if (doll) place(pos, null);
                    setSelected(null);
                  }}
                  onDragOver={(e) => {
                    if (selected) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const dropped = selected ?? e.dataTransfer.getData("text/plain");
                    if (dropped) place(pos, dropped);
                    setSelected(null);
                  }}
                  title={doll ? `${doll.name} on cell ${pos}` : `Empty cell ${pos}`}
                  aria-label={`Cell ${pos}${doll ? `, ${doll.name}` : ", empty"}`}
                >
                  <span className="builder-cell__pos">{pos}</span>
                  <span className="builder-cell__name">{doll ? doll.name : "+"}</span>
                </button>
              );
            })}
          </div>

          <p className="small faint" style={{ margin: "12px 0 0" }}>
            Cells are drawn in the same layout as the doll pages (7 8 9 across the top). Pick a doll
            on the right, then click a cell, or drag one in. Click a filled cell to clear it.
          </p>

          {filled > 0 && (
            <button
              type="button"
              className="btn"
              style={{ marginTop: 12 }}
              onClick={() => writeFormation(EMPTY)}
            >
              Clear formation
            </button>
          )}
        </section>

        <section className="card">
          <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Available dolls</h2>
          <div className="field" style={{ marginBottom: 10 }}>
            <input
              type="search"
              placeholder="Filter by name or class (AR, RF, …)"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <div className="builder-pool">
            {candidates.map((d) => (
              <button
                key={d.slug}
                type="button"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", d.slug);
                  setSelected(d.slug);
                }}
                onClick={() => setSelected(selected === d.slug ? null : d.slug)}
                className={`builder-chip ${selected === d.slug ? "builder-chip--selected" : ""}`}
                title={`${d.classification ?? "?"} ${d.rarity ?? d.rarityLabel ?? "?"}★`}
              >
                {d.name}
              </button>
            ))}
            {candidates.length === 0 && <p className="small faint">No match.</p>}
          </div>
          {selected && (
            <p className="small" style={{ color: "var(--amber)", margin: "10px 0 0" }}>
              Selected: {dollBySlug(selected)?.name} — now click a cell.
            </p>
          )}
        </section>
      </div>

      {filled > 0 && (
        <>
          <section className="card" style={{ marginTop: 24 }}>
            <h2 style={{ marginTop: 0, fontSize: "1rem" }}>What each doll receives</h2>
            <div className="buff-rows">
              {ALL_POSITIONS.filter((p) => placed[p]).map((pos) => {
                const doll = dollBySlug(placed[pos]!);
                if (!doll) return null;
                const buffs = incomingBuffs(
                  { dollSlug: doll.slug, position: pos },
                  formation,
                  dollBySlug,
                );
                const covers = buffedPositions(doll, pos);

                return (
                  <div key={pos} className="buff-row">
                    <div>
                      <span className="badge">{pos}</span>{" "}
                      <Link to={`/dolls/${doll.slug}`}>{doll.name}</Link>{" "}
                      <span className="faint small">{doll.classification}</span>
                      {covers.length > 0 && (
                        <span className="badge" style={{ marginLeft: 6 }}>
                          covers {covers.join(", ")}
                        </span>
                      )}
                    </div>

                    <div className="small" style={{ marginTop: 3 }}>
                      {buffs.length === 0 ? (
                        <span className="faint">receives nothing</span>
                      ) : (
                        buffs.map((b) => (
                          <div key={b.stat} style={{ marginTop: 2 }}>
                            <span className="mono" style={{ color: "var(--green)" }}>
                              +{fmtInt(b.total)}
                              {b.percent ? "%" : ""}
                            </span>{" "}
                            <span className="faint">{STAT_LABEL[b.stat]}</span>{" "}
                            <span className="faint small">
                              from {b.sources.map((s) => `${s.fromName} (${s.fromPosition})`).join(", ")}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card" style={{ marginTop: 16 }}>
            <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Wasted auras</h2>
            <WastedAuras formation={formation} placed={placed} />
          </section>
        </>
      )}
    </div>
  );
}

/**
 * Auras that land on nobody, or on a doll whose class cannot accept them.
 *
 * This is the part a player cannot easily see in game: the tile is technically covered but the
 * buff does nothing, or the aura points at an empty cell. Naming it explicitly is more useful
 * than a coverage count.
 */
function WastedAuras({
  formation,
  placed,
}: {
  formation: readonly Placement[];
  placed: Record<Position, string | null>;
}) {
  const notes: string[] = [];

  for (const source of formation) {
    const doll = dollBySlug(source.dollSlug);
    if (!doll) continue;
    const parsed = parseAura(doll.aura);
    if (parsed.effects.length === 0) continue;

    const covers = buffedPositions(doll, source.position);
    const offBoard = doll.tiles.filter((t) => t === 1).length - covers.length;

    if (offBoard > 0) {
      notes.push(
        `${doll.name} (${source.position}) loses ${offBoard} aura cell${offBoard === 1 ? "" : "s"} off the board.`,
      );
    }

    const useful = covers.filter((cell) => {
      const occupant = placed[cell];
      if (!occupant) return false;
      const receiver = dollBySlug(occupant);
      return receiver ? acceptsAura(parsed, receiver) : false;
    });

    if (covers.length > 0 && useful.length === 0) {
      const anyOccupant = covers.some((c) => placed[c]);
      notes.push(
        anyOccupant
          ? `${doll.name} (${source.position}) covers ${covers.join(", ")}, but nobody there accepts her aura${parsed.affectsAll || parsed.affects.length === 0 ? "" : ` (${parsed.affects.join(", ")} only)`}.`
          : `${doll.name} (${source.position}) covers ${covers.join(", ")}, but those cells are empty.`,
      );
    }
  }

  if (notes.length === 0) {
    return <p className="small muted" style={{ marginBottom: 0 }}>No wasted auras — every covered cell has a doll that accepts it.</p>;
  }

  return (
    <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
      {notes.map((n, i) => (
        <li key={i}>{n}</li>
      ))}
    </ul>
  );
}

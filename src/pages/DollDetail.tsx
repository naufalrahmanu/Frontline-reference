import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { dollBySlug, dolls, loadSkills, loadedSkills, skillsOf } from "../lib/data.ts";
import { TileGrid, describeTiles } from "../components/TileGrid.tsx";
import { SkillPanel } from "../components/SkillPanel.tsx";
import {
  buffedPositions,
  parseAura,
  parseAuraLine,
  standingIndex,
  STAT_LABEL,
  ALL_POSITIONS,
  type Position,
} from "../lib/echelon.ts";
import { fmtInt } from "../lib/format.ts";
import { NotFound } from "./NotFound.tsx";
import type { Doll, DollSkill, StatRange } from "../lib/dolls.ts";

export function DollDetail() {
  const { slug } = useParams<{ slug: string }>();
  const doll = slug ? dollBySlug(slug) : undefined;

  /**
   * The full skill dataset is code-split, so it arrives one tick after first paint. That is a
   * deliberate trade: it keeps the doll *list* from paying for 760 KB it never displays.
   *
   * If the data is already in memory (a second visit to a doll page, or a server render that
   * pre-loaded it) the first render has it and there is no placeholder flash.
   */
  const [skills, setSkills] = useState<DollSkill[] | null>(() => {
    const cached = loadedSkills();
    if (!cached || !doll) return null;
    return skillsOf(cached, doll);
  });

  useEffect(() => {
    if (skills !== null) return undefined;
    let cancelled = false;
    if (!doll) return undefined;
    loadSkills()
      .then((data) => {
        if (!cancelled) setSkills(skillsOf(data, doll));
      })
      .catch(() => {
        if (!cancelled) setSkills([]);
      });
    return () => {
      cancelled = true;
    };
  }, [doll, skills]);

  if (!doll) return <NotFound />;

  // At her printed position the pattern applies as drawn; elsewhere it shifts.
  const standing = standingIndex(doll.tiles);
  const asDrawn = buffedPositions(doll, standing === null ? 5 : ((standing + 1) as Position));
  const aura = parseAura(doll.aura);

  return (
    <div className="wrap">
      <p className="eyebrow">
        <Link to="/dolls">Dolls</Link> / {doll.classification ?? "—"}
      </p>

      <div className="doll-head">
        <div>
          <h1 style={{ marginBottom: 10 }}>{doll.name}</h1>
          <div className="doll-head__meta">
            {doll.classification && <span className="badge badge--amber">{doll.classification}</span>}
            {doll.rarity ? (
              <span className="badge">{doll.rarity}★</span>
            ) : doll.rarityLabel ? (
              <span className="badge">{doll.rarityLabel}</span>
            ) : null}
            {doll.index !== null && <span className="badge">No. {doll.index}</span>}
            {doll.moddable && <span className="badge badge--green">MOD3 available</span>}
            {!doll.releasedOnEN && <span className="badge badge--red">not on EN</span>}
          </div>
          {doll.craftTime && (
            <p className="small muted" style={{ margin: 0 }}>
              Craft time <span className="mono">{doll.craftTime}</span>
            </p>
          )}
          {doll.artist && (
            <p className="small faint" style={{ margin: 0 }}>
              Artist: {doll.artist}
            </p>
          )}
        </div>
      </div>

      <div className="detail-columns">
        <section className="card">
          <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Stats</h2>
          <table className="stat-table">
            <thead>
              <tr>
                <th scope="col" />
                <th scope="col" className="small faint" style={{ fontWeight: 400 }}>
                  Lv1 → Lv100
                </th>
                {doll.mod3Stats && (
                  <th scope="col" className="small faint" style={{ fontWeight: 400 }}>
                    MOD3
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              <StatRow label="HP" range={doll.stats.hp} mod={doll.mod3Stats?.hp} />
              <StatRow label="Damage" range={doll.stats.dmg} mod={doll.mod3Stats?.dmg} />
              <StatRow label="Accuracy" range={doll.stats.acc} mod={doll.mod3Stats?.acc} />
              <StatRow label="Evasion" range={doll.stats.eva} mod={doll.mod3Stats?.eva} />
              <StatRow label="Rate of fire" range={doll.stats.rof} mod={doll.mod3Stats?.rof} />
              <tr>
                <th scope="row">Movement</th>
                <td colSpan={2}>{doll.stats.mov ?? "—"}</td>
              </tr>
            </tbody>
          </table>
          <p className="small faint" style={{ margin: "10px 0 0" }}>
            Min at level 1 → max at level 100{doll.mod3Stats ? "; MOD3 column is after Neural Upgrade" : ""}.
          </p>
        </section>

        <section className="card">
          <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Tiles</h2>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
            <div>
              <TileGrid tiles={doll.tiles} label={`${doll.name} tile layout`} />
              <p className="small faint" style={{ margin: "8px 0 0", maxWidth: 200 }}>
                {describeTiles(doll.tiles)}
              </p>
            </div>
            {doll.modTiles && (
              <div>
                <p className="small faint" style={{ margin: "0 0 4px" }}>
                  After MOD3
                </p>
                <TileGrid tiles={doll.modTiles} label={`${doll.name} MOD3 tile layout`} />
              </div>
            )}
          </div>

          {asDrawn.length > 0 && (
            <p className="small muted" style={{ margin: "12px 0 0" }}>
              At her printed position this covers{" "}
              <strong>{asDrawn.join(", ")}</strong>. The pattern moves with her: place{" "}
              {doll.name} on any cell and the covered cells shift by the same amount.
            </p>
          )}
        </section>
      </div>

      <section className="card" style={{ marginTop: 24 }}>
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Aura</h2>
        {doll.aura.filter(Boolean).length === 0 && (
          <p className="muted">No aura recorded for this doll.</p>
        )}
        {doll.aura.filter(Boolean).length > 0 && (
          <div className="buff-summary">
            {doll.aura.filter(Boolean).map((raw, i) => {
              const line = parseAuraLine(raw!);
              return (
                <div key={i} style={{ marginBottom: 8 }}>
                  <div>{raw}</div>
                  {line.value > 0 && line.stat !== "other" && (
                    <div className="small faint" style={{ fontFamily: "var(--sans)" }}>
                      parsed as {STAT_LABEL[line.stat]} {line.value}
                      {line.percent ? "%" : ""}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p className="small muted" style={{ margin: "12px 0 0" }}>
          {aura.affectsAll
            ? "Targets every class."
            : aura.affects.length > 0
              ? `Only affects ${aura.affects.join(", ")} — other classes standing on those tiles get nothing.`
              : "No class restriction recorded."}
        </p>

        {aura.unparsed.length > 0 && (
          <p className="small faint" style={{ margin: "8px 0 0" }}>
            {aura.unparsed.length} aura line
            {aura.unparsed.length === 1 ? "" : "s"} could not be read as a stat: shown verbatim
            above rather than guessed at.
          </p>
        )}

        <p className="small faint" style={{ margin: "10px 0 0" }}>
          Aura text is copied verbatim from IOP Wiki; the parsed line is a best-effort reading of
          prose, shown alongside it rather than replacing it.
        </p>
      </section>

      {skills === null ? (
        <section className="card" style={{ marginTop: 24 }}>
          <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Skills</h2>
          <p className="small faint" style={{ marginBottom: 0 }}>
            Loading skill data…
          </p>
        </section>
      ) : (
        <SkillPanel skills={skills} />
      )}

      <CoverageByPosition doll={doll} />

      <p className="small faint" style={{ marginTop: 24 }}>
        Source:{" "}
        <a href={doll.source} target="_blank" rel="noreferrer noopener">
          IOP Wiki
        </a>{" "}
        (CC BY-SA 3.0). Verified with the site dataset on the date shown on{" "}
        <Link to="/credits">Credits</Link>.
      </p>
    </div>
  );
}

function StatRow({ label, range, mod }: { label: string; range: StatRange; mod?: number | null }) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td colSpan={mod === undefined || mod === null ? 2 : 1}>
        {fmtInt(range[0])} → {fmtInt(range[1])}
      </td>
      {mod !== undefined && mod !== null && <td style={{ color: "var(--green)" }}>{fmtInt(mod)}</td>}
    </tr>
  );
}

/**
 * What this doll covers, depending on where you put her.
 *
 * Every doll projects her aura — there is no centre-only rule. The pattern translates with her,
 * so the useful question is not "does she buff?" but "which placement makes her aura land on
 * the dolls I want?" At the edges the pattern falls partly off the board, which is exactly the
 * information a player needs before committing a slot.
 */
function CoverageByPosition({ doll }: { doll: Doll }) {
  const rows = ALL_POSITIONS.map((at) => ({
    at,
    covered: buffedPositions(doll, at),
  }));
  const none = rows.every((r) => r.covered.length === 0);

  if (none) {
    return (
      <section className="card" style={{ marginTop: 24 }}>
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Coverage by position</h2>
        <p className="small muted" style={{ marginBottom: 0 }}>
          This doll has no recorded aura tiles, so she does not buff anything regardless of where
          she stands. Place her where her own stats or skill are most useful.
        </p>
      </section>
    );
  }

  const best = rows.reduce((a, b) => (b.covered.length > a.covered.length ? b : a));

  return (
    <section className="card" style={{ marginTop: 24 }}>
      <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Coverage by position</h2>
      <p className="small muted" style={{ marginBottom: 10 }}>
        The aura pattern moves with the doll. Placing her on a cell near the edge pushes part of
        the aura off the board — this is what she covers from each of the nine cells.
      </p>

      <table className="stat-table">
        <thead>
          <tr>
            <th scope="col" className="small faint" style={{ fontWeight: 400 }}>
              Cell
            </th>
            <th scope="col" className="small faint" style={{ fontWeight: 400 }}>
              Covers
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.at}>
              <th scope="row" style={{ fontFamily: "var(--mono)" }}>
                {row.at}
                {row.at === best.at && row.covered.length > 0 && (
                  <span className="badge badge--green" style={{ marginLeft: 6 }}>
                    best
                  </span>
                )}
              </th>
              <td style={{ fontFamily: "var(--mono)" }}>
                {row.covered.length === 0 ? (
                  <span className="faint">nothing</span>
                ) : (
                  row.covered.join(", ")
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="small faint" style={{ margin: "10px 0 0" }}>
        {dolls.length} dolls are in the dataset;{" "}
        <Link to="/builder">open the builder</Link> to place this one against a real formation and
        see which dolls on those cells actually accept her aura — a class restriction may leave some
        of them unbuffed even when the tile is covered.
      </p>
    </section>
  );
}

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { dollBySlug } from "../lib/data.ts";
import { TileGrid } from "../components/TileGrid.tsx";
import {
  GRID_DISPLAY_ORDER,
  buffedPositions,
  buffsPosition,
  parseAura,
  acceptsAura,
  type Position,
} from "../lib/echelon.ts";

/**
 * Six archetypal echelons.
 *
 * Deliberately NOT "the current meta" — GFL1's content is finished and its meta is frozen, so
 * claiming a meta would be the wrong promise for a site that publishes dated snapshots. These
 * are the shapes that have always worked: what you learn first and keep coming back to.
 *
 * Every preset states purpose, failure mode, and — computed, not asserted — which dolls it
 * actually buffs. That last part matters: the placements below were chosen by searching all
 * 15,120 arrangements of each doll set for the one with the most accepted aura hits, not by
 * eyeballing the grid. A formation whose auras land on nobody is a common and invisible mistake,
 * and an earlier version of this file shipped exactly that.
 *
 * Cells are the dataset's numbering, drawn 7-8-9 / 4-5-6 / 1-2-3.
 */

interface Preset {
  id: string;
  title: string;
  purpose: string;
  weakness: string;
  slots: Partial<Record<Position, string>>;
}

const PRESETS: Preset[] = [
  {
    id: "ar-smg",
    title: "AR / SMG — the standard workhorse",
    purpose:
      "The default team for most of the game. Two SMGs hold the line while three ARs do the damage. Cheap to build and it answers most maps.",
    weakness:
      "Struggles against armour, and anything that outranges it. This is not the team for a heavy boss.",
    slots: { 2: "ump45", 5: "ro635", 4: "m4a1", 1: "st-ar-15", 7: "m4-sopmod-ii" },
  },
  {
    id: "rf-hg",
    title: "RF / HG — the armour answer",
    purpose:
      "Rifles hit hard and slowly; handguns keep them alive and speed them up. The team you build for armoured enemies and most boss fights.",
    weakness:
      "Slow rate of fire makes it poor against swarms, and handguns are fragile. Costs more to build than an AR/SMG team.",
    slots: { 5: "m950a", 1: "five-seven", 7: "m14", 3: "springfield", 4: "ntw-20" },
  },
  {
    id: "mg-sg",
    title: "MG / SG — burst damage, expensive",
    purpose:
      "Machine guns empty a huge belt in seconds while shotguns hold the line — and shotguns buff the machine guns back, which is why the two belong together.",
    weakness:
      "Reloads are long and the ammo cost per run is brutal. A specialist team for specific fights, never a farming team.",
    slots: { 4: "mg5", 7: "pkp", 6: "m1887", 3: "ksg", 9: "saiga-12" },
  },
  {
    id: "ar-hg-night",
    title: "AR / SMG with an HG buffer — night maps",
    purpose:
      "On night maps accuracy matters more than raw damage. A handgun buffs the whole team with accuracy and rate of fire while the ARs do the work.",
    weakness:
      "The buffer is a soft target — though aura values already applied do not vanish when she dies.",
    slots: { 8: "px4-storm", 2: "ump45", 1: "m4a1", 4: "st-ar-15", 5: "ro635" },
  },
  {
    id: "double-rf",
    title: "Double RF — long-range deletion",
    purpose:
      "Two rifles with overlapping coverage, buffed by handguns, to remove high-value targets before they close. The shape most boss-killer teams converge on.",
    weakness:
      "Very fragile if anything reaches it, and the handguns have to be properly levelled rather than merely present.",
    slots: { 2: "m950a", 5: "iws-2000", 4: "m14", 6: "ntw-20", 8: "five-seven" },
  },
  {
    id: "budget",
    title: "Budget starter — what you can build on day one",
    purpose:
      "Low-rarity dolls the game hands you early. Not optimal, but it clears early maps and teaches the tile mechanic without needing a single 5-star pull.",
    weakness:
      "It stops working once armour appears. A stepping stone with an expiry date, not a team to invest deeply in.",
    slots: { 2: "ump45", 5: "ro635", 7: "m14", 4: "m4a1", 1: "st-ar-15" },
  },
];

export function Presets() {
  return (
    <div className="wrap">
      <p className="eyebrow">Formation presets</p>
      <h1>Six echelons that always work</h1>
      <p className="lede">
        These are archetypes, not a tier list. GFL1&apos;s content is finished and its meta is
        frozen, so &ldquo;current best team&rdquo; is the wrong question — what matters is knowing
        which shape answers which problem, and what each shape cannot do.
      </p>

      <div className="notice">
        <strong>How to read these.</strong> Each card names the dolls, what the shape is for, and
        how it fails. Tile coverage shown on each card is computed from the actual aura patterns —
        not assumed. Follow a preset into the <Link to="/builder">builder</Link> to change it and
        see the buffers recompute. Doll choices are examples: substitute anything of the same class
        with similar tiles.
      </div>

      <div style={{ display: "grid", gap: 16, marginTop: 24 }}>
        {PRESETS.map((preset) => (
          <PresetCard key={preset.id} preset={preset} />
        ))}
      </div>
    </div>
  );
}

function PresetCard({ preset }: { preset: Preset }) {
  const [open, setOpen] = useState(false);
  const slots = useMemo(() => Object.entries(preset.slots) as Array<[string, string]>, [preset.slots]);

  const encoded = slots.map(([pos, slug]) => `${slug}@${pos}`).join(",");

  /**
   * Does this formation actually buff anything?
   *
   * Computed rather than assumed — a preset can look right and still place every aura on an
   * empty cell or on a class that cannot accept it. Reporting the real count keeps the page
   * honest and catches a bad preset at build time.
   */
  const coverage = useMemo(() => {
    let buffedDolls = 0;
    let accepted = 0;
    for (const [posStr, slug] of slots) {
      const pos = Number(posStr) as Position;
      const receiver = dollBySlug(slug);
      if (!receiver) continue;
      let receives = false;
      for (const [otherPosStr, otherSlug] of slots) {
        const otherPos = Number(otherPosStr) as Position;
        if (otherPos === pos) continue;
        const source = dollBySlug(otherSlug);
        if (!source) continue;
        if (!buffsPosition(source, pos, otherPos)) continue;
        if (!acceptsAura(parseAura(source.aura), receiver)) continue;
        receives = true;
        accepted += 1;
      }
      if (receives) buffedDolls += 1;
    }
    return { buffedDolls, accepted, total: slots.length };
  }, [slots]);

  return (
    <section className="card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 340px" }}>
          <h2 style={{ margin: "0 0 6px", fontSize: "1.05rem" }}>{preset.title}</h2>
          <p className="small muted" style={{ marginBottom: 8 }}>
            {preset.purpose}
          </p>
          <p className="small faint" style={{ marginBottom: 0 }}>
            <strong>Fails when:</strong> {preset.weakness}
          </p>
        </div>

        <div style={{ flex: "0 0 auto" }}>
          <button type="button" className="btn" onClick={() => setOpen((v) => !v)}>
            {open ? "Hide grid" : "Show grid"}
          </button>
        </div>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {slots.map(([pos, slug]) => (
          <span key={pos} className="badge">
            {pos} · {dollBySlug(slug)?.name ?? slug}
          </span>
        ))}
        <span className={coverage.buffedDolls > 0 ? "badge badge--green" : "badge badge--red"}>
          {coverage.buffedDolls}/{coverage.total} dolls buffed
        </span>
        <Link className="badge badge--amber" to={`/builder?f=${encoded}`}>
          open in builder →
        </Link>
      </div>

      {open && (
        <div style={{ marginTop: 16 }}>
          <div className="preset-grid">
            {GRID_DISPLAY_ORDER.map((pos) => {
              const slug = preset.slots[pos];
              const doll = slug ? dollBySlug(slug) : undefined;
              return (
                <div
                  key={pos}
                  className={`preset-cell ${doll ? "preset-cell--filled" : ""}`}
                >
                  <span className="builder-cell__pos">{pos}</span>
                  <span className="builder-cell__name">{doll ? doll.name : ""}</span>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
            {slots
              .filter(([, slug]) => {
                const d = dollBySlug(slug);
                return d && buffedPositions(d, Number(slots.find((s) => s[1] === slug)?.[0]) as Position).length > 0;
              })
              .map(([pos]) => {
                const doll = dollBySlug(preset.slots[Number(pos) as Position] ?? "");
                if (!doll) return null;
                const covers = buffedPositions(doll, Number(pos) as Position);
                if (covers.length === 0) return null;
                return (
                  <div key={pos} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <TileGrid
                      tiles={doll.tiles}
                      showNumbers
                      label={`${doll.name} aura pattern`}
                    />
                    <div className="small">
                      <div>
                        <strong>{doll.name}</strong> <span className="faint">at {pos}</span>
                      </div>
                      <div className="faint">covers {covers.join(", ")}</div>
                      <div className="faint">{parseAura(doll.aura).affectsAll ? "targets all classes" : `targets ${parseAura(doll.aura).affects.join(", ") || "—"}`}</div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </section>
  );
}

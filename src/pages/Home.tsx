import { Link } from "react-router-dom";
import { mapMeta, dollMeta } from "../lib/data.ts";

export function Home() {
  return (
    <div className="wrap">
      <p className="eyebrow">Girls&apos; Frontline · archival reference</p>
      <h1>Numbers that are hard to find anywhere else</h1>
      <p className="lede">
        Autobattle farming efficiency for every map, with the assumptions left movable. And a
        T-Doll database that shows which tiles each doll actually covers. No news, no patch
        chases — the data is frozen and dated, so it stays correct.
      </p>

      <div className="tool-grid">
        <Link to="/farming" className="tool-card">
          <h2>Farming Explorer</h2>
          <p>
            {mapMeta.mapCount} autobattle maps ranked by exp per resource and exp per hour. Change
            the card, EXP Up, level and link count, and every number recomputes.{" "}
            {mapMeta.releasedCount} maps are live on EN.
          </p>
        </Link>

        <Link to="/dolls" className="tool-card">
          <h2>Doll Database</h2>
          <p>
            {dollMeta.releasedOnEN} dolls on EN with max stats, aura text and 3×3 tile layouts.
            Every doll page shows which positions it buffs and which positions buff it.
          </p>
        </Link>
      </div>

      <div className="card" style={{ marginTop: 8 }}>
        <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>New to the game?</h2>
        <p className="muted" style={{ marginBottom: 8 }}>
          Start with the one page that matters: what to do in your first week, what an echelon
          actually is, and which of these two tools you need first.
        </p>
        <Link to="/start">Read Start Here →</Link>
      </div>

      <div className="notice" style={{ marginTop: 24 }}>
        <strong>About the data.</strong> Map efficiency comes from a community autobattle
        spreadsheet, recomputed from its raw inputs rather than copied as finished numbers. Doll
        data is derived from IOP Wiki. Every dataset carries the date it was verified. See{" "}
        <Link to="/credits">Credits</Link> for sources and licences.
      </div>
    </div>
  );
}

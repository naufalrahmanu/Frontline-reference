import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { maps, mapMeta } from "../lib/data.ts";
import {
  DEFAULT_ASSUMPTIONS,
  computeMetrics,
  rankMaps,
  type Assumptions,
  type MapRaw,
  type MapMetrics,
  type RankMetric,
} from "../lib/farming.ts";
import { fmtCompact, fmtDecimal, fmtDuration, fmtInt } from "../lib/format.ts";
import { DataStamp } from "../components/DataStamp.tsx";

type SortKey =
  | "entry"
  | "mapName"
  | "requiredCE"
  | "weightedResources"
  | "autobattleHours"
  | "expPerHour"
  | "resourcesPerHour"
  | "totalEchelonExp"
  | "expPerResource"
  | "expPerContract";

type View = "table" | "topExpPerResource" | "topExpPerHour";

const SORT_LABELS: Record<SortKey, string> = {
  entry: "Entry",
  mapName: "Map",
  requiredCE: "CE",
  weightedResources: "Resources",
  autobattleHours: "Duration",
  totalEchelonExp: "Exp",
  expPerResource: "Exp/Resource",
  expPerHour: "Exp/Hour",
  resourcesPerHour: "Resources/Hour",
  expPerContract: "Exp/Contract",
};

interface Row extends MapMetrics {
  map: MapRaw;
  rank: number;
}

/** Sort keys that live on the map record rather than on the computed metrics. */
function sortValue(row: Row, key: SortKey): number | string {
  switch (key) {
    case "entry":
      return row.map.entry ?? 0;
    case "mapName":
      return `${row.map.chapter ?? ""} ${row.map.mapName ?? ""}`;
    case "requiredCE":
      return row.map.requiredCE ?? 0;
    case "autobattleHours":
      return row.map.autobattleHours ?? 0;
    default:
      return row[key];
  }
}

export function Farming() {
  const [assumptions, setAssumptions] = useState<Assumptions>(DEFAULT_ASSUMPTIONS);
  const [view, setView] = useState<View>("table");
  const [query, setQuery] = useState("");
  const [chapter, setChapter] = useState<string>("all");
  const [enOnly, setEnOnly] = useState(true);
  const [onlyWithDrops, setOnlyWithDrops] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({
    key: "expPerResource",
    desc: true,
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return maps.filter((map) => {
      if (enOnly && !map.releasedOnEN) return false;
      if (chapter !== "all" && map.chapter !== chapter) return false;
      if (onlyWithDrops && !map.limitedDrops) return false;
      if (!q) return true;
      return (
        (map.mapName ?? "").toLowerCase().includes(q) ||
        (map.chapter ?? "").toLowerCase().includes(q) ||
        (map.limitedDrops ?? "").toLowerCase().includes(q)
      );
    });
  }, [query, chapter, enOnly, onlyWithDrops]);

  const rows = useMemo<Row[]>(() => {
    const computed = filtered.map((map) => ({ map, ...computeMetrics(map, assumptions) }));
    const dir = sort.desc ? -1 : 1;

    computed.sort((a, b) => {
      const av = sortValue({ ...a, rank: 0 }, sort.key);
      const bv = sortValue({ ...b, rank: 0 }, sort.key);
      if (typeof av === "string" || typeof bv === "string") {
        return dir * String(av).localeCompare(String(bv));
      }
      const diff = av - bv;
      if (diff !== 0) return dir * diff;
      return (a.map.entry ?? 0) - (b.map.entry ?? 0);
    });

    return computed.map((row, i) => ({ ...row, rank: i + 1 }));
  }, [filtered, assumptions, sort]);

  const ranking = useMemo(() => {
    if (view === "table") return null;
    const metric: RankMetric = view === "topExpPerResource" ? "expPerResource" : "expPerHour";
    const pool = enOnly ? maps.filter((m) => m.releasedOnEN) : maps;
    return rankMaps(pool, assumptions, metric, { limit: 25 });
  }, [view, assumptions, enOnly]);

  return (
    <div className="wrap">
      <p className="eyebrow">Farming explorer</p>
      <h1>Autobattle efficiency</h1>
      <p style={{ marginBottom: 12 }}>
        <DataStamp kind="maps" />
      </p>
      <p className="lede">
        Every map&apos;s autobattle yield, computed from raw resource cost, duration and base exp.
        Move the assumptions and the whole table recalculates — this is the question the source
        spreadsheet cannot answer for you.
      </p>

      <AssumptionPanel value={assumptions} onChange={setAssumptions} />

      <div className="controls">
        <div className="field">
          <label htmlFor="farm-search">Search</label>
          <input
            id="farm-search"
            type="search"
            placeholder="Map name, chapter, or limited drop"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="farm-chapter">Chapter</label>
          <select id="farm-chapter" value={chapter} onChange={(e) => setChapter(e.target.value)}>
            <option value="all">All chapters</option>
            {mapMeta.chapters.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <label className="toggle">
          <input type="checkbox" checked={enOnly} onChange={(e) => setEnOnly(e.target.checked)} />
          EN only
        </label>

        <label className="toggle">
          <input
            type="checkbox"
            checked={onlyWithDrops}
            onChange={(e) => setOnlyWithDrops(e.target.checked)}
          />
          Has limited drops
        </label>
      </div>

      <div className="controls" style={{ marginBottom: 12 }}>
        <span className="faint small" style={{ alignSelf: "center" }}>
          View:
        </span>
        <button
          type="button"
          className={`btn ${view === "table" ? "btn--active" : ""}`}
          onClick={() => setView("table")}
        >
          All maps
        </button>
        <button
          type="button"
          className={`btn ${view === "topExpPerResource" ? "btn--active" : ""}`}
          onClick={() => setView("topExpPerResource")}
        >
          Top 25 by exp/resource
        </button>
        <button
          type="button"
          className={`btn ${view === "topExpPerHour" ? "btn--active" : ""}`}
          onClick={() => setView("topExpPerHour")}
        >
          Top 25 by exp/hour
        </button>
      </div>

      {view === "table" ? (
        <>
          <p className="small faint" style={{ marginBottom: 8 }}>
            {rows.length} map{rows.length === 1 ? "" : "s"}. Click a column heading to sort.
          </p>
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  {(
                    [
                      "entry",
                      "mapName",
                      "requiredCE",
                      "weightedResources",
                      "autobattleHours",
                      "totalEchelonExp",
                      "expPerResource",
                      "expPerHour",
                      "resourcesPerHour",
                      "expPerContract",
                    ] as SortKey[]
                  ).map((key) => (
                    <th
                      key={key}
                      scope="col"
                      className={`${key === "mapName" ? "" : "num"} sortable`}
                      onClick={() =>
                        setSort((s) =>
                          s.key === key ? { key, desc: !s.desc } : { key, desc: key !== "mapName" },
                        )
                      }
                      aria-sort={
                        sort.key === key ? (sort.desc ? "descending" : "ascending") : "none"
                      }
                    >
                      {SORT_LABELS[key]}
                      {sort.key === key && <span aria-hidden> {sort.desc ? "↓" : "↑"}</span>}
                    </th>
                  ))}
                  <th scope="col">Limited drops</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.map.slug}>
                    <td className="num faint">{row.map.entry ?? "—"}</td>
                    <td>
                      <MapCell map={row.map} />
                    </td>
                    <td className="num">{fmtInt(row.map.requiredCE)}</td>
                    <td className="num">{fmtInt(row.weightedResources)}</td>
                    <td className="num">{fmtDuration(row.map.autobattleHours)}</td>
                    <td className="num">{fmtCompact(row.totalEchelonExp)}</td>
                    <td className="num">{fmtDecimal(row.expPerResource)}</td>
                    <td className="num">{fmtCompact(row.expPerHour)}</td>
                    <td className="num">{fmtInt(row.resourcesPerHour)}</td>
                    <td className="num">{fmtCompact(row.expPerContract)}</td>
                    <td className="faint" style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {row.map.limitedDrops ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <div className="empty">No maps match those filters.</div>}
          </div>
        </>
      ) : (
        <RankingTable rows={ranking ?? []} metric={view === "topExpPerResource" ? "expPerResource" : "expPerHour"} />
      )}

      <div className="notice" style={{ marginTop: 24 }}>
        <strong>Where these numbers come from.</strong> Row data is the community{" "}
        <em>GFL EN Autobattle Comparison</em> spreadsheet; the arithmetic is re-implemented here
        and checked against all {mapMeta.mapCount} of its computed rows. Base exp, costs and
        durations are copied as-is — only the derived columns are recomputed. Data verified{" "}
        {mapMeta.generatedAt}. <Link to="/credits">Sources</Link>
      </div>
    </div>
  );
}

function MapCell({ map }: { map: MapRaw }) {
  return (
    <>
      <span className="nowrap">{map.mapName}</span>
      <span className="faint small"> · {map.chapter}</span>
      {map.night && (
        <span className="badge" style={{ marginLeft: 6 }}>
          night
        </span>
      )}
      {!map.releasedOnEN && (
        <span className="badge badge--red" style={{ marginLeft: 6 }}>
          not on EN
        </span>
      )}
      {map.manualOverride && (
        <span className="badge badge--amber" style={{ marginLeft: 6 }} title={map.manualOverride.note}>
          source override
        </span>
      )}
    </>
  );
}

function RankingTable({ rows, metric }: { rows: ReturnType<typeof rankMaps>; metric: RankMetric }) {
  if (rows.length === 0) return <div className="empty">Nothing to rank yet.</div>;
  return (
    <div className="table-scroll">
      <table className="data">
        <thead>
          <tr>
            <th scope="col" className="num">
              #
            </th>
            <th scope="col">Map</th>
            <th scope="col" className="num">
              Exp/Resource
            </th>
            <th scope="col" className="num">
              Exp/Hour
            </th>
            <th scope="col" className="num">
              Resources/Hour
            </th>
            <th scope="col" className="num">
              CE
            </th>
            <th scope="col">Limited drops</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.map.slug}>
              <td className="num faint">{row.rank}</td>
              <td>
                <MapCell map={row.map} />
              </td>
              <td className="num" style={{ color: metric === "expPerResource" ? "var(--amber)" : undefined }}>
                {fmtDecimal(row.expPerResource)}
              </td>
              <td className="num" style={{ color: metric === "expPerHour" ? "var(--amber)" : undefined }}>
                {fmtCompact(row.expPerHour)}
              </td>
              <td className="num">{fmtInt(row.resourcesPerHour)}</td>
              <td className="num">{fmtInt(row.map.requiredCE)}</td>
              <td className="faint">{row.map.limitedDrops ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AssumptionPanel({
  value,
  onChange,
}: {
  value: Assumptions;
  onChange: (next: Assumptions) => void;
}) {
  const isDefault =
    value.autobattleCard === DEFAULT_ASSUMPTIONS.autobattleCard &&
    value.expUp === DEFAULT_ASSUMPTIONS.expUp &&
    value.accountForTDollLevel === DEFAULT_ASSUMPTIONS.accountForTDollLevel &&
    value.tDollLevel === DEFAULT_ASSUMPTIONS.tDollLevel &&
    value.links === DEFAULT_ASSUMPTIONS.links;

  return (
    <div className="assumptions">
      <div className="assumptions__head">
        <h2 style={{ margin: 0, fontSize: "0.95rem" }}>Assumptions</h2>
        {!isDefault && (
          <button type="button" className="btn" onClick={() => onChange(DEFAULT_ASSUMPTIONS)}>
            Reset to spreadsheet defaults
          </button>
        )}
      </div>

      <div className="assumptions__grid">
        <label className="toggle">
          <input
            type="checkbox"
            checked={value.autobattleCard}
            onChange={(e) => onChange({ ...value, autobattleCard: e.target.checked })}
          />
          Autobattle card
        </label>

        <label className="toggle">
          <input
            type="checkbox"
            checked={value.expUp}
            onChange={(e) => onChange({ ...value, expUp: e.target.checked })}
          />
          EXP Up active
        </label>

        <label className="toggle">
          <input
            type="checkbox"
            checked={value.accountForTDollLevel}
            onChange={(e) => onChange({ ...value, accountForTDollLevel: e.target.checked })}
          />
          Apply level penalty
        </label>

        <div className="field">
          <label htmlFor="assume-level">T-Doll level</label>
          <input
            id="assume-level"
            type="number"
            min={1}
            max={120}
            value={value.tDollLevel}
            onChange={(e) => onChange({ ...value, tDollLevel: Number(e.target.value) || 0 })}
            style={{ width: 90 }}
          />
        </div>

        <div className="field">
          <label htmlFor="assume-links">Links</label>
          <input
            id="assume-links"
            type="number"
            min={1}
            max={5}
            value={value.links}
            onChange={(e) => onChange({ ...value, links: Number(e.target.value) || 1 })}
            style={{ width: 70 }}
          />
        </div>
      </div>

      <p className="small faint" style={{ margin: "10px 0 0" }}>
        Turning off the autobattle card raises the echelons required to clear a map, so exp per
        run and per resource both change. The level penalty halves exp for every 10 levels the map
        is below your T-Doll; past a gap of 40 the map pays a flat 50 exp instead.
      </p>
    </div>
  );
}

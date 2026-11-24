import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { enDolls, skillSummary } from "../lib/data.ts";
import { CLASSIFICATIONS, type Classification, type Doll } from "../lib/dolls.ts";
import type { StatRange } from "../lib/dolls.ts";
import { buffedPositions } from "../lib/echelon.ts";
import { fmtInt } from "../lib/format.ts";
import { DataStamp } from "../components/DataStamp.tsx";

type SortKey = "index" | "name" | "rarity" | "dmg" | "acc" | "eva" | "rof" | "hp" | "mov";

const CLASS_COLOR: Record<Classification, string> = {
  HG: "#8fa8c8",
  SMG: "#c8a88f",
  AR: "#c88f8f",
  RF: "#8fc89a",
  MG: "#c8c08f",
  SG: "#b08fc8",
};

export function Dolls() {
  const [query, setQuery] = useState("");
  const [cls, setCls] = useState<Classification | "all">("all");
  const [rarity, setRarity] = useState<number | "all">("all");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "index", desc: false });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = enDolls.filter((doll) => {
      if (cls !== "all" && doll.classification !== cls) return false;
      if (rarity !== "all" && doll.rarity !== rarity) return false;
      if (!q) return true;
      return doll.name.toLowerCase().includes(q);
    });

    return [...filtered].sort((a, b) => {
      const av = sortVal(a, sort.key);
      const bv = sortVal(b, sort.key);
      if (typeof av === "string" || typeof bv === "string") {
        const cmp = String(av).localeCompare(String(bv));
        return sort.desc ? -cmp : cmp;
      }
      const diff = av - bv;
      if (diff !== 0) return sort.desc ? -diff : diff;
      return (a.index ?? 9999) - (b.index ?? 9999);
    });
  }, [query, cls, rarity, sort]);

  return (
    <div className="wrap">
      <p className="eyebrow">Doll database</p>
      <h1>T-Dolls</h1>
      <p style={{ marginBottom: 12 }}>
        <DataStamp kind="dolls" />
      </p>
      <p className="lede">
        Max stats, aura text and the exact 3×3 tiles each doll covers. Every doll has its own page
        showing which positions it buffs and which dolls can buff it.
      </p>

      <div className="controls">
        <div className="field">
          <label htmlFor="doll-search">Search</label>
          <input
            id="doll-search"
            type="search"
            placeholder="Doll name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="doll-class">Class</label>
          <select
            id="doll-class"
            value={cls}
            onChange={(e) => setCls(e.target.value as Classification | "all")}
          >
            <option value="all">All classes</option>
            {CLASSIFICATIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="doll-rarity">Rarity</label>
          <select
            id="doll-rarity"
            value={rarity}
            onChange={(e) => setRarity(e.target.value === "all" ? "all" : Number(e.target.value))}
          >
            <option value="all">All rarities</option>
            {[2, 3, 4, 5].map((r) => (
              <option key={r} value={r}>
                {r}★
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="small faint" style={{ marginBottom: 8 }}>
        {rows.length} doll{rows.length === 1 ? "" : "s"}. Click a column heading to sort.
      </p>

      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <Th sort={sort} setSort={setSort} k="name" label="Name" align="left" />
              <Th sort={sort} setSort={setSort} k="index" label="No." />
              <th scope="col">Class</th>
              <Th sort={sort} setSort={setSort} k="rarity" label="Rarity" />
              <Th sort={sort} setSort={setSort} k="hp" label="HP" />
              <Th sort={sort} setSort={setSort} k="dmg" label="Dmg" />
              <Th sort={sort} setSort={setSort} k="acc" label="Acc" />
              <Th sort={sort} setSort={setSort} k="eva" label="Eva" />
              <Th sort={sort} setSort={setSort} k="rof" label="RoF" />
              <Th sort={sort} setSort={setSort} k="mov" label="Mov" />
              <th scope="col">Tiles</th>
              <th scope="col">Skill</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((doll) => (
              <tr key={doll.slug}>
                <td>
                  <Link to={`/dolls/${doll.slug}`}>{doll.name}</Link>
                </td>
                <td className="num faint">{doll.index ?? "—"}</td>
                <td>
                  {doll.classification ? (
                    <span
                      className="badge"
                      style={{ color: CLASS_COLOR[doll.classification], borderColor: CLASS_COLOR[doll.classification] }}
                    >
                      {doll.classification}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="num">{doll.rarity ? `${doll.rarity}★` : (doll.rarityLabel ?? "—")}</td>
                <td className="num">{maxOf(doll.stats.hp)}</td>
                <td className="num">{maxOf(doll.stats.dmg)}</td>
                <td className="num">{maxOf(doll.stats.acc)}</td>
                <td className="num">{maxOf(doll.stats.eva)}</td>
                <td className="num">{maxOf(doll.stats.rof)}</td>
                <td className="num">{doll.stats.mov ?? "—"}</td>
                <td className="faint small">{tileCount(doll)}</td>
                <td className="faint small">{primarySkillName(doll)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty">No dolls match those filters.</div>}
      </div>

      <div className="notice" style={{ marginTop: 24 }}>
        <strong>Scope.</strong> Only dolls released on the EN server are listed. Stats are the
        level-100 maximum; MOD3 values are shown on each doll&apos;s page. Data derived from IOP
        Wiki.
      </div>
    </div>
  );
}

function Th({
  sort,
  setSort,
  k,
  label,
  align = "num",
}: {
  sort: { key: SortKey; desc: boolean };
  setSort: (s: { key: SortKey; desc: boolean }) => void;
  k: SortKey;
  label: string;
  align?: "num" | "left";
}) {
  return (
    <th
      scope="col"
      className={`${align === "num" ? "num " : ""}sortable`}
      onClick={() => setSort(sort.key === k ? { key: k, desc: !sort.desc } : { key: k, desc: align === "num" })}
      aria-sort={sort.key === k ? (sort.desc ? "descending" : "ascending") : "none"}
    >
      {label}
      {sort.key === k && <span aria-hidden> {sort.desc ? "↓" : "↑"}</span>}
    </th>
  );
}

function sortVal(doll: Doll, key: SortKey): number | string {
  switch (key) {
    case "name":
      return doll.name;
    case "index":
      return doll.index ?? 9999;
    case "rarity":
      return doll.rarity ?? 0;
    case "mov":
      return doll.stats.mov ?? 0;
    default:
      return doll.stats[key][1] ?? 0;
  }
}

function maxOf(range: StatRange): string {
  return fmtInt(range[1]);
}

function tileCount(doll: Doll): string {
  const n = buffedPositions(doll).length;
  if (n === 0) return "none";
  return `${n} tile${n === 1 ? "" : "s"}`;
}

/** The doll's primary skill name, so the list shows what she actually does. */
function primarySkillName(doll: Doll): string {
  const entry = skillSummary(doll);
  if (!entry) return "—";
  if (entry.placeholder) return "no data";
  return entry.name ?? "—";
}

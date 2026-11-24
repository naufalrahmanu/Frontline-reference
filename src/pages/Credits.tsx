import { Link } from "react-router-dom";
import { dollMeta, mapMeta, skillStats } from "../lib/data.ts";

export function Credits() {
  return (
    <div className="wrap wrap--narrow prose">
      <p className="eyebrow">Credits</p>
      <h1>Sources, licences and disclaimers</h1>

      <h2>Map and farming data</h2>
      <p>
        The autobattle dataset—{mapMeta.mapCount} maps with resource costs, durations, base exp and
        limited-drop notes—comes from the community <em>GFL EN Autobattle Comparison</em>{" "}
        spreadsheet, maintained by <strong>Randomqwerty</strong> (Discord{" "}
        <span className="mono">Randomqwerty#4678</span>, Reddit{" "}
        <span className="mono">u/UnironicWeeaboo</span>).
      </p>
      <p>
        This site does <strong>not</strong> copy that spreadsheet&apos;s computed columns. It stores
        only the raw inputs — resource cost, parts, duration, base exp, level penalty — and
        re-derives exp per resource, per hour and per contract in the browser, so the assumptions can
        be moved. The arithmetic was checked against every one of the spreadsheet&apos;s computed
        rows before release; see <span className="mono">scripts/verify-formulas.ts</span> in the
        repository.
      </p>
      <p>
        One row in the source spreadsheet (&ldquo;Gaze ∞ - EX&rdquo;) has hard-typed derived values
        instead of formulas. The site honours those numbers under the spreadsheet&apos;s own default
        assumptions and flags the row, rather than silently disagreeing with its own source.
      </p>
      <p className="small faint">
        Dataset snapshot: {mapMeta.generatedAt} · {mapMeta.mapCount} maps, {mapMeta.releasedCount}{" "}
        released on EN · source spreadsheet patch {mapMeta.patch}
      </p>

      <h2>T-Doll data</h2>
      <p>
        Doll identification, stats, auras and tile layouts are derived from{" "}
        <a href="https://iopwiki.com" target="_blank" rel="noreferrer noopener">
          IOP Wiki
        </a>
        , whose text is licensed{" "}
        <a
          href="https://creativecommons.org/licenses/by-sa/3.0/"
          target="_blank"
          rel="noreferrer noopener"
        >
          CC BY-SA 3.0
        </a>
        . Extraction was a one-time crawl of the MediaWiki API, respecting that wiki&apos;s{" "}
        <span className="mono">Crawl-delay: 20</span>, with the result committed to this
        repository rather than fetched at runtime.
      </p>
      <p className="small faint">
        Dataset snapshot: {dollMeta.generatedAt} · {dollMeta.releasedOnEN} dolls released on EN of{" "}
        {dollMeta.totalDolls} parsed.
      </p>
      <h2>Skill data</h2>
      <p>
        Skill names, descriptions and per-level values come from each doll&apos;s skill subpages on
        IOP Wiki (<span className="mono">&lt;Doll&gt;/skilldata</span>,{" "}
        <span className="mono">&lt;Doll&gt;/skilldata/mod1</span>,{" "}
        <span className="mono">&lt;Doll&gt;/skill2data</span>), under the same CC BY-SA 3.0 licence.
      </p>
      <p>
        Descriptions are reproduced verbatim, including the wiki&apos;s{" "}
        <span className="mono">($placeholder)</span> tokens, which are substituted with the value
        for the level you select — so the wording is the wiki&apos;s and only the numbers move.
      </p>
      <p>
        {skillStats.dollsWithSkillData} of {skillStats.totalDolls} dolls have skill data.{" "}
        {skillStats.placeholderDolls > 0 && (
          <>
            {skillStats.placeholderDolls} page is an unfinished placeholder in the wiki source and is
            labelled as such rather than filled in.{" "}
          </>
        )}
        Where the wiki has no skill entry at all, none is shown.
      </p>

      <h2>Licences</h2>
      <ul>
        <li>
          <strong>Site code</strong> — MIT.
        </li>
        <li>
          <strong>Data files</strong> (<span className="mono">src/data/*.json</span>) — CC BY-SA 3.0,
          because they derive from IOP Wiki. Reuse and improve them; keep the same licence.
        </li>
        <li>
          <strong>Written guides</strong> — original text for this site.
        </li>
      </ul>

      <h2>Artwork</h2>
      <p>
        No character artwork is hosted on this site in v1. Doll records carry a reserved portrait
        field that is currently empty.
      </p>

      <h2>Disclaimers</h2>
      <p>
        This is an unofficial fan reference. It is not affiliated with, endorsed by, or sponsored by
        Sunborn Network Technology or MICA Team. <em>Girls&apos; Frontline</em> and all related
        names, marks and assets are the property of their respective owners.
      </p>
      <p>
        The site is non-commercial. It carries no advertising, no accounts, and sells nothing. If you
        represent a rights holder and want something removed, see the contact route below.
      </p>

      <h2>Corrections</h2>
      <p>
        Data errors are inevitable in a hand-maintained dataset this size. Corrections are welcome
        as pull requests against the JSON files in the repository, or by opening an issue with the
        map or doll name and the value you believe is correct. Please include a source where you can.
      </p>

      <h2>What is deliberately not promised</h2>
      <p>
        This site does not chase patches. The main story of GFL1 concluded with Episode 15.9 and EN
        content updates have effectively stopped, so each dataset here is a dated snapshot rather
        than a live feed. Every page shows when its data was verified. That is the design, not a
        shortfall.
      </p>

      <p style={{ marginTop: 32 }}>
        <Link to="/farming">Farming Explorer</Link> · <Link to="/dolls">Doll Database</Link> ·{" "}
        <Link to="/start">Start Here</Link>
      </p>
    </div>
  );
}

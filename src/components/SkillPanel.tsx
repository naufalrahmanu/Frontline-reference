import { useState } from "react";
import type { DollSkill } from "../lib/dolls.ts";
import {
  MAX_SKILL_LEVEL,
  fmtSkillValue,
  groupSkills,
  resolveSkill,
  tierLabel,
} from "../lib/skills.ts";

/**
 * A doll's skills, with a level selector.
 *
 * The wiki gives one description plus ten values per numeric row, so "level" is a real dimension
 * of the data rather than a display gimmick: moving the selector substitutes different numbers
 * into the same sentence. That is why this is interactive instead of a static block.
 *
 * MOD variants are grouped under their base skill rather than listed as separate skills — the
 * upgrade is a modification of the same ability, and showing "Chain Shot" four times would
 * misrepresent how many skills the doll has.
 */
export function SkillPanel({ skills }: { skills: DollSkill[] }) {
  const groups = groupSkills(skills);

  if (groups.length === 0) {
    return (
      <section className="card" style={{ marginTop: 24 }}>
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Skills</h2>
        <p className="small muted" style={{ marginBottom: 0 }}>
          No skill data recorded for this doll.
        </p>
      </section>
    );
  }

  return (
    <section className="card" style={{ marginTop: 24 }}>
      <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Skills</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {groups.map((group) => (
          <SkillGroupBlock key={group.slot} group={group} />
        ))}
      </div>
      <p className="small faint" style={{ margin: "14px 0 0" }}>
        Descriptions and per-level values come from IOP Wiki. Numbers are shown for the selected
        level; the wording is kept verbatim.
      </p>
    </section>
  );
}

function SkillGroupBlock({ group }: { group: ReturnType<typeof groupSkills>[number] }) {
  const [tier, setTier] = useState(group.variants[0]?.tier ?? "base");
  const [level, setLevel] = useState(MAX_SKILL_LEVEL);

  const skill = group.variants.find((v) => v.tier === tier) ?? group.variants[0];
  if (!skill) return null;

  const resolved = resolveSkill(skill, level);
  const hasCooldown = resolved.cooldown !== null;

  return (
    <div className="skill-block">
      <div className="skill-block__head">
        <div>
          <h3 style={{ margin: "0 0 2px", fontSize: "0.98rem" }}>{skill.name}</h3>
          <div className="small faint">
            {group.slot === 2 ? "Secondary skill (MOD2)" : "Primary skill"}
          </div>
        </div>

        {group.variants.length > 1 && (
          <div className="skill-tiers" role="group" aria-label={`${skill.name} version`}>
            {group.variants.map((v) => (
              <button
                key={v.tier}
                type="button"
                className={`btn ${v.tier === tier ? "btn--active" : ""}`}
                onClick={() => setTier(v.tier)}
              >
                {tierLabel(v)}
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="skill-text">
        {resolved.text.split("\n").map((line, i) => (
          <span key={i}>
            {i > 0 && <br />}
            {line}
          </span>
        ))}
      </p>

      {skill.isPlaceholder && (
        <p className="small" style={{ color: "var(--amber)", margin: "0 0 8px" }}>
          This skill entry is an unfinished placeholder on IOP Wiki — not real game data. It is
          shown as-is rather than invented.
        </p>
      )}

      {resolved.unresolved.length > 0 && (
        <p className="small" style={{ color: "var(--red)", margin: "0 0 8px" }}>
          Wiki has no value for {resolved.unresolved.map((u) => `$${u}`).join(", ")} on this skill,
          so the token is left visible rather than removed.
        </p>
      )}

      <div className="skill-stats">
        <label className="skill-level">
          <span className="faint small">Level</span>
          <select
            value={level}
            onChange={(e) => setLevel(Number(e.target.value))}
            aria-label={`${skill.name} level`}
          >
            {Array.from({ length: Math.max(skill.levels, MAX_SKILL_LEVEL) }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        {hasCooldown && (
          <span className="skill-stat">
            <span className="faint small">Cooldown</span>{" "}
            <span className="mono">{fmtSkillValue(resolved.cooldown!)}s</span>
          </span>
        )}

        {resolved.initial !== null && (
          <span className="skill-stat">
            <span className="faint small">Initial</span>{" "}
            <span className="mono">{fmtSkillValue(resolved.initial)}s</span>
          </span>
        )}
      </div>

      {resolved.values.length > 0 && (
        <div className="skill-curves">
          {resolved.values.map((v) => (
            <span key={v.key} className="skill-curve">
              <span className="faint small">{prettyKey(v.key)}</span>{" "}
              <span className="mono">{v.display}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** `min_dam_value` -> "min dam value" */
function prettyKey(key: string): string {
  return key.replace(/_/g, " ");
}

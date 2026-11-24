/**
 * Skill rendering.
 *
 * The wiki writes a skill's description once, with ($placeholder) tokens where the numbers go,
 * and lists ten values per numeric row — one per skill level. So the text is a template and the
 * curves are its arguments.
 *
 * Three things here matter for correctness:
 *
 *  1. Substitution must be exact. `$min_dam_value` and `$min_dam_value_2` both exist on some
 *     skills, so replacing the shorter token first would corrupt the longer one.
 *  2. Some values are themselves several numbers, written "1.8/0.7/0.4" — damage falloff by
 *     distance band. Those are `tieredCurves` and render with their slashes intact.
 *  3. A placeholder may have no value at all, because the wiki page is unfinished (K7's skill is
 *     literally named "Placeholder Name"). Those are reported, never silently deleted, so a data
 *     gap stays visible instead of producing a sentence with a hole in it.
 */

import type { DollSkill } from "./dolls.ts";

/** Skill levels are 1-10 in game; the wiki lists ten values. */
export const MAX_SKILL_LEVEL = 10;

export interface ResolvedValue {
  key: string;
  /** Rendered value, e.g. "2.4" or "2.4/0.9/0.5". */
  display: string;
}

export interface ResolvedSkill {
  /** Description with every placeholder replaced, for the given level. */
  text: string;
  /** Placeholders that had no value and remain in the text. */
  unresolved: string[];
  /** The level actually used, clamped to the available range. */
  level: number;
  /** Cooldown at this level, if the skill has one. */
  cooldown: number | null;
  /** Initial cooldown at this level, if the skill has one. */
  initial: number | null;
  /** Values shown for this level, in the order they appear in the text. */
  values: ResolvedValue[];
}

function clampIndex(level: number, length: number): number {
  return Math.min(Math.max(level, 1), length) - 1;
}

function valueAt(curve: number[] | undefined, level: number): number | null {
  if (!curve || curve.length === 0) return null;
  return curve[clampIndex(level, curve.length)] ?? null;
}

function tieredAt(curve: number[][] | undefined, level: number): number[] | null {
  if (!curve || curve.length === 0) return null;
  return curve[clampIndex(level, curve.length)] ?? null;
}

/** Format a number for display: integers stay whole, decimals keep up to two places. */
export function fmtSkillValue(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 100) / 100);
}

export function resolveSkill(skill: DollSkill, level: number): ResolvedSkill {
  const maxLevel = Math.max(skill.levels, MAX_SKILL_LEVEL);
  const clamped = Math.min(Math.max(level, 1), maxLevel);

  // Longest placeholder first, so `_2` suffixes are not eaten by their shorter prefixes.
  const keys = [...skill.placeholders].sort((a, b) => b.length - a.length);
  const unresolved: string[] = [];
  const values: ResolvedValue[] = [];

  let text = skill.text;
  for (const key of keys) {
    const scalar = valueAt(skill.curves[key], clamped);
    if (scalar !== null) {
      const display = fmtSkillValue(scalar);
      values.push({ key, display });
      text = text.split(`($${key})`).join(display);
      continue;
    }

    const tiered = tieredAt(skill.tieredCurves?.[key], clamped);
    if (tiered !== null) {
      const display = tiered.map(fmtSkillValue).join("/");
      values.push({ key, display });
      text = text.split(`($${key})`).join(display);
      continue;
    }

    // Sometimes the value is a plain string row (usually descriptive).
    const raw = skill.singleValues[key];
    if (typeof raw === "string" && raw.trim() !== "") {
      values.push({ key, display: raw });
      text = text.split(`($${key})`).join(raw);
      continue;
    }
    if (Array.isArray(raw) && raw.length > 0) {
      const display = String(raw[clampIndex(clamped, raw.length)] ?? raw[0] ?? "");
      values.push({ key, display });
      text = text.split(`($${key})`).join(display);
      continue;
    }

    unresolved.push(key);
  }

  return {
    text,
    unresolved,
    level: clamped,
    cooldown: valueAt(skill.cooldown ?? undefined, clamped),
    initial: valueAt(skill.initial ?? undefined, clamped),
    values,
  };
}

/** A compact label for a skill variant, e.g. "Base", "MOD1", "MOD2 skill". */
export function tierLabel(skill: DollSkill): string {
  if (skill.tier === "base") return skill.slot === 2 ? "MOD2 skill" : "Base";
  const mod = skill.tier.toUpperCase();
  return skill.slot === 2 ? `${mod} skill` : mod;
}

/**
 * Group a doll's skill entries for display.
 *
 * A doll may have the same skill at several MOD tiers. Presenting them as a single skill with a
 * tier selector is more honest than listing "Chain Shot" four times, so this collapses by slot.
 */
export interface SkillGroup {
  slot: number;
  name: string;
  /** Variants ordered base first, then MOD1-3. */
  variants: DollSkill[];
}

export function groupSkills(skills: DollSkill[]): SkillGroup[] {
  const bySlot = new Map<number, DollSkill[]>();
  for (const skill of skills) {
    if (!bySlot.has(skill.slot)) bySlot.set(skill.slot, []);
    bySlot.get(skill.slot)!.push(skill);
  }

  const tierRank = (t: string) => (t === "base" ? 0 : Number(t.replace("mod", "")) || 99);

  return [...bySlot.entries()]
    .sort(([a], [b]) => a - b)
    .map(([slot, variants]) => ({
      slot,
      name: variants[0]?.name ?? "",
      variants: [...variants].sort((a, b) => tierRank(a.tier) - tierRank(b.tier)),
    }));
}

/** True when any variant in the group is an unfinished wiki placeholder. */
export function isPlaceholderGroup(group: SkillGroup): boolean {
  return group.variants.every((v) => v.isPlaceholder);
}

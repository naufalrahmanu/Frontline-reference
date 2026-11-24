#!/usr/bin/env node
/**
 * Sanity-check the formation logic against known-correct game behaviour.
 *
 * The tile-buff engine is the one part of this site that can be subtly wrong while still
 * producing plausible output — an earlier version only let the centre doll buff, which looked
 * fine and was completely incorrect. These are the assertions that catch that class of bug.
 *
 * Run:  node scripts/check-echelon.ts
 */

import {
  ALL_POSITIONS,
  buffedPositions,
  incomingBuffs,
  parseAura,
  acceptsAura,
  standingIndex,
  type Placement,
  type Position,
} from "../src/lib/echelon.ts";
import type { Doll, Classification } from "../src/lib/dolls.ts";

let failures = 0;
let checks = 0;

function ok(name: string, condition: boolean, detail = "") {
  checks += 1;
  if (!condition) {
    failures += 1;
    console.error(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function eq(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  ok(name, a === e, `expected ${e}, got ${a}`);
}

function doll(
  name: string,
  tiles: Array<number | null>,
  aura: string[],
  classification: Classification = "AR",
): Doll {
  return {
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    index: 1,
    classification,
    rarity: 4,
    rarityLabel: "4",
    stats: {
      dmg: [1, 1],
      acc: [1, 1],
      eva: [1, 1],
      rof: [1, 1],
      hp: [1, 1],
      mov: 10,
    },
    aura,
    tiles,
    moddable: false,
    modTiles: null,
    mod3Stats: null,
    craftTime: null,
    artist: null,
    releasedOnEN: true,
    portrait: null,
    portraitSource: null,
    source: "test",
  };
}

// ---------------------------------------------------------------------------
// 1. Translation. A pattern is relative to the doll and shifts with her.
// ---------------------------------------------------------------------------

// UMP45's real pattern: tiles 1, 4, 7 buffed, stands on 5.
const ump = doll("UMP45", [1, null, null, 1, 0, null, 1, null, null], ["Affects assault rifles", "Increases damage by 18%"]);

eq("UMP45 at 5 covers 1,4,7", buffedPositions(ump, 5), [1, 4, 7]);
// The pattern keeps its offset from her standing cell, so moving her one row down shifts the
// covered column one row down too. From cell 8 the row-0 tile falls off the top: 1/4/7 -> 4/7.
eq("UMP45 at 8 covers 4,7 (top tile falls off)", buffedPositions(ump, 8), [4, 7]);
// At cell 9 the whole pattern shifts one cell right as well: 1/4/7 -> 5/8, two cells lost.
eq("UMP45 at 9 covers 5,8", buffedPositions(ump, 9), [5, 8]);

// ---------------------------------------------------------------------------
// 2. Every doll projects. A doll not in the centre still buffs.
// ---------------------------------------------------------------------------

const offCentre = doll("Striker", [null, null, null, null, 0, 1, null, null, null], ["Affects all guns", "Increases damage by 10%"]);
const receiver = doll("Receiver", [null, null, null, null, 0, null, null, null, null], []);
const formation: Placement[] = [
  { dollSlug: offCentre.slug, position: 5 },
  { dollSlug: receiver.slug, position: 6 },
];
const lib = new Map([offCentre, receiver].map((d) => [d.slug, d]));
const received = incomingBuffs({ dollSlug: receiver.slug, position: 6 }, formation, (s) => lib.get(s));
ok("non-centre doll can receive a buff", received.length === 1, JSON.stringify(received));
ok("buff value is 10", received[0]?.total === 10, String(received[0]?.total));

// Now put the provider off-centre: she should still project.
const offFormation: Placement[] = [
  { dollSlug: offCentre.slug, position: 2 },
  { dollSlug: receiver.slug, position: 3 },
];
const offReceived = incomingBuffs(
  { dollSlug: receiver.slug, position: 3 },
  offFormation,
  (s) => lib.get(s),
);
ok(
  "a doll at cell 2 projects onto cell 3",
  offReceived.length === 1,
  `got ${JSON.stringify(offReceived)}`,
);

// ---------------------------------------------------------------------------
// 3. Class filtering. "Affects assault rifles" does not buff a handgun.
// ---------------------------------------------------------------------------

const arAura = doll("Buffer", [1, null, null, null, 0, null, null, null, null], ["Affects assault rifles", "Increases damage by 18%"]);
const hg = doll("Pistol", [null, null, null, null, 0, null, null, null, null], [], "HG");
const ar = doll("Rifle", [null, null, null, null, 0, null, null, null, null], [], "AR");

// arAura covers only cell 1. Put an HG there and an AR on an uncovered cell, then swap them.
const filterFormation: Placement[] = [
  { dollSlug: arAura.slug, position: 5 },
  { dollSlug: hg.slug, position: 1 },
  { dollSlug: ar.slug, position: 7 },
];
const filterLib = new Map([arAura, hg, ar].map((d) => [d.slug, d]));

const hgBuffs = incomingBuffs({ dollSlug: hg.slug, position: 1 }, filterFormation, (s) => filterLib.get(s));
ok("handgun on a covered cell receives nothing from an AR-only aura", hgBuffs.length === 0, JSON.stringify(hgBuffs));

// Same aura, same cell, but now an AR stands there — it should be buffed.
const swapped: Placement[] = [
  { dollSlug: arAura.slug, position: 5 },
  { dollSlug: ar.slug, position: 1 },
];
const arBuffs = incomingBuffs({ dollSlug: ar.slug, position: 1 }, swapped, (s) => filterLib.get(s));
ok("assault rifle on the same aura receives the buff", arBuffs.length === 1, JSON.stringify(arBuffs));
ok("the buff value is 18", arBuffs[0]?.total === 18, String(arBuffs[0]?.total));

// "Affects all guns" accepts anything.
const universal = parseAura(["Affects all guns", "Increases rate of fire by 30"]);
ok("'all guns' accepts a handgun", acceptsAura(universal, hg));
ok("'all guns' accepts an AR", acceptsAura(universal, ar));

// ---------------------------------------------------------------------------
// 4. Self-buffing does not happen.
// ---------------------------------------------------------------------------

const selfDoll = doll("Self", [1, 1, 1, 1, 0, 1, 1, 1, 1], ["Affects all guns", "Increases damage by 50%"]);
const selfFormation: Placement[] = [{ dollSlug: selfDoll.slug, position: 5 }];
const selfBuffs = incomingBuffs({ dollSlug: selfDoll.slug, position: 5 }, selfFormation, (s) =>
  s === selfDoll.slug ? selfDoll : undefined,
);
ok("a doll does not buff herself", selfBuffs.length === 0, JSON.stringify(selfBuffs));

// ---------------------------------------------------------------------------
// 5. Standing-cell detection, including dolls whose marker is not the centre.
// ---------------------------------------------------------------------------

eq("standing marker at 5", standingIndex([null, null, null, null, 0, null, null, null, null]), 4);
eq("standing marker at 8 (Px4 Storm shape)", standingIndex([1, null, null, 1, 1, null, 1, 0, null]), 7);
eq("no standing marker", standingIndex([1, null, null, null, null, null, null, null, null]), null);

// Px4 Storm at her printed position covers 1,4,5,7 — the pattern must not be re-centred on 5.
const px4 = doll("Px4 Storm", [1, null, null, 1, 1, null, 1, 0, null], ["Affects all guns", "Increases damage by 24%"], "HG");
eq("Px4 Storm at 8 covers 1,4,5,7", buffedPositions(px4, 8), [1, 4, 5, 7]);

// ---------------------------------------------------------------------------
// 6. Aura parsing of the wiki's real phrasings.
// ---------------------------------------------------------------------------

const kar = parseAura(["Affects handguns", "Reduce skill cooldown by 18%"]);
eq("Kar98k targets handguns", kar.affects, ["HG"]);
eq("Kar98k effect is skill cooldown 18", kar.effects.map((e) => [e.stat, e.value]), [["skill", 18]]);

const m4 = parseAura(["Affects assault rifles", "Increases damage by 18%", "Increases critical hit rate by 30%"]);
eq("M4A1 has two effects", m4.effects.map((e) => e.stat), ["dmg", "crit"]);
eq("M4A1 crit is 30", m4.effects[1]?.value, 30);

const hgAura = parseAura(["Affects all guns", "Increases rate of fire by 30", "Increases accuracy by 50"]);
ok("HG aura is universal", hgAura.affectsAll);
eq("HG aura values", hgAura.effects.map((e) => e.value), [30, 50]);
ok("HG aura is not percent-scaled (wiki writes bare numbers)", hgAura.effects.every((e) => !e.percent));

// Unparseable lines are reported, not silently dropped.
const weird = parseAura(["Affects all guns", "Does something strange"]);
ok("unparseable aura line is reported", weird.unparsed.length === 1, JSON.stringify(weird.unparsed));

// ---------------------------------------------------------------------------
// 6b. Every "Affects ..." spelling that actually appears in the dataset.
// ---------------------------------------------------------------------------

// These are the real strings, copied from src/data/dolls.json. Several spellings broke earlier
// versions: "machineguns" (no space) matched nothing, and a bare /rifle/ also matched the
// "rifle" in "assault rifle", adding RF to AR-only auras.
const AFFECTS_CASES: Array<[string, string[]]> = [
  ["Affects Assault Rifles", ["AR"]],
  ["Affects Handguns", ["HG"]],
  ["Affects MGs", ["MG"]],
  ["Affects Machine Guns", ["MG"]],
  ["Affects Shotguns", ["SG"]],
  ["Affects Submachine guns", ["SMG"]],
  ["Affects assault rifle", ["AR"]],
  ["Affects assault rifles", ["AR"]],
  ["Affects assault rifles (AR) and rifles (RF)", ["AR", "RF"]],
  ["Affects assault rifles (AR) and submachine guns (SMG)", ["AR", "SMG"]],
  ["Affects assault rifles and submachine guns", ["AR", "SMG"]],
  ["Affects handguns (HG) and rifles (RF)", ["HG", "RF"]],
  ["Affects handguns (HG) and submachine guns (SMG)", ["HG", "SMG"]],
  ["Affects handguns and rifles", ["HG", "RF"]],
  ["Affects machine guns (MG) and rifles (RF)", ["MG", "RF"]],
  ["Affects machine guns (MG) and shotguns (SG)", ["MG", "SG"]],
  ["Affects machine guns and shotguns", ["MG", "SG"]],
  ["Affects machineguns", ["MG"]],
  ["Affects pistols", ["HG"]],
  ["Affects rifles", ["RF"]],
  ["Affects sub machineguns", ["SMG"]],
  ["Affects submachine guns", ["SMG"]],
  ["Affects submachine guns (SMG), assault rifles (AR) and shotguns (SG)", ["SMG", "AR", "SG"]],
  ["Affects submachine guns and assault rifles", ["SMG", "AR"]],
  ["Affects submachineguns", ["SMG"]],
];

for (const [line, expected] of AFFECTS_CASES) {
  const parsed = parseAura([line]);
  eq(`affects: ${line}`, [...parsed.affects].sort(), [...expected].sort());
}

// The universal spellings.
for (const line of ["Affects all guns", "Affects all classes", "Affects all types", "Affects all weapons"]) {
  ok(`universal: ${line}`, parseAura([line]).affectsAll, JSON.stringify(parseAura([line])));
}

// Trailing periods must not break a match.
eq("trailing period is ignored", parseAura(["Affects assault rifles (AR) and submachine guns (SMG)."]).affects.sort(), ["AR", "SMG"]);

// The critical regression: an AR-only aura must not accept a machine gun or a rifle.
const arOnly = parseAura(["Affects assault rifles", "Increases damage by 18%"]);
ok("AR aura does not accept MG", !acceptsAura(arOnly, { classification: "MG" } as Doll));
ok("AR aura does not accept RF", !acceptsAura(arOnly, { classification: "RF" } as Doll));
ok("AR aura accepts AR", acceptsAura(arOnly, { classification: "AR" } as Doll));
const mgOnly = parseAura(["Affects machineguns", "Increase Damage by 20%"]);
ok("MG aura accepts MG", acceptsAura(mgOnly, { classification: "MG" } as Doll));
ok("MG aura does not accept SG (a shotgun buffs MGs, not the reverse)", !acceptsAura(mgOnly, { classification: "SG" } as Doll));

// ---------------------------------------------------------------------------
// 7. Coverage never invents cells outside the board.
// ---------------------------------------------------------------------------

const corner = doll("Corner", [1, 1, 1, 1, 0, 1, 1, 1, 1], ["Affects all guns", "Increases damage by 5%"]);
for (const at of ALL_POSITIONS) {
  const covered = buffedPositions(corner, at);
  ok(
    `coverage at ${at} stays on the board`,
    covered.every((p) => p >= 1 && p <= 9),
    JSON.stringify(covered),
  );
}
// A doll covering all 8 neighbours: in the centre all 8 stay; in a corner only 3 remain.
eq("full-aura doll at 5 covers 8 cells", buffedPositions(corner, 5 as Position).length, 8);
eq("full-aura doll at 1 covers 3 cells", buffedPositions(corner, 1 as Position).length, 3);

// ---------------------------------------------------------------------------

if (failures === 0) {
  console.log(`OK  ${checks} assertions on echelon geometry and aura handling.`);
} else {
  console.error(`\n${failures} of ${checks} assertions failed.`);
  process.exit(1);
}

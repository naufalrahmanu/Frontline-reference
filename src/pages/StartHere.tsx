import { Link } from "react-router-dom";

export function StartHere() {
  return (
    <div className="wrap wrap--narrow prose">
      <p className="eyebrow">Start here</p>
      <h1>Your first week in Girls&apos; Frontline</h1>
      <p className="lede">
        This page assumes you have installed the game and finished the tutorial. It covers what
        actually matters early, what is a trap, and which tool on this site to open first.
      </p>

      <div className="notice">
        <strong>Which tool do I need?</strong> If you are levelling dolls — which is most of the
        early game — open the <Link to="/farming">Farming Explorer</Link>. If you are looking at a
        specific doll and wondering what it does, open the{" "}
        <Link to="/dolls">Doll Database</Link>. You do not need both at once.
      </div>

      <h2>What an echelon actually is</h2>
      <p>
        Everything in this game is built on echelons: teams of up to five dolls on a 3×3 grid. The
        thing that confuses new players is that the grid is not a battle formation in the usual
        sense. <strong>Every doll</strong> in the echelon projects a buff pattern — a small shape of
        tiles around wherever she happens to be standing — and every doll standing on someone
        else&apos;s tiles receives that buff, provided her class matches.
      </p>
      <p>
        The pattern is drawn relative to the doll, so it <em>moves with her</em>. Put a doll in the
        middle and her tiles reach the cells around the centre; put her at the edge and part of that
        pattern falls off the board and is simply wasted. This is the whole game of echelon building:
        arranging dolls so their buff shapes overlap the dolls who want them, without spilling into
        empty space.
      </p>
      <p>
        There is also a class filter on top. A handgun whose aura says &ldquo;Affects assault
        rifles&rdquo; will not buff a shotgun standing on one of her tiles, even though the tile is
        covered. Open any doll in the <Link to="/dolls">Doll Database</Link> and you will see the
        pattern and who it targets; the <Link to="/builder">builder</Link> shows the shifted result
        for any arrangement and flags auras that land on nobody.
      </p>

      <h2>Levels and links: the two numbers that matter</h2>
      <p>
        A doll gets stronger two ways. <strong>Level</strong> raises stats gradually.{" "}
        <strong>Links</strong> — the dummy system — multiply the doll&apos;s presence on the field
        and are far more impactful per unit of effort. A 5-link doll is not 5× a 1-link doll, but it
        is close enough that links should be your first priority for any doll you actually use.
      </p>
      <p>
        Links are raised by feeding duplicates or dummy cores. Cores come from retiring dolls, so
        every duplicate you pull has value even when you do not want the doll.
      </p>

      <h2>Autobattle is not a shortcut, it is the main loop</h2>
      <p>
        You can send an echelon to repeat a map on autobattle while you do something else. This is
        how most levelling happens, and it is why the <Link to="/farming">Farming Explorer</Link>{" "}
        exists: not all maps are equally efficient, and the differences are large — several times
        over, not a few percent.
      </p>
      <p>Three things drive that difference:</p>
      <ul>
        <li>
          <strong>Resource cost per run.</strong> Manpower, ammo, rations and parts all come out of
          the same stockpile you need for production. A map that pays well but costs triple is
          usually worse than it looks.
        </li>
        <li>
          <strong>Duration.</strong> A 55-minute run that pays 250 exp and a 3-hour run that pays
          750 are not the same trade once you account for how many runs fit in a day.
        </li>
        <li>
          <strong>Level penalty.</strong> If your doll is far above the map&apos;s intended level,
          exp collapses — past a 40-level gap the map pays a flat trickle and nothing else. This is
          the mistake that wastes the most time: grinding a map that has stopped teaching your doll
          anything.
        </li>
      </ul>
      <p>
        The explorer lets you set your doll&apos;s level and see the penalty applied per map, so you
        can pick a map that is actually worth the resources at your current level rather than the
        one that was best at level 30.
      </p>

      <h2>What the autobattle card changes</h2>
      <p>
        The autobattle card lets a single echelon clear maps that would otherwise need two or three,
        and it adds a flat exp bonus. If you do not have it, the explorer&apos;s{" "}
        <em>Assumptions</em> panel will show you a materially different ranking — because a map that
        needs three echelons without the card is a very different proposition. Toggle it off and look
        at the table again; that is the honest picture for an account without the card.
      </p>

      <h2>Production and logistics, briefly</h2>
      <p>
        Production (the doll/equipment crafting queues) runs on timers and consumes resources.
        Logistics missions run in the background and refill those resources. The loop is: logistics
        pays for production, production gives you dolls and equipment, autobattle levelling turns
        those into usable echelons.
      </p>
      <p>
        Keep logistics running at all times. It is free income and the single most common thing new
        players forget. Do not run production at maximum rate if it leaves you unable to afford
        autobattle — a levelled doll beats a queued one.
      </p>

      <h2>Common early mistakes</h2>
      <ul>
        <li>
          <strong>Levelling everything.</strong> Pick a small core team and commit. Resources spent
          spreading across twenty dolls produce twenty weak dolls.
        </li>
        <li>
          <strong>Ignoring links.</strong> A high-level 2-link doll loses to a lower-level 4-link one
          more often than not.
        </li>
        <li>
          <strong>Never checking the level penalty.</strong> If your exp per run has collapsed, you
          are on the wrong map, not doing something wrong mechanically.
        </li>
        <li>
          <strong>Letting auras spill off the board.</strong> A doll at the edge loses part of her
          pattern. The builder counts the wasted cells for you — if it says two tiles are hanging off
          the side, move her in.
        </li>
        <li>
          <strong>Ignoring the class filter.</strong> A tile being covered does not mean the buff
          applies. Check the &ldquo;Affects&rdquo; line: an AR-only aura does nothing for the
          shotgun standing on it.
        </li>
        <li>
          <strong>Hoarding cores.</strong> Cores exist to make links. Spend them.
        </li>
      </ul>

      <h2>Where this site stops</h2>
      <p>
        This is a reference, not a walkthrough. It will not tell you which dolls to raise — that
        depends on what you own and what you enjoy. It will tell you exactly what the numbers are, so
        the decision is yours and it is an informed one.
      </p>
      <p>
        One thing worth knowing: the main story of Girls&apos; Frontline concluded with Episode 15.9,
        and the game is no longer receiving substantial new content on EN. That is good news for a
        reference site — the numbers here will not go stale next month — and it means there is no
        rush. Play at your own pace.
      </p>

      <h2>Next</h2>
      <ul>
        <li>
          <Link to="/farming">Farming Explorer</Link> — find the map worth your resources right now.
        </li>
        <li>
          <Link to="/dolls">Doll Database</Link> — look up any doll&apos;s tiles and stats.
        </li>
        <li>
          <Link to="/credits">Credits</Link> — where every number on this site comes from.
        </li>
      </ul>
    </div>
  );
}

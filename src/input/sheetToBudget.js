import { tonsToSquares } from "../model/tonnage.js";

// High Guard 2022: staterooms are 4 tons each regardless of single/double
// occupancy (occupancy affects crew capacity, not tonnage or footprint).
// Of that, the design sequence's own guidance allocates ~25% (1 ton) to a
// shared common-area pool, leaving the remaining 3 tons (6 squares) as the
// stateroom's own room footprint. See DeckDesigner.md section 1.
const STATEROOM_COMMON_AREA_FRACTION = 0.25;

// Matches the sheet's own separately-listed "Common Areas" line item, so its
// budget can be combined with the stateroom common-area share into one
// reportable pool rather than two.
const COMMON_AREA_LABEL = /common area/i;

// Converts a ShipInputSheet (see DeckDesigner.md section 2) into a flat list
// of budget "pools" - one per line item, plus the derived stateroom
// room/common-area split - each carrying a tons/squares figure and a
// `group` key so pools meant to be reported together (the stateroom
// common-area share and the sheet's own "Common Areas" line) can be summed.
export function sheetToBudget(sheet) {
  const pools = [];

  if (sheet.staterooms && sheet.staterooms.count > 0) {
    pools.push(...stateroomPools(sheet.staterooms, sheet.stateroomMode ?? "splitCommonArea"));
  }

  if (sheet.lowBerths && sheet.lowBerths.count > 0) {
    const tons = sheet.lowBerths.count * sheet.lowBerths.tonsEach;
    pools.push({
      key: "lowBerths",
      group: "lowBerths",
      label: "Low Berths",
      tons,
      squares: tonsToSquares(tons)
    });
  }

  for (const item of sheet.lineItems ?? []) {
    pools.push({
      key: `line:${item.label}`,
      group: COMMON_AREA_LABEL.test(item.label) ? "commonArea" : `line:${item.label}`,
      label: item.label,
      tons: item.tons,
      squares: tonsToSquares(item.tons),
      placementMode: item.placementMode
    });
  }

  const totalSquares = tonsToSquares(sheet.hullTons);
  const allocatedSquares = pools.reduce((sum, p) => sum + p.squares, 0);

  return {
    totalSquares,
    allocatedSquares,
    remainingSquares: totalSquares - allocatedSquares,
    pools,
    groups: groupPools(pools)
  };
}

function stateroomPools(staterooms, mode) {
  const totalTons = staterooms.count * staterooms.tonsEach;
  const totalSquares = tonsToSquares(totalTons);

  if (mode === "literal") {
    return [{
      key: "staterooms",
      group: "staterooms",
      label: "Staterooms",
      tons: totalTons,
      squares: totalSquares
    }];
  }

  const commonAreaSquares = totalSquares * STATEROOM_COMMON_AREA_FRACTION;
  return [
    {
      key: "staterooms",
      group: "staterooms",
      label: "Staterooms",
      tons: totalTons * (1 - STATEROOM_COMMON_AREA_FRACTION),
      squares: totalSquares - commonAreaSquares
    },
    {
      key: "staterooms-common",
      group: "commonArea",
      label: "Staterooms (common-area share)",
      tons: totalTons * STATEROOM_COMMON_AREA_FRACTION,
      squares: commonAreaSquares
    }
  ];
}

// Combines pools that share a `group` into one reportable total, in
// first-seen order.
function groupPools(pools) {
  const groups = [];
  const byGroup = new Map();

  for (const pool of pools) {
    let group = byGroup.get(pool.group);
    if (!group) {
      group = {
        key: pool.group,
        label: pool.group === "commonArea" ? "Common Areas" : pool.label,
        tons: 0,
        squares: 0,
        sources: []
      };
      byGroup.set(pool.group, group);
      groups.push(group);
    }
    group.tons += pool.tons;
    group.squares += pool.squares;
    group.sources.push(pool.key);
  }

  return groups;
}

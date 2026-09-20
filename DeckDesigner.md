# Traveller (Mongoose 2e) Deck Plan Designer — Architecture

A local, browser-based tool for building rules-accurate starship deck plans and exporting them straight into a Foundry VTT scene (walls, doors, lighting). Designed to be built incrementally with Claude Code.

**Design approach:** the tool does not run its own ship-design sequence. It takes the output of the existing Mongoose 2e design sequence (the tonnage sheet — hull, drives, staterooms, common areas, cargo, etc., as produced by the book or a separate design tool) as input, converts each line to a square-footage budget, and lets the user spend that budget by placing components and painting zones on a deck grid. This keeps the tool's rules surface small and avoids re-deriving ship design math that's already been done correctly elsewhere.

## 1. Core rules to encode

- **1 displacement ton (Dton) = 14 m³** (Mongoose's stated figure for 2e; 13.5 m³ is the older/T5 value).
- **Standard deck plan grid square = 1.5m × 1.5m**, with a standard **3m deck height**.
- That gives **2 grid squares per Dton** — the single master conversion constant used to turn every line of the input sheet into a square budget.
- **Every input-sheet line is trusted as-is.** Staterooms, Common Areas, Bridge, Fuel Tanks, Cargo, Systems, etc. are each already a correct tonnage figure from the design sequence — the tool's job is converting tons → squares per line, not re-deriving what those tons should be. This sidesteps edition/errata ambiguity in the underlying design math (e.g. differing common-space formulas across rulebooks) by simply not needing to know it.
- **Staterooms are 4 tons each under High Guard 2022**, regardless of single or double occupancy — occupancy affects crew capacity, not tonnage or footprint. Of that 4 tons, the current design sequence's own guidance is that **~25% (1 ton) is allocated to common areas**, with the remaining 3 tons (6 squares) as the stateroom's own footprint. So per stateroom: 6 squares of room + 2 squares fed into a separate common-area budget pool.
  - `stateroomMode` remains a toggle for flexibility: **`splitCommonArea`** (default) applies the 25% rule above; **`literal`** treats the full 8 squares as the stateroom's own footprint with no split, for anyone deliberately deviating from the guidance.
- **Barracks-type bunks**: 1.5 Dtons (3 squares) per occupant equivalent — no equivalent common-area split is specified for these, so barracks convert straight through.
- Everything else on the sheet (bridge, systems, fuel tanks, cargo, weapons) converts via the same 2-squares-per-Dton constant with no special-casing, except that some are discrete rooms and some are open zones — see the two placement modes in section 2.

Treat this section as the single source of truth the code should cite in comments.

## 2. Data model

```
ShipInputSheet                    // transcribed once from the design-sequence output sheet
  name: string
  hullTons: number                // total Dtons — defines the overall square budget (hullTons * 2)
  staterooms: {count: number, tonsEach: number, occupancy: "single" | "double"}  // tonsEach is
                                   // typically 4 regardless of occupancy — occupancy is a
                                   // crew-capacity note only, doesn't affect the tonnage/footprint math
  lowBerths: {count: number, tonsEach: number}
  lineItems: LineItem[]           // every other sheet row: Bridge, Common Areas (as separately
                                   // listed on the sheet, e.g. the Subsidised Merchant's 5.5 tons),
                                   // Systems (fuel processors, docking space, launch), Fuel Tanks,
                                   // Cargo, Weapons, etc.
  stateroomMode: "splitCommonArea" | "literal"   // section 1 toggle — splitCommonArea applies the
                                   // 25%-to-common-areas rule; literal treats all 8 squares/stateroom
                                   // as room footprint

LineItem
  label: string                   // as printed on the sheet, e.g. "Fuel Tanks"
  tons: number
  placementMode: "catalog" | "zoneFill"   // see below

Ship                               // the working deck-plan project, derived from a ShipInputSheet
  inputSheet: ShipInputSheet
  decks: Deck[]

Deck
  id: string
  label: string                   // "Deck 1 — Bridge & Crew"
  widthSquares: number
  heightSquares: number
  components: PlacedComponent[]   // catalog-mode placements
  zones: ZoneRegion[]             // zone-fill-mode painted areas
  walls: WallSegment[]
  lights: LightSource[]

ComponentType (library, not per-ship)   // for CATALOG mode: fixed-footprint, discrete rooms
  id: string                      // "stateroom", "low_berth", "bridge_small", "turret_single"
  label: string
  footprintSquares: {w: number, h: number} | Polygon
  category: "accommodation" | "common" | "operations" | "engineering" | "weapons" | "access"
  icon: string

PlacedComponent
  id: string
  typeId: string                  // -> ComponentType.id
  deckId: string
  x, y: number                    // grid-square coordinates, top-left
  rotation: 0 | 90 | 180 | 270
  label?: string                  // e.g. "Captain's Stateroom"

ZoneRegion                        // for ZONE-FILL mode: freeform painted areas (Cargo, Fuel Tanks, ...)
  id: string
  deckId: string
  lineItemLabel: string           // -> LineItem.label, links back to the budget pool
  squares: {x: number, y: number}[]   // painted grid cells

WallSegment
  id: string
  x1, y1, x2, y2: number          // grid-square coordinates (fractional allowed for mid-square walls)
  kind: "wall" | "door" | "secureDoor"

LightSource
  id: string
  x, y: number
  dim: number                     // squares
  bright: number                  // squares
  color?: string
```

**Placement modes:**
- **Catalog** (fixed footprint, drag-from-palette): Staterooms, Bridge, weapon turrets, airlocks, and other line items that are naturally one discrete, regularly-shaped room.
- **Zone-fill** (freeform, paint-N-squares): Cargo, Fuel Tanks, Low Berths, Engineering, Common Areas, and anything else that's really "N squares of X" rather than a room with a fixed shape - either because it has no canonical shape (cargo, fuel) or because it's routinely split up/irregular in practice (engineering, low-berth banks). A click-and-drag paint tool fills grid cells and stops once the pool's square budget is spent. Low Berths gets its own dedicated input-sheet fields (count/tons-each) rather than being a generic `LineItem`, but its resulting square budget is still a zone-fill pool, not a catalog component.

Each `LineItem` (and the derived stateroom/low-berth pools) carries its own square budget = `tons * 2`, independent of the others — the budget tracker (section 5) reports remaining squares per line item, not just an overall total.

Keep `ComponentType` as a static/editable JSON library (`data/component-library.json`) separate from any given ship, so it's easy to extend later without touching app logic.

## 3. Suggested project structure

```
traveller-deckplan/
  index.html
  src/
    input/
      SheetEntryForm.js    // UI for transcribing the design-sequence output sheet
      sheetToBudget.js     // ShipInputSheet -> per-line square budgets (section 1/2 math)
    grid/
      GridCanvas.js        // renders the SVG/canvas grid, handles pan/zoom
      snapping.js          // grid-snap + collision detection (catalog mode)
      zonePaint.js          // freeform cell painting + budget enforcement (zone-fill mode)
    model/
      ship.js              // Ship/Deck/PlacedComponent/ZoneRegion classes + validation
      tonnage.js           // the 2-squares-per-Dton conversion constant
    components/
      library.json         // ComponentType definitions
      ComponentPalette.js   // drag-source UI listing catalog components
    export/
      exportPNG.js
      exportFoundryScene.js // the Foundry JSON builder (section 4)
    ui/
      DeckTabs.js
      Toolbar.js
      BudgetPanel.js        // per-line-item squares-used/remaining, from section 5
  data/
    ships/                  // saved ship JSON files (ShipInputSheet + Ship schema above)
  README.md
```

Everything client-side — no backend needed. State lives in memory + JSON import/export to files on disk, which also doubles as your save format.

## 4. Foundry VTT export

Foundry's `Wall` document (confirmed against the current API schema) is what both walls and doors are built from — a door is just a wall segment with `door` set:

```
WallData {
  c: [x0, y0, x1, y1]   // pixel coordinates, not grid squares
  door: 0 | 1 | 2        // 0 = none, 1 = door, 2 = secret door
  ds: 0 | 1 | 2          // door state: 0 closed, 1 open, 2 locked
  sight: number           // vision-blocking flag
  move: number             // movement-blocking flag
  sound: number
  light: number
  dir: number               // one-directional walls, if ever needed
}
```

`AmbientLight` documents (x, y in pixels, plus a `config` object with `dim`, `bright`, `color`, `alpha`, `angle`) cover the lighting side.

Export module responsibilities:
1. Take a `Deck` and a chosen `pixelsPerSquare` (Foundry scenes have a `grid.size` in pixels — match this so a 1.5m square lines up with Foundry's own grid unit).
2. Convert every `WallSegment` to a `WallData` entry, converting grid coords → pixel coords via `pixelsPerSquare`, and mapping `kind: "door"` → `door: 1`.
3. Convert every `LightSource` to an `AmbientLight` entry the same way.
4. Bundle these into a **Scene** document skeleton (`{name, grid: {size, type}, walls: [...], lights: [...], background: {img: <exported PNG>}}`) so the whole thing can be imported as one scene, with the rendered deck plan PNG set as the scene background image and the walls/doors/lights aligned on top of it.
5. Output as a `.json` the user can import via Foundry's scene import, or — cleaner — package as a **module-style compendium** if this becomes a recurring workflow (worth deferring until the basic JSON export works).

## 5. Budget tracking

The central UI element: total footprint budget = `hullTons * 2` squares (e.g. 800 squares for a 400-ton hull), broken down per line item as soon as the input sheet is transcribed — e.g. "Staterooms: 0/114 squares placed", "Cargo: 0/402 squares painted." As the user places catalog components or paints zone-fill cells, each line item's counter updates live, so "how much budget remains" is answered per category, not just overall. Placing/painting beyond a line item's own budget should warn rather than silently allow it, since overspending one category while underspending another is exactly the kind of error this tracker exists to catch.

## 6. Hull shape (deferred)

A 400-ton streamlined hull is realistically wedge- or lens-shaped and multi-deck, not a rectangle. For v1, keep each deck a plain rectangular grid (user sets deck count and each deck's width/height in squares) and treat automatic hull silhouette generation as a later stretch goal — it's a materially bigger problem and isn't something the design sequence specifies anyway.

## 7. Build order (milestones for Claude Code sessions)

1. Grid renderer + pan/zoom, no components yet — prove the square grid draws correctly at a chosen pixels-per-square.
2. Input sheet form + `sheetToBudget.js` — transcribe the Subsidised Merchant sheet and confirm the per-line square budgets come out right (800 total squares; 19 staterooms → 114 squares of room footprint + 38 squares fed into the common-area pool in `splitCommonArea` mode, which combines with the sheet's own separately-listed Common Areas line — 5.5 tons / 11 squares — for a combined common-area budget of 49 squares).
3. Component palette + drag/place/snap/collision (catalog mode) on one deck.
4. Zone-fill paint tool (Cargo, Fuel Tanks) with budget enforcement.
5. Multi-deck support (tabs) + the live budget panel across all line items.
6. PNG/SVG export.
7. Wall/door drawing tool on top of the grid.
8. Light placement tool.
9. Foundry scene JSON export, tested against an actual Foundry import.

Steps 1–6 get you a usable standalone designer even before touching Foundry at all — worth treating as a v1 checkpoint on its own, since it's already useful for planning the Drinax campaign's ships.

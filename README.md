# Traveller Deck Plan Designer

A local, browser-based tool for building rules-accurate Mongoose Traveller 2e starship deck plans, and eventually exporting them straight into a Foundry VTT scene (walls, doors, lighting).

See [DeckDesigner.md](DeckDesigner.md) for the full architecture: rules constants, data model, and the build order below.

## Status

Build order, from `DeckDesigner.md` section 7:

- [x] 1. Grid renderer + pan/zoom
- [x] 2. Input sheet form + tons-to-squares budget math
- [x] 3. Component palette + drag/place/snap/collision (catalog mode)
- [ ] 4. Zone-fill paint tool (Cargo, Fuel Tanks) with budget enforcement
- [ ] 5. Multi-deck support (tabs) + live budget panel
- [ ] 6. PNG/SVG export
- [ ] 7. Wall/door drawing tool
- [ ] 8. Light placement tool
- [ ] 9. Foundry scene JSON export

## Tech

Plain ES modules, no build step, no dependencies — `<script type="module">` loaded directly by `index.html`.

## Running it

ES module imports are blocked by the browser under a `file://` URL (CORS), so `index.html` needs to be served over `http://localhost`, not opened by double-click.

Easiest option — VS Code's **Live Server** extension:

1. Open this folder in VS Code.
2. Right-click `index.html` → **Open with Live Server**.

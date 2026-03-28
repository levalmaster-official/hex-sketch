# HexSketch — Chemistry Drawing for Obsidian

HexSketch is a full-featured, interactive chemistry drawing plugin for [Obsidian](https://obsidian.md). Create displayed formulas, skeletal structures, and 3D perspective drawings directly inside your notes — all saved as lightweight `.chem` files and embeddable anywhere.

---

## Table of Contents

1. [Installation](#installation)
2. [Getting Started](#getting-started)
3. [Drawing Modes](#drawing-modes)
   - [Displayed Mode](#displayed-mode)
   - [Skeletal Mode](#skeletal-mode)
   - [3D Mode](#3d-mode)
4. [Embedding Drawings](#embedding-drawings)
5. [Common Tools Reference](#common-tools-reference)
6. [Exporting](#exporting)
7. [Tips & Tricks](#tips--tricks)
8. [Development](#development)

---

## Installation

1. Download or clone this repository into your vault's `.obsidian/plugins/` folder.
2. Run `npm install` then `npm run build` inside the plugin directory.
3. Enable **HexSketch** in Obsidian → Settings → Community Plugins.

---

## Getting Started

### Creating a new drawing

Open the Command Palette (`Ctrl+P` / `Cmd+P`) and run:

> **HexSketch: Create new chemistry drawing**

This opens a new `.chem` file in the HexSketch canvas editor. You can also click the hexagon icon in the left ribbon to open the sidebar panel.

### Saving

Drawings auto-save as you work. No manual save needed. The `.chem` file is plain JSON containing your elements, bonds, and annotations, and can be stored anywhere in your vault.

---

## Drawing Modes

Each `.chem` file is locked to a single drawing mode once you make your first change. This prevents data corruption from switching between incompatible coordinate systems. A blank file can be freely switched between modes.

The mode buttons (Displayed / Skeletal / 3D) in the toolbar are **greyed out** for non-active modes once you start drawing.

---

### Displayed Mode

Best for: **fully explicit structural formulas**, teaching diagrams, reaction mechanisms.

The canvas snaps to a **square grid** (20 px). Every atom and bond is drawn explicitly. Elements are connected by clicking and dragging from one to another, or by placing elements with the Element tool and connecting them with a bond tool.

#### Tools

| Tool | How to use |
|---|---|
| **Select** | Click elements/bonds to select. Shift-click to multi-select. Drag to box-select. |
| **Pan** | Drag canvas to navigate. Middle-click also pans. |
| **Element** | Type a symbol (C, O, N...) in the text box, then click the canvas to place it at a grid point. |
| **Group** | Like Element, but with alignment. Choose **Bind Left (OH)** / **Center** / **Bind Right (HO)** so bonds attach to the correct atom in multi-atom groups. |
| **Text** | Place a free-floating text label on canvas. Tap a placed label while it is Selected to edit it inline. |
| **Single / Double / Triple / Dotted** | Drag from one element to another to draw that bond type. |
| **Curly Arrow** | Drag to draw a curved arrow (for mechanisms). After placing, select the arrow to drag its endpoints and control point to adjust curvature. |
| **+ / − / δ+ / δ−** | Click to place a charge annotation. |
| **: / ..** | Place a lone pair (vertical or horizontal orientation). |
| **Benzene** | Place a delocalized benzene ring (hexagon + inner circle). |
| **[ / ]** | Place independent bracket symbols. Drag them to enclose any part of a structure — useful for polymer repeating units, transition states, etc. |
| **→ / ⇌ / + (React)** | Reaction arrows and "+" for multi-component reactions. |

#### Workflow example — drawing ethanol (CH₃CH₂OH)

1. Select **Element**, type `C`, click canvas → place first carbon.
2. Click again to place a second carbon.
3. Select **Single**, drag C→C to bond them.
4. Select **Group**, type `OH`, alignment **Bind Right (HO)**, click on the second carbon.

---

### Skeletal Mode

Best for: **skeletal (line-angle) structures**, complex carbon skeletons, large organic molecules drawn at speed.

The canvas shows an **isometric dot grid** where every visible dot is a valid bond vertex at standard 60° bond angles.

> **Key concept:** There are no explicit "vertex" objects. You draw bonds, and atoms are implied at each bond endpoint (as in real skeletal notation). Heteroatoms are placed directly on top of vertices.

#### Drawing a chain

1. Select the **Chain** tool.
2. Click anywhere on the grid to place the first vertex. A dashed preview line follows your cursor.
3. Click again to draw the first bond and continue. Each click extends the chain by one bond.
4. Click near an existing bond endpoint (within ~25 px) to automatically snap and continue from that point, allowing branching.
5. Press **Escape** or switch tools to stop the current chain.

#### Modifying bond order

After drawing a chain, you can upgrade any bond in place:

| Tool | Action |
|---|---|
| **Double** | Click an existing single bond → adds a shorter parallel line to one side (classic Kekulé style). |
| **Triple** | Click an existing bond → adds two shorter parallel lines on each side. |
| **Dotted** | Click a bond → makes it dashed (for partial bonds, hydrogen bonds, etc.). |
| **Chain** | Click an existing bond → converts it back to single. |

#### Heteroatoms

1. Select **Heteroatom**, type your label (O, N, Cl, OH, NH₂, etc.).
2. Choose alignment: **Centered**, **Bind Left (OH)**, or **Bind Right (HO)**.
3. Click anywhere on the canvas to place the label. Position it directly over a chain endpoint — the atom label renders on top, erasing the bond line behind it cleanly.

#### Other Skeletal tools

| Tool | Description |
|---|---|
| **Benzene** | Drops a full delocalized benzene ring (hexagon + circle). Drag to position. |
| **Curly Arrow** | Draw mechanistic curly arrows, identical to Displayed mode. |
| **[ / ]** | Independent bracket symbols that can be placed and resized freely. |
| **→ / ⇌ / + (React)** | Reaction arrows and separators. |
| **Charges** | +, −, δ+, δ− annotation dots. |

---

### 3D Mode

Best for: **stereochemical diagrams**, wedge-dash notation, Fischer projections with mirror planes.

The canvas is **free-placement** — no grid, no snapping. Place elements anywhere for maximum compositional freedom.

#### Placing elements

1. Select **Element** (or **Group** for aligned groups like OH/HO).
2. Type the label in the text box (C, CH₃, COOH, H, etc.).
3. Click anywhere on the canvas to place it.

#### Drawing bonds

Select a bond tool. Click an element to set the **start** (a blue dashed ring appears). Then:
- Click **another element** to draw the bond between them.
- Click **empty space** to create a new element at that position and connect it in one step.
- The start automatically advances to the last connected atom, so you can draw a chain rapidly with repeated clicks.

| Bond | Appearance | Meaning |
|---|---|---|
| **Single** | Straight line | Bond in the plane of the page |
| **Double** | Two parallel lines | Double bond in the plane |
| **Triple** | Three parallel lines | Triple bond |
| **▲ Wedge** | Solid filled triangle (narrow at source, wide at destination) | Bond coming **toward** the viewer |
| **▽ Dash** | Series of parallel lines widening from source to destination | Bond going **away** from the viewer |
| **Dotted** | Dashed line | Partial bond, hydrogen bond, or non-covalent interaction |

#### Mirror / Symmetry line

1. Select **⟊ Mirror**.
2. Click and drag across the canvas to draw a dashed mirror-plane line.
3. After placing, select it to drag its two endpoints for precise repositioning.

#### Charges

Use +, −, δ+, δ− from the toolbar to annotate atoms with charge symbols. Click to place anywhere.

---

## Embedding Drawings

Any `.chem` file can be embedded as a live, read-only preview in any Obsidian note using a `chem` code block.

### Basic embed (file reference on first line)

Both notations are equivalent:

````markdown
```chem
file: MyMolecule.chem
```
````

````markdown
```chem
[[MyMolecule.chem]]
```
````

### Embed with custom size

Add `width` and/or `height` on lines after the file reference:

````markdown
```chem
[[MyMolecule.chem]]
width: 50%
height: 200px
```
````

| Property | Accepted values | Default |
|---|---|---|
| `width` | `px` value (`300px`) or percentage (`50%`) | `100%` |
| `height` | `px` value (`200px`) or `auto` | `auto` (preserves aspect ratio) |

### Via Command Palette

Run **HexSketch: Embed chemistry drawing** from the Command Palette. A file picker appears; select a `.chem` file and it will be inserted at your cursor with the default embed syntax.

---

## Common Tools Reference

| Action | Shortcut / Method |
|---|---|
| Undo | **Undo** button in toolbar |
| Delete selected | `Delete` or `Backspace` key, or **Delete** button |
| Pan canvas | Middle-click drag, or select **Pan** tool and drag |
| Zoom | `Ctrl+Scroll` / `Cmd+Scroll` |
| Multi-select | `Shift+Click` elements, or drag a selection box with **Select** tool |
| Cancel current action | `Escape` |
| Edit a placed label | Select it (it highlights red), then type in the text box in the toolbar |
| Change color | Use the color picker and swatches in the toolbar. Selecting an element then changing color recolors it immediately. |

---

## Exporting

Open the Command Palette and run:

> **HexSketch: Export Chemistry Drawing to SVG/PNG**

A dialog appears where you can:
1. Choose which `.chem` file to export.
2. Select the output format: **SVG** (vector, scalable) or **PNG** (raster, 2×).
3. Save the file via your browser's download dialog.

Exports are color-sanitized for maximum contrast — bonds and arrows are guaranteed to be visible regardless of your Obsidian theme.

---

## Tips & Tricks

- **Mode locking is intentional.** Once a file has content, its mode is fixed. To use a different mode, create a new `.chem` file.
- **Resize elements.** Select an element, then drag the small blue square in its bottom-right corner to scale it up or down.
- **Recolor selectively.** Select only the bonds or atoms you want to recolor, then pick a color from the toolbar. Useful for highlighting reaction centres.
- **Curly arrow curvature.** After drawing a curly arrow, select it and drag the blue midpoint handle to adjust the curve. Drag the green endpoint handles to reposition start/end.
- **Polymer brackets.** The `[` and `]` brackets are independent objects. Place them around any repeating unit and resize/drag each one separately for precise alignment.
- **Isometric grid (Skeletal).** The dots on the grid represent exactly where bonds can start and end. Each dot = one valid snap point. Use this to plan your skeleton before drawing.

---

## Development

```bash
# Install dependencies
npm install

# Development build with watch mode
npm run dev

# Production build
npm run build
```

Built with **React** + **SVG** rendering. No external chemistry libraries — all structure drawing is custom-built.

**Stack:**
- Obsidian Plugin API
- React 18 (via esbuild bundling)
- SVG for all drawing primitives
- TypeScript

---

## License

MIT © 2024 HexSketch Contributors

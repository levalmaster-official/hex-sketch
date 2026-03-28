# HexSketch - Obsidian Chemistry Plugin

HexSketch is a powerful, interactive chemistry drawing tool built specifically for Obsidian. It allows you to create, edit, and embed high-quality chemical structures (displayed formulas, skeletal structures, and more) directly within your notes.

## Features

### 1. Multi-Mode Drawing Canvas
Switch between different drawing philosophies depending on your needs:
- **Displayed Mode**: Shows every atom and bond explicitly. Perfect for simple organic molecules and educational diagrams. Matches standard 90°/orthogonal grids.
- **Skeletal Mode**: High-speed, professional skeletal drawing.
    - **Isometric Snap Grid**: Automatically align bonds to 30°/60°/120° angles.
    - **Continuous Chain Drawing**: Click repeatedly on the canvas to rapidly build alkanes and complex carbon skeletons (ChemDraw style).
    - **Smart Heteroatoms**: Easily add O, N, Cl, or custom groups with intelligent bond clipping.

### 2. Advanced Chemical Tools
- **Bonds**: Single, Double, Triple, and Dotted bonds.
- **Mechanism Tools**: Dynamic Curly Arrows with adjustable start/end points and curvature.
- **Annotations**: 
    - Full support for formal charges (+, -) and partial charges (δ+, δ-).
    - Electron lone pairs (vertical and horizontal).
    - Delocalized Benzene rings.
    - **Separate Polymer Brackets**: Modular `[` and `]` brackets that can be placed and resized independently to enclose any object.
- **Text Tool**: Add arbitrary labels and notes using the same cohesive font as chemical elements.

### 3. Deep Obsidian Integration
- **Live Embeds**: Drawings are saved as `.chem` files and can be embedded in any markdown note using the `chem` code block:
  
  ```chem
  file: CCC.chem
  ```

- **Dynamic Resizing**: You can specify the size and aspect ratio directly in the code block. `width` can use `%` or `px`, and `height` can use `px` or `auto`.

  ```chem
  [[test.chem]]
  width: 50%
  height: 200px
  ```

- **High-Quality Export**: Export your drawings as SVG or PNG directly from the command palette. Exports are sanitized for high contrast, ensuring bonds and arrows are perfectly visible on any background.

## Documentation

### Drawing a Continuous Chain (Skeletal Mode)
1. Select the **Single Bond** tool.
2. Click anywhere on the canvas to place the first vertex.
3. Click another location on the grid to instantly create the next vertex and the connecting bond.
4. Continue clicking to grow the chain. To branch, simply click an existing vertex once to "select" it as the new start point, then click away to create the branch.

### Adding Heteroatoms and Groups
- Select the **Heteroatom** tool and type your element (e.g., `OH`).
- Clicking near an existing bond or vertex will snap the group into place.
- Use the **Bind Left (OH)** or **Bind Right (HO)** options in the toolbar to ensure bonds attach to the correct atom in a group.

### Resizing Embeds
To change the size of a drawing on a page, use the following syntax in your markdown file:
- `![[my_drawing.chem|300]]` (Sets width to 300px, preserves aspect ratio)
- `![[my_drawing.chem|300x200]]` (Sets width to 300px and height to 200px)

## Development
This plugin is built with React and SVG.
- `npm run dev`: Start development build
- `npm run build`: Production build and minification

## License
MIT

# DetailPlus
**The Fallen King — visual asset and material pipeline**  
Status: researched architecture and implementation specification. **Not yet installed or deployed in the game.**  
Research date: 2026-11-11. Version: research 1.

## Why previous detail passes failed

The current game renders geometry in `fallen-king.js` with `box()`, `cylinder()`, `cone()`, `sphere()`, and arrays of positional vertices. `fallen-king-story.js` adds hundreds of random small boxes through `drawMicroDetail()`. That increases visual noise without adding recognizable shape or materially correct surfaces. Existing gameplay should remain original 2.5D WebGL: do not replace the engine or make another minigame.

Concrete defects established from the current source:

- The **custom scene** path in `draw()` still loops through every tile calling `ground(x,z)`. The fallback color for `H` and unknown floor tiles is the green `#83ad70` in `ground()`; the sewer's `w` uses a village water branch with shore grass and lily pads. These do not belong in a prison or sewer. `'s'` also uses the generic village cobblestone palette.
- The crown is separately approximated in multiple intro beats: the crown on the pedestal and the one Edwin carries/wears differ in form, color and gemstones.
- Current 2.5D camera and chess-piece renderer use vertex colors only; there is **no UV/texture pipeline** or glTF model importer. Simply putting a `.glb` file in the repository will not render it.
- Shared custom-scene props and dynamic effects must receive all primitives they invoke; prior missing `cone` caused the blank green screen. Automated tests must exercise a real frame.

## The solution: DetailPlus

> **Use a curated and generated reusable mesh asset library, UV materials and baked detail; render it using a small *additional* model/material path inside the existing WebGL engine. Stop creating visual richness by scattering unrelated boxes.**

The GPU still ultimately draws triangles, but those triangles now represent recognizable silhouettes made by actual modeling tools, with correct textures and shadows. The AI does *not* assemble objects exclusively by source-code primitives.

### Sources of assets in order of preference

1. **Curated licensed 3D meshes**: start with Kenney's CC0 *Modular Dungeon Kit* (40 modular dungeon pieces), *Retro Medieval Kit* (PS1/retro style, 3D meshes with low-resolution textures), *Castle Kit* and *Fantasy Town Kit*. Recolor and scale inside Blender to match the game. These are real existing assets, not invented rectangles.
2. **Materials**: Kenney's CC0 *Retro Textures Fantasy* for the nostalgic style; ambientCG CC0 materials and Poly Haven CC0 textures for carefully selected stone, old wood, tarnished metal, wet surfaces. Repaint/downsample to the SAME limited palette before export; do not drop photoreal textures into otherwise stylized scenery.
3. **Unique bespoke hero meshes**: model crown, toilet, lever mechanisms and iconic chess-person accessories in Blender by script plus bevel/sculpt/material work. Use the existing chess-character silhouette as the scale and design reference.
4. **AI image-to-3D as controlled supplement**: an image reference may be transformed into a PBR mesh by TRELLIS.2, then cleaned and optimized in Blender. It is not guaranteed production-ready. Upstream is MIT but dependencies/hosted services can have different licenses; verify each full chain. TRELLIS.2 upstream lists Linux + NVIDIA GPU ≥24 GB. Do not use Hunyuan3D 2.1 under its standard community license for EU deployment: its territorial grant explicitly excludes the EU.

### Production pipeline

`approved reference → candidate 3D mesh (.blend/.glb) → human/AI-assisted mesh cleanup (bevels, correct shape, UVs, topology, pivot, scale) → stylized texture atlas → bake ambient occlusion and selected highlights → export .glb → glTF Validator → gltfpack/glTF Transform optimisation → original WebGL asset loader → in-game 2.5D screenshot and interaction QA`

**Game asset format**: glTF 2.0/GLB, with explicit position, vertex normals, UV, baseColor texture and material assignment. Bake heavy lighting detail into materials because the custom WebGL1 engine doesn't implement Unity/Unreal lighting. Keep low resolution deliberately (initial proposal: 256–512 px/asset, shared 1024 px atlases where useful), but preserve clear high-contrast readable silhouettes. These are design targets, not benchmark results.

**Minimum code changes**:
- `fallen-king.js`: add a scene-aware `groundTheme(x,z,scene)` or route existing `ground()` through scene-specific palettes; keep village grass logic ONLY outdoors; never draw lily pads/seaside grass in sewer; add a textured mesh draw path (positions, normals, UV, material) alongside the existing vertex-color draw path; reuse GPU buffers and bind textures; cache imported GLB models; keep WebGL1 compatibility as target.
- `fallen-king-story.js`: disable or retire `drawMicroDetail` after assets replace it; declarative prop placement based on scene; preserve existing quests, paths, character controls and puzzles. Put all crown appearances behind a *single* named prefab.
- `assets/detailplus/`: curated source attribution manifest (file name, origin URL, author, CC0/license and revision), `palace/`, `prison/`, `sewer/`, `village/`, `common/`; offline modeling/export scripts and material atlases.
- Tests: asset validator, material/texture loads, shader errors, scene tile floors, geometry/UV sanity, and screenshots for same fixed views.

### First proof-of-concept scene: prison

Remove random micro-detail noise. Rebuild with:
- One readable stone-floor material with darker edges, integrated mortar and subtle cracks: **ZERO green grass, ZERO village flowers**.
- A single **recognizable** barred door prefab at the corridor side, stone arch and neighboring visible cells.
- Bed prefab with a mattress, pillow, wood posts, visible silhouette.
- Aged toilet prefab with ceramic bowl, lid, visible drain/lever interaction. No opaque block in its place.
- Light placement: cool diffuse window, warm torch, subdued floor contact shadows (baked AO/decals).
- Interact prompts stay bound to actual `E` press, never proximity auto-trigger.
- Distinguishable silhouettes at normal gameplay zoom, and readable top-down camera composition.

### Second proof-of-concept asset: the crown

ONE `crown_aldemar.glb`: a consistent gold circlet with red velvet cap and red gemstone, beveled gold points, with a single immutable material set. Three transformations/attachments are allowed: `pedestal`, `Edwin-hand`, `Edwin-head`. It is **never regenerated**, recolored, or reconstructed with a separate collection of cones for each shot. Assert the same mesh ID and material ID across all intro scenes.

### Sewer visual separation

Use a different stone/brick material family, proper elevated walkway, flowing dark canal, culvert arches and iron sluice wheels. No village lilies, flowers, grass or stone-cottage props. Wet streaks and algae should be baked textures/decals on surfaces, not floating rectangular protrusions. Keep key interactables larger/more distinct than background detail.

### Test gate (do not claim visually finished until all pass)

1. Render all 10 intro beats and playable prison, sewer, Willowmere in the real browser, collect consistent screenshots; inspect images for artifacts and missing objects.
2. Automated scene material test: every prison floor tile has a prison material; no call to village ground decorations for intro/cell/sewer.
3. Crown model is identical across pedestal, theft and throne shots; the red/gold accents remain unchanged.
4. Test bed, window, barred gate, toilet and sewer wheel recognition at normal zoom; avoid random geometric clutter covering silhouettes.
5. Complete intro → toilet (E) → sewers (E gates) → bishop (E) → Pip → bridge; confirm admin-only world API unchanged.
6. Validate each GLB and license; monitor shader errors, draw calls, texture memory and frame time in desktop and mobile browsers.
7. Restrict initial deploy to one production-ready test scene before migrating every location.

### References verified

- glTF 2.0 specification: https://registry.khronos.org/glTF/
- Three.js glTFLoader (reference implementation; NOT a requirement to replace the original engine): https://threejs.org/docs/pages/GLTFLoader.html
- Blender texture and AO baking: https://docs.blender.org/manual/en/latest/render/cycles/baking.html
- glTF Validator: https://github.khronos.org/glTF-Validator
- glTF Transform optimisation: https://gltf-transform.dev/
- gltfpack mesh optimisation: https://meshoptimizer.org/gltf/
- Kenney Modular Dungeon Kit: https://kenney.nl/assets/modular-dungeon-kit
- Kenney Retro Medieval Kit: https://kenney.nl/assets/retro-medieval-kit
- Kenney Retro Textures Fantasy: https://kenney.nl/assets/retro-textures-fantasy
- Kenney Castle Kit: https://kenney.nl/assets/castle-kit
- Kenney asset license: https://kenney.nl/support
- ambientCG CC0 license: https://docs.ambientcg.com/license/
- Poly Haven CC0 license: https://polyhaven.com/license
- Microsoft TRELLIS.2: https://github.com/microsoft/TRELLIS.2
- Hunyuan3D 2.1 license regional limit: https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1/blob/main/LICENSE
- Mozilla MDN WebGL best practices: https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices

**Status distinction**: This file records a researched implementable design; models have NOT been imported or visually tested in the game by this research commit.

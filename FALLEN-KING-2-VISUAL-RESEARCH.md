# The Fallen King 2.0 — visual direction research and technical correction
**Researched:** 2026-11-19. **Status:** Implementation reference; it is not evidence that the current build already reaches the target fidelity.

## Non-negotiable creative brief
Use only The Fallen King's established narrative beats, characters, geography and quest progression: King Oliver, Edwin's coup, five illustrated opening panels, the prison with a toilet and sleeping prisoners beyond the bars, the sewer escape, the forest, the watchtower and Willowmere. The five existing opening PNGs in `assets/fallen-king-intro/intro-1.png` to `intro-5.png` are approved and preserved. **Do not reuse the existing Fallen King chess-piece visual art direction or make new characters look like chess pieces.** The rest of the game must have independently authored cinematic, readable, human-scale 3D art with authored props. Never claim to have recreated Firewatch, Radiolight or Killer Frequency assets, and do not copy their proprietary files.

## What the real developers actually did

### Firewatch — environment art, not an edge-filter
Jane Ng's GDC presentation and interviews describe Olly Moss's flat, graphic park-poster compositions being translated into a playable forest. Their production prioritized striking silhouettes, hand-authored trees, deliberately managed sky/lighting and distance-dependent *color fog* that makes distant trees flatten into evocative layered shapes. Firewatch was made with Unity; Ng reports proprietary color-fog and procedural-sky tools alongside Amplify Color and Marmoset Skyshop, Maya, Photoshop, ZBrush and Quixel/NDO. She says trees and foliage were among the hardest problems; a long iteration cycle was necessary. Around 23 individually modeled unique trees were reused across the forest; fidelity comes from **good base assets, composition, light and atmospheric depth**, not a random forest of identical primitives. Moss/Ng also placed visual cues deliberately to lead the player toward important spaces. The visual language stays coherent across a color script of time-of-day moods.

Sources:
- GDC talk: https://www.gdcvault.com/play/1023708/The-Art-of
- GDC environment talk: https://www.gdcvault.com/play/1022923/Making-the-World-of
- Jane Ng interview, original tools: https://mcvuk.com/development-news/the-art-and-soul-of-visual-design/
- Unique trees: https://www.gamedeveloper.com/design/environmental-artist-jane-ng-only-made-23-unique-trees-for-i-firewatch-i-
- Player guidance: https://www.newyorker.com/tech/annals-of-technology/with-firewatch-olly-moss-brings-his-subversive-touch-to-video-games

### Radiolight — Unreal-engine spatial realism and mood
Developer Krystof Knesl states in his own developer diary that he switched from Unity to Unreal Engine to pursue more immersive 3D, using Unreal visual scripting as part of his workflow. Radiolight deliberately began as a Firewatch-inspired game, evolving toward an unsettling supernatural investigation involving a radio. The screenshots the user supplied show a *coherent authored bedroom/studio*, with layered blinds, window depth, pillows, printed wall art, desk objects, patterned bedding, radio controls, people, atmospheric external light and non-uniform shadow. The game reads as finished not because of high pixel density alone but because **every recognizable object is an actual modeled object with materials, dimensions and careful local lighting**. The goal is similar visual density in an original medieval prison, not copying the 1980s furnishings.

Sources:
- Developer interview: https://www.gamedevjourney.co.uk/home/developer-diaries/unreal-diaries/radiolight
- Developer/publisher overview: https://www.iceberg-games.com/games/radiolight/

### Killer Frequency — props and environmental storytelling
Killer Frequency's radio-station environments were art-directed and constructed as authored sets with myriad contextual props, period signage, and room lighting, not procedurally repeated boxes. Art lead Ben Watts describes a multi-artist production process and provides galleries spanning the studio, office, basement, hallways and specific puzzle areas. Its visual payoff depends on authored local scenes and readable interactive objects. Voice, radio and sound design likewise carry substantial narrative weight, but the user is primarily asking for visual geometry at this stage.

Sources:
- Art-lead environment breakdown: https://benjaminwatts.artstation.com/projects/LRRRZw
- Additional environment artist portfolio: https://www.artstation.com/artwork/5vWPYW
- Official game: https://store.steampowered.com/app/1903620/Killer_Frequency/

## Honest audit of the current The Fallen King 2.0 build
The standalone `crownless-road.js` draws almost everything into a single manually constructed `Float32Array`: block tile walls, code-generated roofs, geometric tree meshes and procedurally assembled NPCs. There are no production-quality, UV-textured environment models, a proper glTF asset pipeline, lightmaps, animation rigs or meaningful environmental art assets in this game. Increasing the canvas devicePixelRatio merely raises pixel count; adding random noise, procedural spheres, extra cones or custom fog to these crude assets **cannot** produce Radiolight/Firewatch-quality scenes. Thus the user's criticism that the look is fundamentally unchanged is technically justified. The established narrative logic, admin-only access, movement and current quest triggers can be preserved, but **the renderer and content pipeline must change**.

Do not call another simple shader/shape pass a Firewatch-quality redesign. A visually compelling scene requires production assets, visual composition, authored material variation and human verification from actual screenshots.

## Recommended browser-native rearchitecture (no install for the player)
Replace the custom renderer gradually with a vendored, tested version of **Three.js WebGLRenderer** or Babylon.js, preserving the existing server-side admin gate `/api/fallen-king/world`. Both run in the web browser with no user software installation. Three.js has the official `GLTFLoader` pipeline for glTF 2.0 meshes, skeletal animations and PBR materials: https://threejs.org/docs/pages/GLTFLoader.html . Vendor reviewed build artifacts into this repo, do not depend on a mutable CDN. Add authored `.glb` models to `assets/fallen-king-2/` with recorded source and redistributable licenses. Procedural modeling remains appropriate only for non-critical terrain variation, scatter and inexpensive distant scenery.

Create one polished, self-contained **visual vertical slice of the prison** before migrating all levels: one richly modeled cell with rounded masonry, inset mortar and worn roughness; an actually modeled porcelain toilet with grate; a bed, cloth, iron bars and two readable neighboring cells; one believable sleeping human and a guard visible through the bars; warm torch/window lighting plus cold fill, shadow maps, local haze, intentional depth of field only in non-interactive scenes, natural movement and collisions matching prop shapes. Keep original five illustrated opening screens. The player should be able to walk around and inspect close-up objects and screenshots should convincingly exceed the existing build before expanding to sewers and forest.

Then rebuild the sewers using authored wet masonry, grime/roughness/normal maps, shallow water, real vaults, grates, ladders and cinematic light shafts. Build a woodland kit of authored pine trunks/canopies, rocks, shrubs, logs, winding ground, distant terrain and properly authored color fog. Build Willowmere with pitched roofs, door and window recesses, fabrics, barrels, merchants and street clutter. Each environment must use distinctive, curated props instead of repetitive procedural cubes. Real rigged human models and animations are a separate content task and must be sourced/generated with a clear license.

Render at native pixel density with adaptive quality; enable antialiasing, tone mapping, color-space management, shadow maps and deterministic weather/time presets. Use glTF/GLB materials with roughness and normal maps; cluster/instance static objects where appropriate; profile on real devices. Collision geometry must be authored or derived from mesh bounds, keeping interaction triggers unobstructed. Save and story state remain independent of the old Fallen King.

**Quality gate:** evaluate side-by-side captures in the playable browser, at eye height and a fixed FOV, against the supplied Radiolight screenshots and developer-approved Firewatch reference *for lighting, silhouette, prop density, atmospheric depth and human proportions* — not for copying game identity. Only advance when the prison slice looks meaningfully different from the procedural prototype. Maintain desktop 60fps targets where practical, but do not trade readable assets for polygon blobs. Test scene transitions, pointer lock, Space jump, Ctrl crouch, Shift sprint, Esc pause, Q not rotating and admin teleports with server-side access controls.

## Admin quality-of-life changes already completed
- Teleport panel restored in `crownless-road.html` with all five currently implemented game areas and five useful waypoints.
- Removed Q rotation from `crownless-road.js` while preserving mouse look; Q is no longer bound to turning the camera.
- Admin-only scene controls remain protected by the existing server role gate. No claim is made that chapter-two areas absent from this separate game already exist.

## Intellectual-property and production principles
We can take high-level inspiration from hand-painted lighting, depth layers, environmental storytelling and dense props. We must **not** reproduce Firewatch's proprietary 3D models, code, textures, specific compositions, music, voice performances or brand. For new high-quality model assets, prefer wholly original creation or appropriately licensed assets, tracking provenance in the repository.

This document is a research-backed engineering and art-production specification, not a promise that a new engine, commercial-quality assets or visual QA have already been delivered.

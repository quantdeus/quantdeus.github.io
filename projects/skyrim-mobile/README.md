# Skyrim-inspired Mobile RPG — WebGL 2 vertical slice

A **new original fantasy RPG prototype** (not Bethesda's Skyrim or its assets). Work lives in the isolated feature branch; no root production site files are modified.

## Run
```bash
cd projects/skyrim-mobile
npm install
npm test
npm run content:check
npm run build
npm run dev -- --host 0.0.0.0
```
Open the Vite URL in Android Chrome (WebGL 2), or on a desktop. WASD/arrow keys move; drag the view to turn; **E** interacts, **Space** jumps, **F** attacks. Mobile has a left movement pad, right look pad and action buttons.

## Actual state
- Babylon.js scene generated locally: valley terrain, foliage, cabins, mist, sunlight, NPC, ruins, enemy, object interaction.
- Deterministic quest graph + inventory, basic combat, autosave and restore.
- 500,000,000-byte **maximum release budget** specified per content pack; **no fake 500 MB output**. Procedural demo contains no large production asset library yet.
- Stage 1 prototype only. No claim of photorealism, production Android APK, GPU QA or 500 MB of actual content.

## Architecture and agent lanes
`src/state.mjs` is the deterministic testable simulation; `src/main.ts` is the Babylon/WebGL UI runtime; `src/pack-loader.mjs` verifies optional content integrity; `scripts/content-check.mjs` enforces release budgets. The display renderer must never own save state.

**Seven of Nine:** task triage / stop duplicate work.
**Code agent:** engine & graphics.
**Content agent:** original licensed PBR / GLB / KTX2 assets.
**QA triad:** unit tests, renderer smoke, Android 30/45-minute thermal tests.
**Claude via Composio:** review lane only when an authenticated invocation is available; never pretend review happened.

## Acceptance gates
1. Gate 1: runnable Android WebGL 2 scene; input, save, no context errors, reproducible builds; device checks pending.
2. Gate 2: streaming cell graph, NPC schedule, dialogue, completed quest, content library, profiling; pending.
3. Gate 3: signed Kotlin APK launcher, hash-verified independently downloadable packs, offline, performance and licensing evidence; pending.

Source plan: `Skyrim_Android_WebGL_3_stages.md` (CEO-provided 2026-10-10). Copy held in the branch under `docs/`.

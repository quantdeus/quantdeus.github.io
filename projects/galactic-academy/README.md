# QuantDeus Galactic Academy 🚀

**Staged bootstrap; DO NOT merge into existing website main.** A **dedicated repo** `quantdeus/quantdeus-galactic-academy` is requested in issue #577, but still needs provisioning.

Godot 4.3+ first slice: 2D galaxy map, basic 3D system, astronomy learning quest, dual-channel audio. Long-term goal: sandbox/educational MMORPG with original cosmic Frutiger Aero × fantasy aesthetics.

Foreground music: original music created via Suno after checking commercial rights. User-provided V17-like audio: independent low-volume stream, transparent, **optional/off by default**, never silently embedded in ads or presented as a verified cure. Do not upload private V17 recordings. No copyrighted music/assets from existing games.

Roadmap: (1) local Godot proof of concept, (2) ship controls + quests + save, (3) original soundtrack/art, (4) authoritative multiplayer prototype, (5) opt-in wellness listening research. QA with actual Godot headless startup before release.

Agent routing: `coordinator`/`seven-of-nine` organize; `control-tower`/`guardian` provision repo; `strategist` architects; `tasksmith` engineers; `synthesis` composes original Suno prompts; `potential`/`emh` consent UX; QA triad checks.

Coordination: https://github.com/quantdeus/quantdeus.github.io/issues/577


## Metaverse / AgentChain pilot (2026-10-16)

The first **offline, in-game economy** is implemented on this feature branch:

- Start with **100 demo Credits**. Answer the Mars quiz once to earn **25** more.
- Unlock a **cosmetic Aero ship skin** for 40 Credits (local item, **not** a minted NFT).
- Click **Simulate Data task** for 10 Credits to record a **local-only** agent service request. It does not contact an LLM.
- Local save/reload is supported; no wallet, blockchain, real-money trades, token sale, NFT mint, 10,000-agent processes or production integration.
- Four pilot role names are seeded as a demonstration. **10,000** is a design target for possible registry identities, **not** a count of deployed agents.

**Architecture:** [Metaverse + AgentChain design, economic rules, and rollout stages](docs/METAVERSE_AGENTCHAIN_V1.md)

**Run:** Open `project.godot` in Godot 4.3+ and start the main scene. All code is staged under `projects/galactic-academy/` and must not be merged with the published site without explicit authorization.

**QA:** A feature-branch-only workflow `.github/workflows/galactic-academy-smoke.yml` performs headless import, offline economy tests and main-scene startup checks. To run locally:

```sh
godot --headless --path projects/galactic-academy --editor --quit
godot --headless --path projects/galactic-academy --script res://tests/metaverse_model_test.gd
godot --headless --path projects/galactic-academy --quit-after 10
```

Only mark Godot smoke tests as passing after reviewing the actual workflow result; a code commit alone is not a passed runtime test.

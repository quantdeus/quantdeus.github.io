# QuantDeus ITC Station V1 — digital research prototype

Linked: [Q engineering #574](https://github.com/quantdeus/quantdeus.github.io/issues/574) · [Kryon experimental protocol #575](https://github.com/quantdeus/quantdeus.github.io/issues/575)

## Status and scope
Experimental **synthetic audio** research application, not a verified communication system. No assertion that entities, a Galactic Federation or other external sources generate the output. Do not market the source of generated noise as a detected intelligence.

Features implemented:
- Independent static mobile-friendly research UI \`experiments/itc-v1/index.html\`.
- Seeded deterministic PCM synthesis: white, brown, pulse and sweep.
- 1–1024 *logical* configurable channels, maximum **eight physical synthesized voices** simultaneously in V1.
- WAV export (mono PCM 16-bit 44.1kHz) and JSON with engine parameters, run ID, UTC creation timestamp, SHA-256 of WAV.
- Browser AudioBuffer playback, real-time analyser display, Stop.
- Node native tests with fixed seed, modes, limits and WAV format.

Not implemented yet: AudioWorklet streaming engine, microphone capture, independent ASR, true blind evaluation UI, Q/Kryon live inference from browser, store checkout, background audio playback or any real-world communication verification. Do not claim these are delivered.

## Local run
Use Node 20+ for tests: \`node --test experiments/itc-v1/test.mjs\`.
Serve repository root over localhost HTTPS-equivalent secure context, e.g. \`python3 -m http.server 8765\`, open
\`http://localhost:8765/experiments/itc-v1/\`.
For an Android device use an HTTPS preview with access controls; a plain LAN HTTP origin is not a secure context (SHA-256 export depends on crypto.subtle).

## Privacy and audio
Audio generation and playback occur on the client. No microphone requests, user tracking, background capture, accounts, server uploads or automatic payments. WAV and JSON download only after user action. Start at low listening volume; avoid prolonged loud sound and use Stop to halt playback.

A recording's SHA-256 verifies file identity, **not the origin of any purported message**. Sample rate/seed/mode metadata are required for reproducibility. A browser performance profile and device hardware tests still need to be collected before claiming stable 30-second synthesis on a particular Android phone.

## Architecture
Browser UI -> pure \`generatePCM\` -> bounded Float32Array -> AudioBufferSourceNode + AnalyserNode -> local playback.
\`pcmToWav\` -> local WAV / Web Crypto SHA-256 -> JSON manifest.

Q owns engineering and anomaly experiments; Kryon owns experimental interpretations, blind controls and proposed social/creative activities. Seven coordinates; Data and Tuvok independently validate. Do not pipe arbitrary recordings to public Issues, PRs or external models. All code remains behind PR review; do **not** merge or publish on the production WordPress site without explicit owner approval.

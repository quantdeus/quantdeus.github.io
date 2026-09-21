# QuantDeus Design System — Synthwave × Frutiger Aero

This document encodes the **culture / presentation layer** of QuantDeus. It is an implementation grammar, not scientific evidence and must never be used to imply scientific validation.

## Principles

- **Synthwave** supplies night, depth, neon accents and deliberate futuristic contrast.
- **Frutiger Aero** supplies daylight, water/sky clarity, green life cues, softness and approachable surfaces.
- Scientific and research claims remain evidence-labelled independently of visual treatment.
- Existing UI may adopt these variables incrementally; no full rewrite is required.

## CSS tokens

```css
:root {
  /* typography */
  --qd-font-sans: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --qd-font-mono: "JetBrains Mono", "SFMono-Regular", Consolas, monospace;
  --qd-text-xs: 0.75rem;
  --qd-text-sm: 0.875rem;
  --qd-text-md: 1rem;
  --qd-text-lg: 1.25rem;
  --qd-text-xl: 1.75rem;

  /* spacing */
  --qd-space-1: 0.25rem;
  --qd-space-2: 0.5rem;
  --qd-space-3: 0.75rem;
  --qd-space-4: 1rem;
  --qd-space-6: 1.5rem;
  --qd-space-8: 2rem;
  --qd-space-12: 3rem;

  /* radius */
  --qd-radius-sm: 0.5rem;
  --qd-radius-md: 0.875rem;
  --qd-radius-lg: 1.5rem;
  --qd-radius-pill: 999px;

  /* synthwave / night */
  --qd-night-950: #080b1a;
  --qd-night-900: #10152b;
  --qd-night-800: #182044;
  --qd-neon-cyan: #35e7ff;
  --qd-neon-violet: #9d6cff;
  --qd-neon-pink: #ff5fcf;

  /* Frutiger Aero / daylight */
  --qd-sky-50: #eefbff;
  --qd-sky-200: #bcecff;
  --qd-water-500: #19aee8;
  --qd-water-700: #087ba9;
  --qd-green-400: #58d66b;
  --qd-green-700: #177a39;
  --qd-cloud: #ffffff;

  /* semantic */
  --qd-bg: var(--qd-night-950);
  --qd-surface: var(--qd-night-900);
  --qd-text: #f7f9ff;
  --qd-text-muted: #b7c0d9;
  --qd-accent: var(--qd-neon-cyan);
  --qd-success: var(--qd-green-400);
  --qd-focus-ring: 0 0 0 3px rgba(53, 231, 255, 0.45);
}

[data-qd-theme="aero"] {
  --qd-bg: var(--qd-sky-50);
  --qd-surface: var(--qd-cloud);
  --qd-text: #10243a;
  --qd-text-muted: #40566d;
  --qd-accent: var(--qd-water-700);
  --qd-success: var(--qd-green-700);
  --qd-focus-ring: 0 0 0 3px rgba(8, 123, 169, 0.28);
}
```

## Incremental adoption

A component can adopt the system without changing markup:

```css
.qd-card {
  background: var(--qd-surface);
  color: var(--qd-text);
  border-radius: var(--qd-radius-md);
  padding: var(--qd-space-4);
}

.qd-link,
.qd-button {
  color: var(--qd-accent);
}

.qd-link:focus-visible,
.qd-button:focus-visible {
  outline: none;
  box-shadow: var(--qd-focus-ring);
}
```

## Accessibility gate

1. Normal text must target **WCAG AA 4.5:1** contrast; large text must target at least **3:1**.
2. Neon glow is decoration only: never rely on glow, hue or saturation alone to communicate status.
3. Focus state must remain visibly distinct in both night and Aero themes.
4. Motion must respect `prefers-reduced-motion`; essential information cannot depend on animation.
5. Every semantic status needs text/icon/shape redundancy in addition to colour.

## Evidence boundary

The Synthwave × Frutiger Aero grammar expresses optimism, clarity and a desirable future. It does **not** increase confidence in Warp, energy, health, AI or other scientific claims. Research status must come from provenance, tests and explicit evidence gates, never from visual authority.

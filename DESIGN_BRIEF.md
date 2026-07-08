# VitalLens Redesign: Dark Glassmorphism → Light "Quiet Luxury"

Transform VitalLens's visual identity from its current dark glassmorphism theme into a light, editorial "quiet luxury" aesthetic in the spirit of the Oura Ring website (ouraring.com) — warm, calm, restrained, and confident. This is a **visual-layer-only** redesign: keep the mobile-first structure (480px max width, bottom nav), the routing, the state management, and the PWA architecture exactly as they are. Do not attempt a React migration.

## Strategy: tokens first, everything cascades

Nearly all styling flows from `src/styles/variables.css`. Start there. Rewrite the token file, then clean up the fallout in `base.css`, `components.css`, and `animations.css`. Never hardcode colors in page or component files — everything goes through the CSS variables.

## Color: invert to warm light

**Backgrounds** — warm off-white and beige:
- `--bg-primary: #F5F0E8`
- `--bg-secondary: #FBF8F3`
- `--bg-tertiary: #FFFFFF`

**Text** — dark charcoal, not pure black:
- `--text-primary: #2A2A2A`
- `--text-secondary: #6B6B6B`
- `--text-tertiary: #9A9A9A`
- `--text-inverse: #FFFFFF`

**Accent** — collapse the current seven accents down to **one**: a clean blue `#2E6FF2`, reserved for primary CTAs. Keep a muted, desaturated green and amber strictly for data-viz states. Remove coral and purple entirely.

**Delete** all gradient buttons, gradient surfaces, and glow shadows. None of them survive this redesign.

## Kill the ambient effects

Remove the two radial-glow blobs (`body::before` / `body::after`) in `base.css`. The background should be a flat warm tone — at most, a whisper of a beige-to-pale-blue gradient.

## Shadows: nearly invisible

Replace heavy dark shadows with barely-there ones:
- `--shadow-sm: 0 1px 3px rgba(0,0,0,0.06)`
- `--shadow-md: 0 4px 16px rgba(0,0,0,0.08)`

Let whitespace and hairline borders do the work shadows used to do.

## Typography: serif headlines, calm body

- Keep **Inter** for body and UI text, with generous line-height.
- Replace **Outfit** with an elegant display serif — **Fraunces** or **Playfair Display** — for large headlines. Add it to the Google Fonts `<link>` in `index.html` and point `--font-heading` at it.
- Headlines get larger and lighter in weight. The overall feel: editorial, not app-y.

## Components

- **Buttons** — fully rounded pills. Primary: solid `#2E6FF2` with white text — no gradient, no glow. Secondary: outlined/ghost with charcoal text and a thin border. Update every `.btn*` class in `components.css`.
- **Cards** — solid white, large radius, 1px warm hairline border (`#EDE7DC`), minimal shadow, more internal padding. The rgba glass backgrounds and backdrop blur are gone.
- **Bottom nav** — keep it, restyle it: white/frosted bar, charcoal icons, blue active state (replacing teal).
- **Tags/chips** — uppercase, letter-spaced, subtle beige chip backgrounds.

## Motion

Soften `animations.css`: slow, subtle fades and slides only. Remove bounce/spring easing from decorative elements. Motion should feel unhurried.

## Icons

The SVGs in `src/icons.js` must keep `width="24" height="24"` — this is non-negotiable (they expand to fill the viewport otherwise). Make sure they inherit `currentColor` so they render as charcoal in the new theme.

## Non-negotiable constraint: wellness language

This is a wellness journal, not a medical device. No clinical or alarm-styled UI, no red HIGH/LOW states, no urgency colors. Every score and state color stays calm.

## Process — work in checkpoints

1. **Tokens.** Rewrite `src/styles/variables.css` and present the new token file for approval before touching anything else.
2. **One page, end to end.** Restyle `src/pages/dashboard.js` plus the shared components as a representative proof of the new look.
3. **Roll out.** Once approved, apply the system across `components.css`, the remaining `src/pages/*`, and the React islands in `src/components/*.jsx`.
4. **Verify.** Run `vf` to restart Vite and confirm there are no CSS regressions.

---

# Fix-Ups: De-emoji, De-pill, Glass Text Buttons

Three focused visual passes. Continue to follow the brief above — visual layer only, no architecture/routing/state changes. Work through tokens and shared CSS where possible so changes cascade.

## 1. Remove all emojis

Strip every emoji across the app and replace it with the appropriate SVG from `src/icons.js` (or plain text) wherever one was carrying meaning.

- Search the whole frontend: `src/pages/*`, `src/components/*.jsx`, `src/main.js`, `src/**/*.js`, and `index.html`.
- The favicon in `index.html` is a 🔬 emoji embedded in a `data:image/svg+xml` URI — replace it with a clean line-style SVG favicon that matches the new charcoal/blue palette (no emoji glyph).
- For emojis used as inline labels/bullets/status markers, swap in an `icons.js` icon (keep `width="24" height="24"`, `currentColor`) or remove entirely if decorative.
- Do not leave stray emoji in strings, headings, button labels, toasts, or comments-as-UI. Show me a list of every emoji found and what replaced it.

## 2. De-pill: square-ish corners everywhere

Move away from fully-rounded pill shapes toward crisp rectangles with just a hint of softness.

- In `src/styles/variables.css`, treat `--radius-full` (currently `9999px`) as the thing to eliminate for containers/sections/chips. Introduce a small radius token, e.g. `--radius-xs: 4px`, and dial the scale down so nothing reads as a pill.
- Audit `components.css` for every use of `--radius-full` / `border-radius: 9999px` on sections, cards, chips, tags, inputs, and nav elements and replace with ~4–6px.
- Keep it consistent: all previously pill-shaped sections should land on the same subtle corner radius. Truly circular elements (avatars, icon dots, progress rings) stay circular — only pills/rounded rectangles change.

## 3. "Glass" text buttons for main actions

Restyle select primary/main buttons throughout the app into minimal, liquid-glass-style text buttons: **just the label with a thin underline, no solid fill and no visible box** — the underline is the only chrome.

- The button is the word(s) + a 1px underline beneath the text. No background fill, no border box, no drop shadow. On a light background this reads as a refined text link, not a filled button.
- Give it a faint frosted-glass feel: a very subtle translucent backdrop only on hover/press (e.g. a light `rgba` tint + slight `backdrop-filter: blur()`), the underline thickening or shifting to the blue accent `#2E6FF2` on hover. Keep motion slow and subtle.
- Apply this to the *main* action buttons (primary CTAs — "Explore/Continue/Save" style actions) — add a `.btn-glass` variant in `components.css` and use it for those. Leave secondary/destructive/icon buttons alone unless they clearly fit.
- Ensure adequate tap-target height (min ~44px) despite the button having no box, for mobile usability.

## Fix-Up Process

1. Do the emoji sweep first and report the replacement list.
2. Adjust the radius tokens in `variables.css`, then fix `components.css` usages.
3. Add the `.btn-glass` variant and apply it to the main CTAs.
4. Run `vf` and confirm no CSS regressions; spot-check `src/pages/dashboard.js` visually.

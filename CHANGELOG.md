# Changelog

## 0.1.1 — 2026-07-17

Interaction and first-paint reliability release.

- Replaced the root-only startup color with a guarded, opaque pre-render curtain that remains in place while settings load, native-dark detection runs, and the first visible dynamic pass is completed.
- Added a fail-open reveal timer so a runtime failure cannot leave a page covered indefinitely.
- Added synchronous viewport priming before reveal, including visible form controls and open shadow roots.
- Changed hover, focus, active, keyboard, input, and state-change refreshes from idle work to immediate animation-frame work, with follow-up passes for settled transitions.
- Added transition locking while interactive source colors are sampled, preventing intermediate animation colors from being cached as the final theme.
- Fixed reprocessing so all prior Nocturne overrides are removed before sampling, including gradients, borders, outlines, shadows, SVG colors, accents, and pseudo-element data.
- Added dark fallbacks and stronger override specificity for inputs, textareas, selects, options, buttons, ARIA controls, dialogs, autofill, placeholders, disabled controls, and newly inserted interactive elements.
- Added mapping for visible `::before`, `::after`, and `::backdrop` backgrounds, gradients, text, borders, outlines, and shadows.
- Expanded MutationObserver coverage for common UI-state attributes such as `open`, `disabled`, `checked`, `selected`, ARIA states, `data-state`, and theme/mode attributes.
- Added hostile `!important` interaction cases to the demo page and six regression tests, bringing the automated suite to 31 tests.
- Verified the exact production runtime in Chromium against forced-light hover/focus rules, pseudo-element overlays, ARIA buttons, dynamic content, and first-paint sampling with zero uncovered light frames in the harness run.

## 0.1.0 — 2026-07-17

Initial working release.

- Added Manifest V3, build-free Brave/Chromium extension structure.
- Added perceptual dynamic color mapping with contrast enforcement and semantic color preservation.
- Added flash-of-white bootstrap, viewport-lazy processing, idle budgets, mutation handling, interaction refreshes, all-frame processing, and open shadow-root support.
- Added protection for images, video, canvas, iframes, embeds, and CSS background photography; added gradient, border, shadow, SVG, and form-accent mapping.
- Added balanced native dark-mode detection with conservative/aggressive alternatives.
- Added Dynamic, Static, and Filter strategies plus a per-site compatibility cycle.
- Added domain, wildcard, scheme, and path rules with per-site palette and custom CSS overrides.
- Added neutral, OLED, warm, and cool presets with live preview and readability controls.
- Added system, fixed-hour, and offline sunrise/sunset schedules using one-shot alarms.
- Added browser-managed settings sync with local fallback, per-origin palette caching, JSON import/export, cache controls, and a local compatibility log.
- Added custom-CSS resource sanitization and runtime checks for direct telemetry/network APIs.
- Added popup, full settings UI, icons, demo page, documentation, and 25 automated tests.

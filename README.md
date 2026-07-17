# Nocturne — Adaptive Dark Mode

Nocturne is a build-free Manifest V3 extension for Brave and other Chromium browsers. It turns light websites into dark themes with perceptual color mapping instead of blindly inverting the whole page, while preserving photographs, video, canvas content, embedded players, and site color relationships as much as possible.

![Nocturne settings](docs/screenshots/options.png)

Version **0.1.1** · Chromium **111+** · no build step · MIT licensed

## Install in Brave

1. Download and extract the install archive. Do not select the ZIP itself.
2. Open `brave://extensions/` in Brave.
3. Turn on **Developer mode** in the upper-right corner.
4. Select **Load unpacked**.
5. Choose the extracted `Nocturne-v0.1.1` folder—the folder that directly contains `manifest.json`.
6. Pin Nocturne from Brave’s Extensions menu, then reload tabs that were already open when it was installed.

For local HTML files, open Nocturne’s **Details** page and enable **Allow access to file URLs**. Keyboard shortcuts can be changed at `brave://extensions/shortcuts`.

## What is included

### Adaptive dynamic engine

Nocturne reads computed page colors and remaps them in OKLab/OKLCH-inspired perceptual space. Light surfaces become a layered dark hierarchy, chromatic links and statuses retain their identity, and mapped text is raised toward a configurable minimum contrast target. The engine applies values through injected CSS variables rather than rewriting site stylesheets.

At `document_start`, Nocturne places an opaque dark curtain over the document before the site can paint. The curtain remains while settings load, native-dark detection samples the unmodified page within one synchronous task, and the visible viewport receives its first dynamic pass. It is then removed on a paint boundary, which prevents the usual split-second white page without exposing an incompletely themed interface. A fail-open timer guarantees that a runtime error cannot leave the page covered indefinitely.

After first paint, expensive computed-style analysis is deferred, divided into idle-time budgets, and limited to elements near the viewport. Visible form controls are primed immediately. Dynamic additions are handled with a MutationObserver, while pointer, keyboard, focus, input, active-state, and common ARIA/data-state changes use an urgent animation-frame queue plus short settled-state passes rather than a page-wide rescan.

### Compatibility without surrendering control

Every site can use one of three strategies:

- **Dynamic** — perceptual mapping, lazy analysis, protected media, interactive controls, gradients, borders, shadows, visible `::before`/`::after`/`::backdrop` styling, SVG colors, and open shadow roots.
- **Static** — a predictable CSS-only palette for difficult web apps and simple documents.
- **Filter** — a fast whole-page inversion fallback with media counter-filters; useful as a last resort.

The popup’s **Fix this site** action cycles through those strategies and finally disables Nocturne for the site. The action is recorded only in a local compatibility log, so it is easy to see what was changed without sending a report anywhere.

### Media and native-theme protection

Images, picture elements, video, canvas, object/embed content, and iframes are protected by default. URL-based CSS background images stay photographic, while CSS gradients are remapped. Media dimming is available as a separate optional control.

Native dark-mode detection combines the page’s visible luminance, readable body contrast, viewport sampling, `color-scheme` declarations, color-scheme metadata, and same-origin `prefers-color-scheme` rules. Detection can be made conservative or aggressive, disabled globally, or overridden per site.

### Site rules and appearance controls

Rules support domains, wildcard subdomains, exact schemes, and paths, including forms such as:

```text
example.com
*.example.com
example.com/editor/*
https://app.example.com/dashboard/*
```

More specific path rules override broader domain rules. A rule can change the enabled state, rendering mode, native-theme behavior, background, text, accent, darkness, brightness, warmth, and custom CSS. Global and per-site custom CSS is sanitized before injection; external imports, remote URL values, modern network-capable image functions, and deliberately obfuscated resource syntax are blocked.

Global controls include neutral, OLED, warm, and cool presets; background, text, accent, and selection colors; darkness; text brightness; contrast; saturation; warmth; minimum text contrast; and optional media dimming.

### Automation and low idle overhead

Activation can be always on, follow the operating system’s `prefers-color-scheme`, use fixed hours—including overnight ranges—or follow locally calculated sunrise and sunset times. The sun mode requires manually entered latitude and longitude and does not call a location or weather service.

Nocturne uses an event-driven Manifest V3 service worker. Fixed and sun schedules use a one-shot alarm for the next transition rather than a permanent minute-by-minute poll. Page controllers also arm their own next-boundary timer and listen for system theme changes.

### Storage, backup, and diagnostics

Settings use Chromium extension storage with a local fallback; they may sync through the browser when browser sync is enabled. Computed palette caches and the compatibility log remain in local extension storage. The options page can export or import a JSON backup, clear the palette cache, clear the compatibility log, or reset everything.

Diagnostics show local element and cache counts. They do not contain page text, form values, credentials, screenshots, or browsing-history uploads.

## Permissions

Nocturne requests only:

- `storage` for settings, rules, caches, backups, and optional browser-managed settings sync;
- `alarms` for one-shot custom/sun schedule transitions;
- `<all_urls>` host access so the stylesheet and engine can run automatically at `document_start` before a page paints.

An `activeTab`-only design would require a toolbar click on every page and could not reliably prevent the initial white flash. Brave’s own site-access controls can narrow the allowed sites, but automatic theming then works only where access is granted.

Nocturne does not request cookies, browsing history, downloads, clipboard, geolocation, notifications, or a persistent background page.

## Privacy model

The runtime contains no `fetch`, XMLHttpRequest, WebSocket, beacon, analytics, telemetry, advertising, account, or developer-server code. The popup does not load remote favicons. Color processing occurs in the tab and stores only color-map entries—not page content. See [PRIVACY.md](PRIVACY.md) for the complete data inventory.

## Keyboard shortcuts

- `Alt` + `Shift` + `D` — toggle Nocturne globally.
- `Alt` + `Shift` + `S` — toggle Nocturne for the current site.

Brave or another extension may already reserve a suggested shortcut. Assign or change it at `brave://extensions/shortcuts`.

## Development and verification

The extension is intentionally build-free: edit the source and reload it from `brave://extensions/`.

```bash
npm test
npm run check
```

The included 31-test suite covers color parsing and perceptual mapping, contrast enforcement, settings normalization, pattern precedence, overnight and solar schedules, one-shot service-worker scheduling, Manifest V3 references, media protection, custom-CSS resource blocking, first-paint lifecycle guarantees, interactive-state refresh behavior, pseudo-element styling, and absence of direct telemetry/network APIs.

A Chromium integration harness was also used to execute the exact production runtime scripts against hostile light interaction rules. It verified forced-`!important` button hover and input focus states, ARIA controls, `::before` overlays, dynamically inserted light surfaces, protected media, gradients, dialogs, viewport-lazy processing, and open shadow roots. Frame-by-frame startup sampling recorded no uncovered light root or body frame before reveal. Screenshots are in `docs/screenshots/`.

## Known limitations

Chromium does not permit extensions to modify browser-internal pages, the Chrome Web Store, other extensions’ pages, or the built-in PDF viewer. Existing tabs normally need one reload after an unpacked extension is first installed.

Closed shadow roots cannot be inspected. Nocturne maps visible `::before`, `::after`, and supported `::backdrop` styles, but generated content hidden inside closed roots, unusual paint worklets, CSS masks, modern gradient syntaxes that do not serialize to recognizable color tokens, browser-native popups, and highly animated sites may still need Static mode or a small custom CSS rule. Canvas pixels are intentionally not recolored. Filter mode can affect fixed-position or backdrop-filter layouts and should remain the last fallback.

Native-theme detection is heuristic because cross-origin stylesheets are intentionally opaque to content scripts. A mixed light/dark site can occasionally be classified incorrectly; the popup provides a one-click native-theme override for that site.

## Project layout

```text
background/     Manifest V3 service worker and toolbar state
content/        bootstrap, native detection, styles, and adaptive engine
shared/         settings, color, pattern, schedule, and storage modules
popup/          toolbar popup
options/        full settings application and live preview
demo/           stress/compatibility test page
tests/          Node test suite
docs/           architecture notes and screenshots
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the engine lifecycle and implementation notes, and [CHANGELOG.md](CHANGELOG.md) for release details.

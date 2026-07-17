# Nocturne Privacy Policy

Effective date: July 17, 2026

Nocturne is designed to work without a developer-operated server. It does not sell data, display advertising, create an account, run analytics, or transmit browsing activity to the developer.

## What the extension processes

To create a dark theme, the content script processes page structure and computed visual styles such as background colors, text colors, borders, shadows, gradients, element visibility, and whether an element contains a text node. It uses the current page URL only to select matching site rules and a per-origin palette cache. It does not store page text, form values, passwords, cookies, media contents, screenshots, or a copy of the DOM.

## Data stored in Chromium extension storage

The following settings are saved with `chrome.storage`: the global enabled state, rendering mode, palette and readability controls, schedule, manually entered sunrise/sunset coordinates, advanced settings, site URL patterns, per-site overrides, and user-supplied custom CSS.

Nocturne writes settings to browser-managed sync storage when that API is available and keeps a local fallback. Whether those settings synchronize between devices is controlled by Brave/Chromium and the user’s browser sync configuration; they are not sent to a Nocturne server.

The following stay in local extension storage:

- compact per-origin color-map caches, containing color values and the origin label;
- a compatibility log created only when **Fix this site** is pressed, containing the origin, previous mode, next mode, and time;
- the local fallback copy of settings.

All of this data can be cleared from Nocturne’s **Data & privacy** settings. Uninstalling the extension removes its extension storage according to the browser’s normal extension behavior.

## Network behavior

Nocturne’s runtime contains no `fetch`, XMLHttpRequest, WebSocket, `sendBeacon`, telemetry, analytics, advertising, update checker, remote configuration, or developer-server request. Extension updates are handled by the browser only if the extension is later distributed through a browser extension store.

The popup deliberately avoids loading remote favicon URLs. Sunrise and sunset are calculated locally from manually entered coordinates. No geolocation or weather API is used.

Custom CSS is sanitized before page injection. External `@import` rules, non-local `url(...)` values, network-capable image functions, and obfuscated resource-loading syntax are removed or cause the custom stylesheet to be rejected. Local fragment, `data:`, and `blob:` URL references are allowed.

Websites themselves continue to make their normal requests; Nocturne neither proxies nor blocks them.

## Permissions

`storage` saves the settings and local data described above. `alarms` wakes the event-driven service worker at the next custom or solar schedule transition. `<all_urls>` lets the extension inject at `document_start`, process page styles, and prevent a white flash automatically on supported web pages.

Nocturne does not request browsing history, cookies, downloads, clipboard, geolocation, notifications, or identity permissions.

## Changes

Material privacy changes should be documented in the changelog and reflected in this file before release.

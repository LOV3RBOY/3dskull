# Skelly Stickers Lab

An interactive single-page experience that recreates the Skelly Stickers landing page with a realtime
Three.js skull, orbiting sticker badges, and glowing UI flourishes. The site is completely static and
runs from plain HTML/CSS/JS.

## Features

- **Realtime 3D viewer** – Procedurally built skull geometry with Three.js, orbital controls, light
  presets, and animated badge planes.
- **Orbiting sticker lineup** – Stickers are rendered both in the Three.js scene and as accessible
  content cards with lore and pin-to-orbit controls.
- **Motion awareness** – Detects `prefers-reduced-motion`, pauses orbiting, and offers a static
  fallback illustration when WebGL is unavailable.
- **Downloadable spec sheet** – Generates a JSON file summarizing assets and usage tips for designers
  or developers who want to reuse the scene.

## Project structure

```
.
├── images
│   ├── logo-badge.svg
│   ├── logo-primary.svg
│   └── logo-wordmark.svg
├── index.html
├── script.js
├── styles.css
└── README.md
```

## Running locally

No build tooling is required. Open `index.html` directly in a browser, or start a simple static
server:

```bash
python3 -m http.server 8000
```

Then visit <http://localhost:8000> and interact with the scene.

## Assets

All artwork is vector-based and lives in the `images/` directory. They were authored specifically for
this project to avoid external dependencies:

- `logo-primary.svg` – Key skull crest used in the hero fallback and orbiting badges.
- `logo-wordmark.svg` – Gradient wordmark for marketing panels.
- `logo-badge.svg` – Collector badge with neon rim and glow typography.

Because the viewer constructs the skull procedurally, no external GLB is required. Designers can use
the generated spec sheet (downloadable from the “Download spec sheet” button) for integration notes.

## Testing

The experience is visual and interactive; automated tests are not included. Perform a manual smoke
check by opening the page, rotating the skull, toggling auto orbit, and pinning a few badges.

# Juno2

Juno2 is a browser-based RNBO instrument with a custom synth-style interface inspired by classic polysynth layouts. It packages an exported RNBO patch inside a hand-built web app, so the sound engine and the front end can evolve independently.

This repository is useful if you want to:

- run the instrument locally in a browser
- keep re-exporting an RNBO patch without rebuilding the UI from scratch
- customize the controls, layout, and styling around an RNBO device

## What is in this project

The app is split into two layers:

- `export/`: generated RNBO output and dependency metadata
- `index.html`, `js/`, `style/`: the public-facing web app and custom interface

The current UI includes:

- grouped synth controls for LFO, oscillators, filter, and envelopes
- a browser keyboard for auditioning the patch
- optional preset and MIDI input menus when supported by the export
- a manifest-based RNBO loading flow so exported filenames can change without breaking the app

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) 16 or newer
- an RNBO web export in the `export/` directory

### Install and run

From the project root:

```sh
npm run dev
```

This starts a local web server with caching disabled, which makes iterative RNBO re-exports easier to test.

You should then see a local URL such as:

```text
http://127.0.0.1:8080
```

Open that address in a browser to use the instrument.

## RNBO export workflow

The intended workflow is:

1. Edit the patch in Max/RNBO.
2. Export the web build into `export/`.
3. Run `npm run sync-export` if the export filename changed.
4. Refresh the browser and continue working on the web UI.

The app reads `export/export-manifest.json` when available, so it can discover the current RNBO export instead of relying on a single hard-coded filename.

## Project structure

| Path | Purpose |
| --- | --- |
| `index.html` | Main document for the instrument |
| `js/app.js` | RNBO bootstrap, export resolution, device creation |
| `js/custom-ui.js` | Custom controls, keyboard, MIDI, presets |
| `style/style.css` | Visual styling for the interface |
| `export/` | RNBO-generated files and dependency metadata |
| `scripts/sync-rnbo-export.mjs` | Updates the manifest for the current export |

## Customizing the app

### Updating the sound engine

Export a new RNBO web patch into `export/`. If RNBO writes a new filename, run:

```sh
npm run sync-export
```

That refreshes the manifest used by the app loader.

### Updating the interface

Most UI work happens in these files:

- `js/custom-ui.js` for controls and behavior
- `style/style.css` for layout and presentation
- `index.html` for page structure

When the RNBO device is ready, the app dispatches a `rnbo-ready` event. `js/custom-ui.js` uses that event to mount the interface against the loaded device.

## Notes for deployment

This project must be served over HTTP or HTTPS. Opening `index.html` directly with the `file:` protocol will usually fail because browsers restrict the APIs RNBO relies on, including WebAssembly and AudioWorklets.

Any static host that can serve the repository contents will work, as long as the exported RNBO files inside `export/` are deployed alongside the app.

## Troubleshooting

### The page loads, but there is no sound

- interact with the page once to resume the browser audio context
- open the browser console and look for RNBO or loading errors
- confirm that the expected patch export exists inside `export/`

### The patch changed, but the browser still shows the old behavior

- run `npm run sync-export` if the export filename changed
- hard refresh the page after re-exporting
- make sure the local dev server is running with the current files

### The RNBO patch does not load

Common causes include:

- the exported patch filename does not match the manifest or fallback config
- the RNBO runtime version in the export does not match the runtime being loaded
- dependency files referenced by `export/dependencies.json` are missing

## Credits

This project builds on the RNBO web export workflow from [Cycling '74](https://cycling74.com/). RNBO is part of [Max](https://cycling74.com/products/max).

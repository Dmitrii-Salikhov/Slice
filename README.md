# Slice

## Features

- Open local DICOM folders (recursive), ZIP, CD/DVD, DICOMDIR, PACS
- Stack scroll, W/L (+ presets), zoom, pan, **cine**
- **Compressed transfer syntaxes**: JPEG / JPEG Lossless / JPEG-LS / JPEG2000 / RLE
- **RGB / YBR** color photometric + PDF / SR document panes
- **MPR** with linked **crosshair** (Cross tool)
- **Length / Angle / ROI / Arrow / HU** annotations (save / load JSON)
- **WebGL2** slice renderer + **oblique MPR** (yaw/pitch)
- Compare mode, anonymized DICOM / JPEG / PNG export

## Stack

- **Electron** + **Vite** + **React** + **TypeScript**
- **dicom-parser** + codecs (`jpeg-js`, `jpeg-lossless-decoder-js`, CharLS, OpenJPEG)
- Canvas 2D / WebGL2 VOI LUT renderer

## Test

```bash
npm test                 # unit + integration
npm run test:coverage    # with coverage report (coverage/)
```

Coverage focuses on DICOM core, viewer math/MPR/crosshair, annotations, export, and i18n.

> If Electron fails with `ipcMain` undefined, clear `ELECTRON_RUN_AS_NODE` (Cursor may set it). The `dev` script already does this.

### Sample phantom (for MPR demo)

```bash
node scripts/make-phantom.mjs sample-dicom 48
```

Then **Open folder** → `sample-dicom`.

## Layout

```
electron/          main + preload (folder dialog, file IO)
src/dicom/         parse, decode (compressed TS), series, documents, color
src/viewer/        W/L, canvas/WebGL, MPR, crosshair, annotations
src/components/    UI: series list, toolbar, viewport, DocumentPane, MPR
src/export/        JPEG/PNG + anonymize
```

## Controls

| Action | How |
|--------|-----|
| Invert / Flip | Toolbar Inv / ⇄ / ⇅ or RMB |
| DICOM tags | Toolbar Tags or RMB |
| Ellipse ROI | ROI tool (drag ellipse) |
| Open folder | Toolbar / empty state |
| Scroll slices | Mouse wheel, drag (Scroll tool), ↑↓←→ |
| Cine | Toolbar Play / FPS |
| Window/Level | W/L tool + drag, or numeric W/L, presets |
| Zoom | Zoom tool / Ctrl+wheel |
| Pan | Pan tool + drag |
| Crosshair sync | MPR → **Cross** tool, drag lines |
| Length / Angle / ROI / Arrow / HU | Stack view tools |
| Annotations | Save / Load JSON from toolbar |
| Oblique MPR | MPR 4th pane — yaw/pitch + scroll |
| WebGL | Toolbar checkbox |
| Documents | Select DOC/SR series → PDF iframe or SR text |
| Compressed TS | JPEG / Lossless / JLS / J2K / RLE |

## Package (Windows)

```bash
npm run dist:win    # NSIS installer → release/
npm run dist:dir    # unpacked dir (faster smoke)
```

Uses `Icon.ico` / `build/icon.ico`, associates `.dcm` / `.dicom` / `.ima` (per-machine NSIS).

## Roadmap (next)

1. Full raycast volume rendering
2. Deformable registration / fusion
3. More SR rendering / PDF annotation sync

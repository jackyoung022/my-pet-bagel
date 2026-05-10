# AGENTS.md

## Project Overview

Desk Pet is a macOS desktop pet application built with Electron. It renders an animated pet as a transparent, frameless, always-on-top window that can interact with the active window, follow the mouse cursor, and respond to user input through clicks, drags, and long-presses.

## Framework & Tech

| Component | Technology | Version |
|---|---|---|
| Runtime | Electron | 33.0.0 |
| Mouse Tracking | robotjs | latest |
| Window Detection | AppleScript (System Events) | macOS native |
| Rendering | HTML Canvas 2D | Browser API |

## Architecture

### Main Process (`src/main.js`)
- Creates the transparent, frameless, always-on-top BrowserWindow
- Loads animation frames from `pic/new/<action-name>/` (sorted by numeric prefix)
- Runs AppleScript to detect the active window position and maximization state
- Uses `robotjs` to poll global mouse position every 33ms for follow mode
- Caches the last known active window to avoid returning Electron itself as frontmost

### Renderer Process (`src/renderer.js`)
- Canvas 2D rendering with bottom-aligned drawing to prevent position drift across actions
- Fixed canvas size that monotonically expands to fit all loaded actions
- State machine for actions (idle → waiting → stretch → nap → burrow, etc.)
- Event handling: context menu, mousedown/mousemove/mouseup, click, IPC messages
- Long-press detection (500ms) for stroke action vs drag detection (>5px movement)
- Auto-burrow trigger after 30s of inactivity
- Auto-nap trigger after 10s of static idle state

### Asset Structure
```
pic/new/
├── burrow/        frame_01.png ... frame_20.png
├── catch-up/      frame_01.png ... frame_20.png (gapped numbering)
├── idle/          00.png ... 05.png
├── jumping-left/  00.png ... 04.png
├── jumping-right/ 00.png ... 04.png
├── nap/           frame_01.png ... frame_20.png
├── roll-around/   frame_01.png ... frame_16.png
├── running-left/  00.png ... 07.png
├── running-right/ 00.png ... 07.png
├── stretch/       frame_01.png ... frame_20.png
├── stroke/        frame_01.png ... frame_20.png
├── waiting/       00.png ... 05.png
```

Frame files are sorted by leading numeric prefix. Both `00.png` and `frame_01.png` naming conventions are supported.

## How to Run

```bash
npm install
npm start
```

## How to Develop

```bash
npm run dev   # same as start, with --dev flag
```

Add new action frames by placing PNG files in `pic/new/<action-name>/`. Register the action in `ACTIONS` config in `renderer.js` and add a menu entry in `buildContextMenu` in `main.js`.

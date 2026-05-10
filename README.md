# Desk Pet

A desktop pet for macOS with cute animations. A transparent, frameless Electron window that lives on your screen, interacts with the active window, and follows your mouse.

## Features

- **Transparent & Frameless**: Always-on-top window that blends into your desktop
- **Animated Pet**: 11 frame-based actions with smooth animation
- **Window Interaction**: Runs to the active window and burrows into its top edge
- **Mouse Follow**: Pet follows your cursor across the entire screen with `robotjs`
- **Right-Click Menu**: Context menu to trigger actions manually
- **Smart Behaviors**: Auto-nap after idle, auto-burrow after long inactivity

## Pet Actions

| Action | Trigger | Description |
|---|---|---|
| **idle** | Static state | Standing still, looking around |
| **waiting** | Static state | Waiting animation, alternates with idle |
| **nap** | 10s idle | Falls asleep when left alone |
| **stretch** | Rare idle | Stretches with a small probability |
| **roll-around** | Menu / random | Rolls on the ground |
| **stroke** | Long-press (500ms) | Enjoying being petted |
| **burrow** | Menu / 30s inactivity | Runs to active window and burrows into its top edge |
| **catch-up** | Click & drag | Grabs onto the cursor and gets dragged |
| **running-left** | Movement | Running to the left |
| **running-right** | Movement | Running to the right |
| **jumping-left** | Burrow movement | Leaping left to reach window top |
| **jumping-right** | Burrow movement | Leaping right to reach window top |

### Interaction Guide

- **Right-click** on the pet → open action menu (includes "跟随鼠标" / "停止跟随" toggle)
- **Click & hold** on the pet for 0.5s → triggers the **stroke** action
- **Click & drag** → the pet follows your mouse (triggers **catch-up**)
- **Move mouse away** while holding → stops following
- **Click** while pet is burrow-paused → pet jumps out of the window edge
- **Move the active window** while pet is burrow-paused → pet auto-releases and returns to idle

## Tech Stack

- **Electron 33** — Cross-platform desktop app framework
- **robotjs** — Global mouse position tracking from the main process
- **AppleScript** — Active window detection and maximization check via `System Events`
- **Canvas 2D** — Frame-by-frame animation rendering with bottom-aligned drawing

## Prerequisites

- macOS
- Node.js 18+
- Grant Accessibility permission to the Electron app (System Settings → Privacy & Security → Accessibility) — required for AppleScript window detection

## Setup & Run

```bash
npm install
npm start
```

## Project Structure

```
├── src/
│   ├── main.js          # Electron main process
│   ├── renderer.js      # Renderer process (canvas, animation, events)
│   └── renderer.html    # Renderer HTML
├── pic/
│   └── new/             # Animation frames (one folder per action)
│       ├── idle/
│       ├── burrow/
│       ├── nap/
│       └── ...
└── package.json
```

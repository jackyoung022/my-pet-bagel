# PROCESS.md

## Current Progress

All core features are implemented and the app is running.

### Implemented

- [x] Electron transparent frameless always-on-top window
- [x] Canvas 2D frame-based animation system with bottom-aligned drawing
- [x] Frame loading from `pic/new/` directory with numeric sorting
- [x] **11 actions**: idle, waiting, stretch, nap, roll-around, stroke, burrow, catch-up, jumping-left/right, running-left/right
- [x] Static state cycling: idle ↔ waiting ↔ stretch (with weighted probabilities)
- [x] Auto-nap after 10s of static idle
- [x] Burrow to active window: runs to window top edge, pauses on first frame, click to continue
- [x] AppleScript active window detection with background caching
- [x] Window maximization detection (skips burrow if maximized)
- [x] Burrow skip if window top is too close to screen edge (< half canvas height)
- [x] Auto-burrow after 30s of inactivity
- [x] Auto-release when burrow target window moves
- [x] Catch-up animation on click & drag, with proper drag detection (>5px threshold)
- [x] Long-press (500ms) stroke action vs drag detection
- [x] Global mouse follow via robotjs polling (8px/frame movement speed)
- [x] Context menu pause during follow mode
- [x] Right-click context menu with all actions + follow toggle
- [x] Keyboard shortcuts: Cmd+Up / Cmd+Down for scaling
- [x] Canvas size monotonically expands to fit all loaded actions (no resize drift)

### Known Issues / Limitations

- [ ] Jumping-left and jumping-right actions are defined but not triggered in the current burrow flow
- [ ] Follow mode pauses when context menu opens but doesn't automatically resume after menu closes
- [ ] AppleScript requires Accessibility permission (macOS System Settings → Privacy & Security → Accessibility)

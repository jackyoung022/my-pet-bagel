const { ipcRenderer } = require('electron');

const canvas = document.getElementById('pet-canvas');
const ctx = canvas.getContext('2d');

// ── Action definitions ──────────────────────────────────────────────────────
const ACTIONS = {
  idle:          { frames: 0, fps: 2,  loop: true,  label: '静止' },
  waiting:       { frames: 0, fps: 2,  loop: true,  label: '等待' },
  stretch:       { frames: 0, fps: 5,  loop: false, label: '伸懒腰' },
  nap:           { frames: 0, fps: 5,  loop: false, label: '打盹' },
  'roll-around': { frames: 0, fps: 5,  loop: false, label: '打滚' },
  stroke:        { frames: 0, fps: 5,  loop: false, label: '抚摸' },
  burrow:        { frames: 0, fps: 5,  loop: false, label: '钻窗口' },
  'catch-up':    { frames: 0, fps: 5,  loop: false, label: '拖拽' },
  'jumping-left': { frames: 0, fps: 5, loop: false, label: '向左跳' },
  'jumping-right':{ frames: 0, fps: 5, loop: false, label: '向右跳' },
  'running-left': { frames: 0, fps: 8, loop: true,  label: '向左跑' },
  'running-right':{ frames: 0, fps: 8, loop: true,  label: '向右跑' },
};

// Static-only actions: when pet is idle, cycle among these
const STATIC_ACTIONS = ['idle', 'waiting', 'stretch'];

// ── State ───────────────────────────────────────────────────────────────────
let currentAction = 'idle';
let currentFrameIndex = 0;
let actionImages = [];
let actionLoaded = false;
let isLoading = false;
let pendingAction = null;
let lastFrameTime = 0;
let frameInterval = 1000 / 2;

// ── Drag state ──────────────────────────────────────────────────────────────
let isMouseDown = false;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let windowStartX = 0;
let windowStartY = 0;

// ── Long press for stroke ───────────────────────────────────────────────────
let longPressTimer = null;
const LONG_PRESS_MS = 500;
let strokeTriggered = false;

// ── Burrow state ────────────────────────────────────────────────────────────
let burrowPaused = false;  // waiting for click to continue burrow animation

// ── Follow state ────────────────────────────────────────────────────────────
let followMouse = false;
let followTargetX = null;
let followTargetY = null;
let petX = 0;

// ── Static idle state timer ────────────────────────────────────────────────
let staticStartTime = 0;
let isStaticState = true;

// ── Random timer ────────────────────────────────────────────────────────────
let randomTimer = null;
const RANDOM_MIN_MS = 5000;
const RANDOM_MAX_MS = 15000;

// ── Burrow auto-trigger after long inactivity ───────────────────────────────
let lastInteractionTime = Date.now();
const BURROW_AUTO_MS = 30000; // 30 seconds of no interaction → auto burrow
let burrowAutoTriggered = false;

// ── Burrow window tracking ──────────────────────────────────────────────────
let burrowTargetWindow = null; // cached window info when burrow started

// ── Movement state ──────────────────────────────────────────────────────────
let isMoving = false;

// ── Dynamic canvas & scaling ────────────────────────────────────────────────
const PET_SCALE = 0.5;

let canvasMaxW = 0;
let canvasMaxH = 0;

// ── Movement constants ──────────────────────────────────────────────────────
const PET_MOVE_SPEED = 3;  // pixels per frame for burrow movement
const FOLLOW_MOVE_SPEED = 8;  // pixels per frame for follow mode

function getDrawSize(img) {
  const w = Math.ceil(img.naturalWidth * PET_SCALE);
  const h = Math.ceil(img.naturalHeight * PET_SCALE);
  return { width: w, height: h };
}

async function loadAction(actionName) {
  if (isLoading) {
    pendingAction = actionName;
    return;
  }
  if (currentAction === actionName && actionLoaded) return;
  isLoading = true;
  currentAction = actionName;
  currentFrameIndex = 0;
  actionLoaded = false;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const result = await ipcRenderer.invoke('get-action-frames', actionName);
  if (!result.frames || result.frames.length === 0) {
    console.error('No frames for action:', actionName);
    isLoading = false;
    if (pendingAction) {
      const next = pendingAction;
      pendingAction = null;
      loadAction(next);
    }
    return;
  }

  actionImages = result.frames.map(f => {
    const img = new Image();
    img.src = f.dataUrl;
    return img;
  });

  await Promise.all(
    actionImages.map(img =>
      img.complete ? Promise.resolve() : new Promise(resolve => { img.onload = resolve; })
    )
  );

  // Record max dimensions for this action, resize window only if larger
  for (const img of actionImages) {
    const w = Math.ceil(img.naturalWidth * PET_SCALE);
    const h = Math.ceil(img.naturalHeight * PET_SCALE);
    if (w > canvasMaxW) canvasMaxW = w;
    if (h > canvasMaxH) canvasMaxH = h;
  }

  canvas.width = canvasMaxW;
  canvas.height = canvasMaxH;
  ipcRenderer.send('resize-window', { width: canvasMaxW, height: canvasMaxH });

  const cfg = ACTIONS[actionName];
  if (cfg) {
    frameInterval = 1000 / cfg.fps;
  }

  actionLoaded = true;
  isLoading = false;

  // Update static state flag
  isStaticState = STATIC_ACTIONS.includes(actionName);
  if (isStaticState) {
    staticStartTime = Date.now();
  }

  if (pendingAction) {
    const next = pendingAction;
    pendingAction = null;
    loadAction(next);
  }
}

function playAction(actionName) {
  if (!ACTIONS[actionName]) return;
  loadAction(actionName);
}

function setRandomTimer() {
  if (randomTimer) clearTimeout(randomTimer);
  if (followMouse || isMoving) return;  // don't trigger random while moving
  if (!isStaticState) return;           // only random when in static state
  const delay = Math.random() * (RANDOM_MAX_MS - RANDOM_MIN_MS) + RANDOM_MIN_MS;
  randomTimer = setTimeout(() => {
    pickStaticAction();
  }, delay);
}

// Pick a random static action (idle, waiting, stretch) with different weights
function pickStaticAction() {
  if (followMouse || isMoving) return;
  const r = Math.random();
  if (r < 0.45) {
    // alternate between idle and waiting
    if (currentAction === 'idle') {
      playAction('waiting');
    } else {
      playAction('idle');
    }
  } else if (r < 0.85) {
    playAction('idle');
  } else if (r < 0.95) {
    playAction('waiting');
  } else {
    playAction('stretch');
  }
  setRandomTimer();
}

// ── Burrow: run to active window top and burrow ─────────────────────────────
async function doBurrow() {
  isMoving = true;
  const isMax = await ipcRenderer.invoke('is-window-maximized');

  if (isMax) {
    // If window is maximized, just play burrow animation at current position
    isMoving = false;
    burrowPaused = true;
    playAction('burrow');
    return;
  }

  const winInfo = await ipcRenderer.invoke('get-active-window');
  if (!winInfo || winInfo.width === 0) {
    isMoving = false;
    burrowTargetWindow = null;
    burrowPaused = true;
    playAction('burrow');
    return;
  }

  burrowTargetWindow = { x: winInfo.x, y: winInfo.y };

  // Calculate target: top-center of active window, bottom of pet aligned to window top edge
  const targetX = winInfo.x + Math.floor(winInfo.width / 2);
  const targetY = winInfo.y;

  // If window top is too close to screen top (less than half canvas height), skip burrow
  if (winInfo.y < canvasMaxH / 2) {
    isMoving = false;
    burrowTargetWindow = null;
    burrowAutoTriggered = false;
    playAction('idle');
    setRandomTimer();
    return;
  }

  // Get current pet position
  const petPos = await ipcRenderer.invoke('get-window-pos');
  petX = petPos[0];

  // Determine direction
  const dx = targetX - petX - canvasMaxW / 2;

  if (Math.abs(dx) > 5) {
    // Run towards the window
    const runAction = dx < 0 ? 'running-left' : 'running-right';
    await moveToward(targetX, targetY, runAction);
  }

  // Now at window top, start burrow animation (pause at frame 0 until click)
  isMoving = false;
  burrowPaused = true;
  playAction('burrow');
  // The burrow animation will show frame 0 and wait for click
}

// Move pet toward a target position by updating window position frame-by-frame
async function moveToward(targetX, targetY, runActionName) {
  return new Promise((resolve) => {
    isMoving = true;
    // Load running animation
    loadAction(runActionName).then(() => {
      const step = () => {
        if (!isMoving) { resolve(); return; }
        ipcRenderer.invoke('get-window-pos').then(pos => {
          const cx = pos[0] + canvasMaxW / 2;
          const cy = pos[1] + canvasMaxH;  // bottom of pet
          const dx = targetX - cx;
          const dy = targetY - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 10) {
            isMoving = false;
            resolve();
            return;
          }

          const moveX = (dx / dist) * PET_MOVE_SPEED;
          const moveY = (dy / dist) * PET_MOVE_SPEED;
          ipcRenderer.send('set-window-pos', {
            x: Math.floor(pos[0] + moveX),
            y: Math.floor(pos[1] + moveY),
          });
          petX = pos[0] + moveX;

          requestAnimationFrame(step);
        });
      };
      requestAnimationFrame(step);
    });
  });
}

// ── Follow mouse ────────────────────────────────────────────────────────────
function startFollow() {
  followMouse = true;
  ipcRenderer.send('set-follow-mode', true);
}

function stopFollow() {
  followMouse = false;
  followTargetX = null;
  followTargetY = null;
  ipcRenderer.send('set-follow-mode', false);
}

// Follow tick: move pet toward followTargetX/Y with running animation
function followTick() {
  if (!followMouse || followTargetX === null) return;

  ipcRenderer.invoke('get-window-pos').then(pos => {
    const cx = pos[0] + canvasMaxW / 2;
    const cy = pos[1] + canvasMaxH;  // bottom of pet

    const dx = followTargetX - cx;
    const dy = followTargetY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 15) {
      // Close enough, switch to idle
      if (STATIC_ACTIONS.includes(currentAction)) return;
      playAction('idle');
      return;
    }

    const runAction = dx < 0 ? 'running-left' : 'running-right';
    if (currentAction !== runAction) {
      playAction(runAction);
    }

    const moveX = (dx / dist) * FOLLOW_MOVE_SPEED;
    const moveY = (dy / dist) * FOLLOW_MOVE_SPEED;
    ipcRenderer.send('set-window-pos', {
      x: Math.floor(pos[0] + moveX),
      y: Math.floor(pos[1] + moveY),
    });
  });
}

// ── Nap trigger after static state timeout ──────────────────────────────────
function checkNapTrigger() {
  if (!isStaticState) return;
  if (followMouse || isMoving) return;
  if (!STATIC_ACTIONS.includes(currentAction)) return;
  const elapsed = Date.now() - staticStartTime;
  if (elapsed >= 10000 && currentAction !== 'nap') {
    playAction('nap');
  }
}

// ── Burrow auto-trigger after long inactivity ───────────────────────────────
function checkBurrowAutoTrigger() {
  if (burrowAutoTriggered) return;
  if (followMouse || isMoving) return;
  if (!isStaticState) return;
  if (currentAction === 'burrow') return;
  const elapsed = Date.now() - lastInteractionTime;
  if (elapsed >= BURROW_AUTO_MS) {
    burrowAutoTriggered = true;
    doBurrow();
  }
}

// ── Check if burrow target window has moved ─────────────────────────────────
function checkBurrowWindowMoved() {
  if (currentAction !== 'burrow' || !burrowPaused || !burrowTargetWindow) return;
  ipcRenderer.invoke('get-active-window').then(winInfo => {
    if (!winInfo || winInfo.width === 0) return;
    const dx = Math.abs(winInfo.x - burrowTargetWindow.x);
    const dy = Math.abs(winInfo.y - burrowTargetWindow.y);
    if (dx > 10 || dy > 10) {
      // Window moved, continue burrow animation
      burrowPaused = false;
      currentFrameIndex = 0;
      lastFrameTime = 0;
    }
  });
}

// ── Render loop ─────────────────────────────────────────────────────────────
let followLastTick = 0;
const FOLLOW_INTERVAL = 33;  // ~30 fps for movement

function render(timestamp) {
  // Follow mouse movement tick
  if (followMouse && timestamp - followLastTick > FOLLOW_INTERVAL) {
    followTick();
    followLastTick = timestamp;
  }

  // Check nap trigger
  checkNapTrigger();

  // Check burrow auto-trigger
  checkBurrowAutoTrigger();

  // Check if burrow target window moved
  checkBurrowWindowMoved();

  if (!lastFrameTime) lastFrameTime = timestamp;

  if (actionLoaded && actionImages.length > 0) {
    // Burrow: don't advance frames while paused waiting for click
    if (currentAction === 'burrow' && burrowPaused) {
      currentFrameIndex = 0; // stay on first frame
    } else {
      const elapsed = timestamp - lastFrameTime;
      if (elapsed >= frameInterval) {
        currentFrameIndex++;
        lastFrameTime = timestamp;

        const cfg = ACTIONS[currentAction];
        const maxFrames = actionImages.length;

        if (currentFrameIndex >= maxFrames) {
          if (cfg && cfg.loop) {
            currentFrameIndex = 0;
          } else {
            // Non-looping action finished
            if (currentAction === 'catch-up') {
              if (isDragging) {
                currentFrameIndex = 9;
              } else {
                // Done dragging, transition to idle
                playAction('idle');
                requestAnimationFrame(render);
                return;
              }
            } else if (currentAction === 'nap') {
              playAction('idle');
              setRandomTimer();
              requestAnimationFrame(render);
              return;
            } else if (currentAction === 'stroke') {
              playAction('idle');
              setRandomTimer();
              requestAnimationFrame(render);
              return;
            } else if (currentAction === 'stretch') {
              setRandomTimer();
              playAction('idle');
              requestAnimationFrame(render);
              return;
            } else if (currentAction === 'roll-around') {
              setRandomTimer();
              playAction('idle');
              requestAnimationFrame(render);
              return;
            } else if (currentAction === 'burrow') {
              // Burrow finished, back to idle
              burrowAutoTriggered = false;
              burrowTargetWindow = null;
              setRandomTimer();
              playAction('idle');
              requestAnimationFrame(render);
              return;
            } else {
              setRandomTimer();
              playAction('idle');
              requestAnimationFrame(render);
              return;
            }
          }
        }

        // catch-up: clamp at frame 10 (index 9) while dragging
        if (currentAction === 'catch-up' && isDragging && currentFrameIndex > 9) {
          currentFrameIndex = 9;
        }
      }
    }
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (actionLoaded && actionImages[currentFrameIndex] && actionImages[currentFrameIndex].complete) {
    const img = actionImages[currentFrameIndex];
    const { width: dw, height: dh } = getDrawSize(img);
    const dx = Math.floor((canvas.width - dw) / 2);
    const dy = canvas.height - dh;
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  requestAnimationFrame(render);
}

// ── Events ──────────────────────────────────────────────────────────────────

function markInteraction() {
  lastInteractionTime = Date.now();
  burrowAutoTriggered = false;
  burrowTargetWindow = null;
}

// Right click → native context menu
let followWasActive = false;
canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  markInteraction();
  followWasActive = followMouse;
  if (followWasActive) {
    stopFollow();
  }
  ipcRenderer.send('show-context-menu', false);
});

// Click on pet → trigger burrow continuation if paused
let clickWasDrag = false;
document.addEventListener('mouseup', () => {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
  if (isDragging) clickWasDrag = true;
  isDragging = false;
  isMouseDown = false;
  if (currentAction === 'catch-up') {
    // Continue catch-up animation from frame 11 onwards
  }
});

canvas.addEventListener('click', () => {
  if (clickWasDrag) { clickWasDrag = false; return; }
  if (currentAction === 'burrow' && burrowPaused) {
    burrowPaused = false;
    burrowTargetWindow = null;
    burrowAutoTriggered = false;
    currentFrameIndex = 0;
    lastFrameTime = 0;
  }
});

// Drag via mousedown + window.setPosition
canvas.addEventListener('mousedown', async (e) => {
  if (e.button === 0) {
    if (currentAction === 'burrow' && burrowPaused) return;
    strokeTriggered = false;
    isMouseDown = true;
    isDragging = false;
    dragFrameShown = false;
    dragStartX = e.screenX;
    dragStartY = e.screenY;
    const pos = await ipcRenderer.invoke('get-window-pos');
    windowStartX = pos[0];
    windowStartY = pos[1];

    // Start long-press timer for stroke
    longPressTimer = setTimeout(() => {
      if (!strokeTriggered) {
        strokeTriggered = true;
        isDragging = false;
        playAction('stroke');
      }
    }, LONG_PRESS_MS);
  }
});

document.addEventListener('mousemove', (e) => {
  if (!isMouseDown || strokeTriggered) return;

  const dx = e.screenX - dragStartX;
  const dy = e.screenY - dragStartY;
  const totalDist = Math.sqrt(dx * dx + dy * dy);

  // If mouse moved, cancel long-press and start dragging
  if (totalDist > 5) {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    if (!isDragging) {
      isDragging = true;
      dragFrameShown = false;
      playAction('catch-up');
    }
  }

  if (!isDragging) return;

  ipcRenderer.send('set-window-pos', {
    x: windowStartX + dx,
    y: windowStartY + dy,
  });
});

// IPC: main process tells us to play action or scale
ipcRenderer.on('play-action', (_event, actionName) => {
  markInteraction();
  stopFollow();
  isMoving = false;
  burrowPaused = false;
  if (actionName === 'burrow') {
    doBurrow();
  } else {
    playAction(actionName);
  }
  if (STATIC_ACTIONS.includes(actionName)) {
    setRandomTimer();
  }
});

ipcRenderer.on('toggle-follow', (_event) => {
  if (followMouse) {
    stopFollow();
    if (isStaticState) {
      setRandomTimer();
    }
  } else {
    startFollow();
  }
});

// Main process sends global mouse position updates
ipcRenderer.on('follow-mouse-update', (_event, mousePos) => {
  followTargetX = mousePos.x;
  followTargetY = mousePos.y;
});

// ── Periodic checks ─────────────────────────────────────────────────────────
setInterval(() => {
  checkNapTrigger();
  checkBurrowAutoTrigger();
}, 2000);

// ── Init ────────────────────────────────────────────────────────────────────
playAction('idle');
requestAnimationFrame(render);
setRandomTimer();

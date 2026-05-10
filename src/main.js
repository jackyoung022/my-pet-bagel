const { app, BrowserWindow, screen, ipcMain, Menu } = require('electron');
const { execFile } = require('child_process');
const path = require('path');
const robot = require('robotjs');

let mainWindow;
let followMode = false;
let followIntervalId = null;
let cachedActiveWindow = null;  // last known non-Electron active window
function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  mainWindow = new BrowserWindow({
    width: 300,
    height: 300,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.setAlwaysOnTop(true, 'floating');

  const initialX = Math.floor((screenWidth - 300) / 2);
  const initialY = Math.floor(screenHeight - 400);
  mainWindow.setPosition(initialX, initialY);

  mainWindow.loadFile(path.join(__dirname, 'renderer.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── Active window detection via AppleScript ─────────────────────────────────

function getActiveWindowInfo() {
  return new Promise((resolve) => {
    const script = `
      tell application "System Events"
        set frontApp to first process whose frontmost is true
        if name of frontApp is "Electron" or name of frontApp contains "desk-pet" then
          return {0, 0, 0, 0}
        end if
        try
          set winPos to position of window 1 of frontApp
          set winSize to size of window 1 of frontApp
          set appPosX to item 1 of winPos
          set appPosY to item 2 of winPos
          set appWidth to item 1 of winSize
          set appHeight to item 2 of winSize
          return {appPosX, appPosY, appWidth, appHeight}
        on error
          return {0, 0, 0, 0}
        end try
      end tell
    `;
    const child = execFile('osascript', ['-e', script], (error, stdout) => {
      if (error) { resolve(null); return; }
      const trimmed = stdout.trim();
      const nums = trimmed.match(/-?\d+/g);
      if (!nums || nums.length < 4) { resolve(null); return; }
      resolve({
        x: parseInt(nums[0], 10),
        y: parseInt(nums[1], 10),
        width: parseInt(nums[2], 10),
        height: parseInt(nums[3], 10),
      });
    });
    // Timeout after 2s
    setTimeout(() => { child.kill(); resolve(null); }, 2000);
  });
}

// Build context menu dynamically
function buildContextMenu(followEnabled = false) {
  const ACTIONS = [
    { key: 'burrow',       label: '钻窗口' },
    { key: 'idle',         label: '静止' },
    { key: 'waiting',      label: '等待' },
    { key: 'stretch',      label: '伸懒腰' },
    { key: 'nap',          label: '打盹' },
    { key: 'roll-around',  label: '打滚' },
    { key: 'stroke',       label: '抚摸' },
  ];

  const template = ACTIONS.map(a => ({
    label: a.label,
    click: () => {
      mainWindow.webContents.send('play-action', a.key);
    },
  }));

  template.push({ type: 'separator' });
  template.push({
    label: followEnabled ? '停止跟随' : '跟随鼠标',
    click: () => {
      mainWindow.webContents.send('toggle-follow');
    },
  });

  template.push({ type: 'separator' });
  template.push({
    label: '退出',
    click: () => app.quit(),
  });

  return Menu.buildFromTemplate(template);
}

// ── IPC handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('get-action-frames', async (_event, actionName) => {
  const fs = require('fs');
  const actionDir = path.join(__dirname, '..', 'pic', 'new', actionName);

  if (!fs.existsSync(actionDir)) {
    return { error: `Action directory not found: ${actionDir}`, frames: [] };
  }

  const files = fs.readdirSync(actionDir)
    .filter(f => f.endsWith('.png'))
    .sort((a, b) => {
      const getNum = (name) => parseInt(name.match(/^(\d+)/)?.[1] || '0', 10);
      return getNum(a) - getNum(b);
    });

  const frames = files.map(f => ({
    filename: f,
    dataUrl: `data:image/png;base64,${fs.readFileSync(path.join(actionDir, f)).toString('base64')}`,
  }));

  return { action: actionName, frames };
});

ipcMain.handle('get-window-pos', () => {
  return mainWindow.getPosition();
});

ipcMain.handle('get-active-window', async () => {
  // Return cached value since querying now may return Electron as frontmost
  return cachedActiveWindow;
});

// ── Cache active window in background ────────────────────────────────────────
function updateCachedWindow() {
  getActiveWindowInfo().then(info => {
    if (info && info.width > 0) {
      cachedActiveWindow = info;
    }
  });
}

// Check if a cached window is maximized based on its dimensions
function checkMaximized(winInfo) {
  return new Promise((resolve) => {
    const script = `
      tell application "System Events"
        set screenW to width of window of desktop
        set screenH to height of window of desktop
        return (${winInfo.width} >= screenW - 10) and (${winInfo.height} >= screenH - 50)
      end tell
    `;
    const child = execFile('osascript', ['-e', script], (error, stdout) => {
      if (error) { resolve(false); return; }
      resolve(stdout.trim() === 'true');
    });
    setTimeout(() => { child.kill(); resolve(false); }, 2000);
  });
}

setInterval(updateCachedWindow, 5000);

ipcMain.handle('is-window-maximized', async () => {
  if (cachedActiveWindow) {
    return await checkMaximized(cachedActiveWindow);
  }
  return false;
});

ipcMain.on('set-window-pos', (_event, { x, y }) => {
  mainWindow.setPosition(x, y);
});

ipcMain.on('resize-window', (_event, { width, height }) => {
  mainWindow.setSize(width, height);
});

ipcMain.on('show-context-menu', (_event, followEnabled) => {
  const menu = buildContextMenu(followEnabled);
  menu.popup({ window: mainWindow });
});

// ── Global mouse follow ─────────────────────────────────────────────────────

function startFollowLoop() {
  if (followIntervalId) return;
  followIntervalId = setInterval(() => {
    if (!followMode || !mainWindow) return;
    const mousePos = robot.getMousePos();
    mainWindow.webContents.send('follow-mouse-update', mousePos);
  }, 33);
}

function stopFollowLoop() {
  if (followIntervalId) {
    clearInterval(followIntervalId);
    followIntervalId = null;
  }
}

ipcMain.on('set-follow-mode', (_event, enabled) => {
  followMode = enabled;
  if (enabled) {
    startFollowLoop();
  } else {
    stopFollowLoop();
  }
});

app.dock?.hide();

app.whenReady().then(() => {
  createWindow();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

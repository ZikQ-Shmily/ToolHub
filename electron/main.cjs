// electron/main.cjs
const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron')
const path = require('path')
const fs = require('fs')

const APP_NAME = '工具合集'
app.setName(APP_NAME)

// ✅ 用 app.isPackaged 判断：开发环境 = !app.isPackaged
const isDev = !app.isPackaged
// dev 服务器地址：优先取环境变量，否则默认 5173
const DEV_URL = process.env.ELECTRON_START_URL || 'http://localhost:5173'

function getIconPath() {
  const dev = path.join(__dirname, '..', 'public', 'icon.ico')
  return fs.existsSync(dev) ? dev : path.join(process.resourcesPath || __dirname, 'public', 'icon.ico')
}

function createWindow () {
  const preloadPath = path.join(__dirname, 'preload.cjs')
  const preloadExists = fs.existsSync(preloadPath)
  if (!preloadExists) {
    console.error('[electron] preload.js 未找到：', preloadPath)
  }

  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    title: APP_NAME,
    icon: getIconPath(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: preloadPath,
    },
  })

  // 去掉默认菜单
  Menu.setApplicationMenu(null)

  // === 强化日志，定位白屏根因 ===
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[did-fail-load]', code, desc, '→', url)
  })
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('[render-process-gone]', details)
  })
  win.webContents.on('preload-error', (_e, path, err) => {
    console.error('[preload-error]', path, err)
  })
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    console.log('[renderer]', level, message, `(${sourceId}:${line})`)
  })

  if (isDev) {
    console.log('[electron] dev 模式 → 加载：', DEV_URL)
    win.loadURL(DEV_URL)
    // 自动打开 DevTools，方便看到渲染进程报错
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    const html = path.join(__dirname, '..', 'dist', 'index.html')
    console.log('[electron] prod 模式 → 加载：', html)
    win.loadFile(html)
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

// ====== 保存相关 ======
ipcMain.handle('save-image', async (_evt, { buffer, defaultPath }) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: '保存拼接图片',
    defaultPath: defaultPath || 'merged.jpg',
    filters: [
      { name: 'JPEG 图片', extensions: ['jpg', 'jpeg'] },
      { name: 'PNG 图片', extensions: ['png'] },
    ],
  })
  if (canceled || !filePath) return { canceled: true }
  fs.writeFileSync(filePath, Buffer.from(buffer))
  return { canceled: false, filePath }
})

ipcMain.handle('pick-save-dir', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
  })
  if (canceled || !filePaths[0]) return { canceled: true }
  return { canceled: false, path: filePaths[0] }
})

ipcMain.handle('save-image-in-dir', async (_evt, { buffer, dir, filename, subdir }) => {
  const targetDir = subdir ? path.join(dir, subdir) : dir
  fs.mkdirSync(targetDir, { recursive: true })
  const fp = path.join(targetDir, filename)
  fs.writeFileSync(fp, Buffer.from(buffer))
  return { filePath: fp }
})

// ====== 选择图片（文件夹/多文件）======
const IMG_EXTS = new Set(['.jpg', '.jpeg', '.png'])

ipcMain.handle('pick-image-dir', async ()=> {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory']
  })
  if (canceled || !filePaths[0]) return { canceled: true }
  return { canceled: false, dir: filePaths[0] }
})

ipcMain.handle('read-images-in-dir', async (_evt, dir) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const items = []
  for (const e of entries) {
    if (!e.isFile()) continue
    const ext = path.extname(e.name).toLowerCase()
    if (!IMG_EXTS.has(ext)) continue
    const p = path.join(dir, e.name)
    const data = fs.readFileSync(p)
    items.push({ name: e.name, data: Uint8Array.from(data) })
  }
  return { items }
})

ipcMain.handle('pick-image-files', async ()=> {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png'] }]
  })
  if (canceled || !filePaths.length) return { canceled: true }
  const items = filePaths.map(p => ({ name: path.basename(p), data: Uint8Array.from(fs.readFileSync(p)) }))
  const parents = new Set(filePaths.map(p => path.dirname(p)))
  const srcFolderName = parents.size === 1 ? path.basename([...parents][0]) : '手动选择'
  return { canceled: false, items, srcFolderName }
})

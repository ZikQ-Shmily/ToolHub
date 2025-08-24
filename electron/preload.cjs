// electron/preload.cjs
const { contextBridge, ipcRenderer } = require('electron')

function invoke(channel, payload) {
  return ipcRenderer.invoke(channel, payload).catch(err => {
    console.error('[preload invoke error]', channel, err)
    return { canceled: true, error: String(err) }
  })
}

const api = {
  // 调试通道
  ping: () => invoke('ping'),

  // 保存相关
  saveImage: (buffer, defaultPath) => invoke('save-image', { buffer, defaultPath }),
  pickSaveDir: () => invoke('pick-save-dir'),
  saveImageInDir: (buffer, dir, filename, subdir) =>
    invoke('save-image-in-dir', { buffer, dir, filename, subdir }),

  // 图片选择
  pickImageDir: () => invoke('pick-image-dir'),
  readImagesInDir: (dir) => invoke('read-images-in-dir', dir),
  pickImageFiles: () => invoke('pick-image-files'),
}

try {
  contextBridge.exposeInMainWorld('api', api)
  window.addEventListener('DOMContentLoaded', () => {
    console.log('[preload] api exposed')
  })
} catch (e) {
  console.error('[preload] exposeInMainWorld failed:', e)
}

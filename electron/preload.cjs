// electron/preload.cjs
const { contextBridge, ipcRenderer } = require('electron')

function invoke(channel, payload) {
  return ipcRenderer.invoke(channel, payload).catch(err => {
    console.error('[preload invoke error]', channel, err)
    return { canceled: true, error: String(err) }
  })
}

const api = {
  // 调试
  ping: () => invoke('ping'),

  // —— 图片拼接 / 保存 —— //
  // 兼容两种用法：saveImage({ buffer, defaultPath }) 或 saveImage(buffer, defaultPath)
  saveImage: (...args) => {
    if (args.length === 1 && args[0] && typeof args[0] === 'object') {
      const { buffer, defaultPath } = args[0]
      return invoke('save-image', { buffer, defaultPath })
    }
    const [buffer, defaultPath] = args
    return invoke('save-image', { buffer, defaultPath })
  },
  pickSaveDir: () => invoke('pick-save-dir'),
  saveImageInDir: (buffer, dir, filename, subdir) =>
    invoke('save-image-in-dir', { buffer, dir, filename, subdir }),

  // —— 图片选择 —— //
  pickImageDir: () => invoke('pick-image-dir'),
  readImagesInDir: (dir) => invoke('read-images-in-dir', dir),
  pickImageFiles: () => invoke('pick-image-files'),

  // —— 批量重命名（新增） —— //
  pickAnyFiles: () => invoke('pick-any-files'),
  renameFiles: (items) => invoke('rename-files', items),
}

try {
  contextBridge.exposeInMainWorld('api', api)
  window.addEventListener('DOMContentLoaded', () => {
    console.log('[preload] api exposed')
  })
} catch (e) {
  console.error('[preload] exposeInMainWorld failed:', e)
}

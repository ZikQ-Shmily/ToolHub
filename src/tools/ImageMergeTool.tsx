import React, { useMemo, useRef, useState } from 'react'
import { FolderOpen, Images, Rocket } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { mergeImages, type MergeOptions, type LoadedImage } from '@/merge'

type RawImage = { name: string; data: Uint8Array }

const api: any = (window as any).api
const apiReady = !!api

const defaultOpts: MergeOptions = {
  layout: 'horizontal',
  gap: 8,
  bgColor: '#ffffff',
  format: 'image/jpeg',
  quality: 0.92,
}

export default function ImageMergeTool() {
  const [raw, setRaw] = useState<RawImage[]>([])
  const [items, setItems] = useState<LoadedImage[]>([])
  const [mode, setMode] = useState<'horizontal' | 'vertical' | 'grid'>('horizontal')
  const [saveDir, setSaveDir] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [srcFolderName, setSrcFolderName] = useState<string>('')

  const [msg, setMsg] = useState<null | { type: 'success' | 'error' | 'info'; text: string }>(null)
  const notify = (type: 'success' | 'error' | 'info', text: string) => {
    setMsg({ type, text })
    setTimeout(() => setMsg(null), 3000)
  }

  const fileInputRef = useRef<HTMLInputElement>(null)

  async function rawToLoaded(list: RawImage[]): Promise<LoadedImage[]> {
    const out: LoadedImage[] = []
    for (const it of list) {
      const blob = new Blob([it.data])
      const bmp = await createImageBitmap(blob)
      out.push({ src: it.name, bmp, w: bmp.width, h: bmp.height })
    }
    return out
  }

  // —— 选择文件夹（仅 Electron 可用）
  const pickFolder = async () => {
    if (!apiReady) return notify('info', '此功能需要在安装包/绿色版中使用（浏览器不支持选择文件夹）。')
    const r = await api.pickImageDir()
    if (r?.canceled || !r?.dir) return
    const { items: imgs } = await api.readImagesInDir(r.dir)
    setRaw(imgs)
    setItems(await rawToLoaded(imgs))
    setSrcFolderName(r.dir.split(/[/\\]/).pop() || '未命名')
  }

  // —— 选择若干文件（Electron / 浏览器均可）
  const pickFiles = async () => {
    if (apiReady) {
      const r = await api.pickImageFiles()
      if (r?.canceled || !r?.items) return
      setRaw(r.items)
      setItems(await rawToLoaded(r.items))
      setSrcFolderName(r.srcFolderName || '手动选择')
    } else {
      fileInputRef.current?.click() // 走浏览器降级
    }
  }

  // 浏览器 input 回调：读取本地文件
  const onLocalFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    const items: RawImage[] = []
    for (const f of files) {
      const buf = new Uint8Array(await f.arrayBuffer())
      items.push({ name: f.name, data: buf })
    }
    setRaw(items)
    setItems(await rawToLoaded(items))
    setSrcFolderName('手动选择')
    e.target.value = '' // 允许重复选择同一批文件
  }

  // —— 选择保存目录（仅 Electron 可用）
  const chooseSaveDir = async () => {
    if (!apiReady) return notify('info', '浏览器模式将直接下载合成结果。')
    const r = await api.pickSaveDir()
    if (r?.canceled || !r?.path) return
    setSaveDir(r.path)
    notify('success', `已选择保存位置：${r.path}`)
  }

  // A1.jpg → group=A, index=1
  const parseName = (name: string) => {
    const base = name.replace(/^.*[\\/]/, '')
    const m = /^([A-Za-z]+)(\d+)\.(jpe?g|png)$/i.exec(base)
    if (!m) return null
    return { group: m[1].toUpperCase(), index: parseInt(m[2], 10) }
  }

  // 分组并按序号升序；仅保留每组数量 ≥ 2
  function groupByRule(list: RawImage[]) {
    const groups = new Map<string, RawImage[]>()
    for (const it of list) {
      const info = parseName(it.name)
      if (!info) continue
      const key = info.group
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(it)
    }
    const sorted = new Map<string, RawImage[]>()
    for (const [g, arr] of groups) {
      const withIdx = arr
        .map((x) => ({ x, idx: parseName(x.name)!.index }))
        .sort((a, b) => a.idx - b.idx)
        .map((v) => v.x)
      if (withIdx.length >= 2) sorted.set(g, withIdx)
    }
    return sorted
  }

  const total = useMemo(() => `${items.length} 张图片`, [items.length])

  // —— 开始拼接
  const startMerge = async () => {
    if (!raw.length) return notify('info', '请先选择图片或文件夹')
    setBusy(true)
    try {
      let dest = saveDir
      if (apiReady && !dest) {
        const rr = await api.pickSaveDir()
        if (rr?.canceled || !rr?.path) { setBusy(false); return }
        dest = rr.path
        setSaveDir(dest)
      }

      const groups = groupByRule(raw)
      if (groups.size === 0) return notify('info', '未找到符合命名规则且数量≥2的分组（例：A1.jpg、A2.jpg…）')

      const baseName = (srcFolderName || '手动选择').replace(/_已拼接$/u, '')
      const outSubdir = `${baseName}_已拼接`

      let count = 0
      for (const [groupKey, arr] of groups) {
        const loaded = await rawToLoaded(arr)
        const gridCols = Math.ceil(Math.sqrt(loaded.length))
        const opts: MergeOptions = { ...defaultOpts, layout: mode, ...(mode === 'grid' ? { cols: gridCols } : {}) }
        const blob = await mergeImages(loaded, opts)
        const buf = new Uint8Array(await blob.arrayBuffer())
        const filename = `${groupKey}.jpg`

        if (apiReady) {
          await api.saveImageInDir(buf, dest, filename, outSubdir)
        } else {
          // 浏览器降级：直接下载
          const a = document.createElement('a')
          a.href = URL.createObjectURL(blob)
          a.download = filename
          document.body.appendChild(a)
          a.click()
          URL.revokeObjectURL(a.href)
          a.remove()
        }
        count++
      }

      notify(
        'success',
        apiReady
          ? `拼接完成！共输出 ${count} 组。已保存到：${dest}\\${outSubdir}`
          : `拼接完成！共输出 ${count} 组，文件已开始下载。`
      )
    } catch (err: any) {
      console.error(err)
      notify('error', '拼接失败：' + (err?.message || String(err)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {/* 浏览器降级用 input（Electron 也不受影响） */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".jpg,.jpeg,.png"
        className="hidden"
        onChange={onLocalFiles}
      />

      <div className="flex flex-wrap items-center gap-3">
        {/* 选择文件夹：仅 Electron */}
        <Button onClick={pickFolder} variant="secondary" disabled={busy}>
          <FolderOpen className="mr-2 h-4 w-4" /> 选择图片文件夹
        </Button>

        {/* 选择文件：任何环境可用（无 API 自动触发 input） */}
        <Button onClick={pickFiles} variant="secondary" disabled={busy}>
          <Images className="mr-2 h-4 w-4" /> 选择若干图片
        </Button>

        {/* 选择保存位置：仅 Electron 有意义；浏览器给出提示 */}
        <Button onClick={chooseSaveDir} variant="secondary" disabled={busy}>
          {apiReady ? (saveDir ? '已选择保存位置' : '选择保存位置') : '（浏览器将直接下载）'}
        </Button>

        <Select value={mode} onValueChange={(v: any) => setMode(v)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="拼接方式" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="horizontal">横向</SelectItem>
            <SelectItem value="vertical">纵向</SelectItem>
            <SelectItem value="grid">网格</SelectItem>
          </SelectContent>
        </Select>

        <Button onClick={startMerge} disabled={busy || !raw.length}>
          <Rocket className="mr-2 h-4 w-4" /> {busy ? '正在拼接…' : '开始拼接'}
        </Button>
      </div>

      {/* 主题化提示条 */}
      {msg && (
        <div
          className={
            msg.type === 'success'
              ? 'mt-3 rounded-md border border-green-200 bg-green-50 text-green-700 px-3 py-2 text-sm'
              : msg.type === 'error'
              ? 'mt-3 rounded-md border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-sm'
              : 'mt-3 rounded-md border border-blue-200 bg-blue-50 text-blue-700 px-3 py-2 text-sm'
          }
        >
          {msg.text}
        </div>
      )}

      <div className="text-sm text-muted-foreground mt-2">
        {raw.length
          ? `已选择：${total}；源：${srcFolderName || '（手动选择）'}；保存到：${
              apiReady ? (saveDir || '（未选择）') : '（浏览器下载）'
            }`
          : '等待开始拼接…'}
      </div>
    </>
  )
}

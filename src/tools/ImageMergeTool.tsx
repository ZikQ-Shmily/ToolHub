import React, { useMemo, useRef, useState } from 'react'
import { FolderOpen, Images, Rocket } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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

function parseName(name: string) {
  const base = name.replace(/^.*[\\\/]/, '')
  const m = /^([A-Za-z]+)(\d+)\.(jpe?g|png)$/i.exec(base)
  if (!m) return null
  return { group: m[1].toUpperCase(), index: parseInt(m[2], 10) }
}

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

async function rawToLoaded(list: RawImage[]): Promise<LoadedImage[]> {
  const out: LoadedImage[] = []
  for (const it of list) {
    const blob = new Blob([it.data])
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.src = url
    await img.decode()
    let bmp: ImageBitmap | undefined
    try { bmp = await createImageBitmap(blob) } catch {}
    const w = (img.naturalWidth || (bmp ? bmp.width : 0)) as number
    const h = (img.naturalHeight || (bmp ? bmp.height : 0)) as number
    const item: any = { name: it.name, img, bmp, w, h }
    out.push(item as unknown as LoadedImage)
    URL.revokeObjectURL(url)
  }
  return out
}

export default function ImageMergeTool() {
  const [raw, setRaw] = useState<RawImage[]>([])
  const [items, setItems] = useState<LoadedImage[]>([])
  const [mode, setMode] = useState<'horizontal' | 'vertical' | 'grid'>('horizontal')
  const [saveDir, setSaveDir] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [srcFolderName, setSrcFolderName] = useState<string>('')

  const [leftMsg, setLeftMsg] = useState<null | { type: 'success' | 'error' | 'info'; text: string }>(null)
  const notifyLeft = (type: 'success' | 'error' | 'info', text: string) => {
    setLeftMsg({ type, text })
    setTimeout(() => setLeftMsg(null), 3000)
  }

  const fileInputRef = useRef<HTMLInputElement>(null)

  const pickFolder = async () => {
    if (!apiReady) return notifyLeft('info', '此功能需要在安装包/绿色版中使用（浏览器不支持选择文件夹）。')
    const r = await api.pickImageDir()
    if (r?.canceled || !r?.dir) return
    const { items: imgs } = await api.readImagesInDir(r.dir)
    setRaw(imgs)
    setItems(await rawToLoaded(imgs))
    setSrcFolderName(r.dir.split(/[\\\/]/).pop() || '未命名')
  }

  const pickFiles = async () => {
    if (apiReady) {
      const r = await api.pickImageFiles()
      if (r?.canceled || !r?.items) return
      setRaw(r.items)
      setItems(await rawToLoaded(r.items))
      setSrcFolderName(r.srcFolderName || '手动选择')
    } else {
      fileInputRef.current?.click()
    }
  }

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
    e.target.value = ''
  }

  const chooseSaveDir = async () => {
    if (!apiReady) return notifyLeft('info', '浏览器模式将直接下载合成结果。')
    const r = await api.pickSaveDir()
    if (r?.canceled || !r?.path) return
    setSaveDir(r.path)
    notifyLeft('success', `已选择保存位置：${r.path}`)
  }

  const total = useMemo(() => `${items.length} 张图片`, [items.length])

  const startMerge = async () => {
    if (!raw.length) return notifyLeft('info', '请先选择图片或文件夹')
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
      if (groups.size === 0) return notifyLeft('info', '未找到符合命名规则且数量≥2的分组（例：A1.jpg、A2.jpg…）')

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

      notifyLeft(
        'success',
        apiReady
          ? `拼接完成！共输出 ${count} 组。已保存到：${dest}\\${outSubdir}`
          : `拼接完成！共输出 ${count} 组，文件已开始下载。`
      )
    } catch (err: any) {
      console.error(err)
      notifyLeft('error', '拼接失败：' + (err?.message || String(err)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="w-full">
      <CardContent className="pt-6 space-y-4">
        {/* 第一行：操作工具栏（左两列按钮，右一列“开始拼接”） */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          {/* 左两列 */}
          <div className="col-span-1 lg:col-span-2">
            <div className="flex flex-wrap gap-2">
              <Button onClick={pickFolder} variant="secondary" disabled={busy}>
                <FolderOpen className="mr-2 h-4 w-4" /> 选择图片文件夹
              </Button>
              <Button onClick={pickFiles} variant="secondary" disabled={busy}>
                <Images className="mr-2 h-4 w-4" /> 选择若干图片
              </Button>
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
            </div>
            {/* 左侧提示（持续 3s） */}
            {leftMsg && (
              <div
                className={
                  leftMsg.type === 'success'
                    ? 'mt-2 rounded-md border border-green-200 bg-green-50 text-green-700 px-3 py-2 text-sm'
                    : leftMsg.type === 'error'
                    ? 'mt-2 rounded-md border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-sm'
                    : 'mt-2 rounded-md border border-blue-200 bg-blue-50 text-blue-700 px-3 py-2 text-sm'
                }
              >
                {leftMsg.text}
              </div>
            )}
          </div>

          {/* 右一列：开始拼接按钮 */}
          <div className="col-span-1">
            <div className="flex flex-col gap-2">
              <Button onClick={startMerge} disabled={busy || !raw.length} className="px-6 w-fit">
                <Rocket className="mr-2 h-4 w-4" /> {busy ? '正在拼接…' : '开始拼接'}
              </Button>
            </div>
          </div>
        </div>

        {/* 第二行：右侧独立常显面板 —— 图片命名规则 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          <div className="col-span-1 lg:col-span-2"></div>
          <div className="col-span-1">
            <div className="rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground space-y-2">
              <div className="font-medium">图片命名规则</div>
              <ul className="list-disc pl-5 space-y-1">
                <li>同组须以相同字母前缀开头：<code>A1.jpg</code> + <code>A2.jpg</code> → <code>A.jpg</code>（不区分大小写）。</li>
                <li>每组数量 ≥ 2 自动拼接，组内按数字升序。</li>
                <li>支持 <code>jpg</code> / <code>jpeg</code> / <code>png</code>。</li>
                <li>结果保存到：<code>原文件夹名_已拼接</code> 子目录。</li>
              </ul>
            </div>
          </div>
        </div>

        {/* 状态栏（左对齐） */}
        <div className="text-sm text-muted-foreground">
          {raw.length
            ? `已选择：${total}；源：${srcFolderName || '（手动选择）'}；保存到：${
                apiReady ? (saveDir || '（未选择）') : '（浏览器下载）'
              }`
            : '等待开始拼接…'}
        </div>

        {/* 隐藏 input：放在末尾并带 hidden 属性，避免顶端间距 */}
        <input
          hidden
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.jpg,.jpeg,.png"
          className="hidden"
          onChange={onLocalFiles}
        />
      </CardContent>
    </Card>
  )
}

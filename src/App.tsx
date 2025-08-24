import React, { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AppWindow,
  FolderOpen,
  Images as ImagesIcon,
  Save,
  Rocket,
  Info,
  Image as ImageIcon,
  Wrench,
  Package2,
} from "lucide-react"

type RawImage = { name: string; data: Uint8Array }
type LoadedImage = { name: string; img: HTMLImageElement; w: number; h: number }
type Mode = "h" | "v" | "grid"

declare global {
  interface Window {
    api?: {
      pickImageDir: () => Promise<{ canceled: boolean; dir?: string }>
      readImagesInDir: (
        dir: string
      ) => Promise<{ items: { name: string; data: Uint8Array }[] }>
      pickImageFiles: () => Promise<{
        canceled: boolean
        items?: { name: string; data: Uint8Array }[]
        srcFolderName?: string
      }>
      pickSaveDir: () => Promise<{ canceled: boolean; path?: string }>
      saveImageInDir: (
        buffer: Uint8Array,
        dir: string,
        filename: string,
        subdir?: string
      ) => Promise<{ filePath: string }>
    }
  }
}

const hasApi = Boolean(window.api)
const toBlob = (u8: Uint8Array, type = "image/jpeg") => new Blob([u8], { type })
const extOf = (name: string) => {
  const i = name.lastIndexOf(".")
  return i >= 0 ? name.slice(i).toLowerCase() : ""
}
const stemOf = (name: string) => {
  const i = name.lastIndexOf(".")
  return i >= 0 ? name.slice(0, i) : name
}

function groupKeyFromName(name: string): string {
  const stem = stemOf(name)
  const m = /^[A-Za-z]+/.exec(stem)
  if (m && m[0]) return m[0].toUpperCase()
  return (stem[0] || "X").toUpperCase()
}
function serialFromName(name: string): number {
  const stem = stemOf(name)
  const m = /(\d+)/.exec(stem)
  return m ? parseInt(m[1], 10) : 0
}

async function rawToLoaded(arr: RawImage[]): Promise<LoadedImage[]> {
  const loadOne = async (r: RawImage): Promise<LoadedImage> => {
    const blob = toBlob(r.data, extOf(r.name) === ".png" ? "image/png" : "image/jpeg")
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.src = url
    await img.decode()
    const res = { name: r.name, img, w: img.naturalWidth, h: img.naturalHeight }
    URL.revokeObjectURL(url)
    return res
  }
  return Promise.all(arr.map(loadOne))
}
const gridColsFor = (n: number) => Math.ceil(Math.sqrt(n))

async function mergeImages(loaded: LoadedImage[], mode: Mode): Promise<Blob> {
  if (loaded.length === 1) {
    const canvas = document.createElement("canvas")
    canvas.width = loaded[0].w
    canvas.height = loaded[0].h
    const ctx = canvas.getContext("2d")!
    ctx.drawImage(loaded[0].img, 0, 0)
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.92))
  }

  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")!

  if (mode === "h" || mode === "v") {
    if (mode === "h") {
      const targetH = Math.max(...loaded.map((x) => x.h))
      const scaled = loaded.map((x) => {
        const s = targetH / x.h
        return { ...x, dw: Math.round(x.w * s), dh: targetH }
      })
      canvas.width = scaled.reduce((s, x) => s + x.dw, 0)
      canvas.height = targetH
      let x0 = 0
      for (const it of scaled) {
        ctx.drawImage(it.img, x0, 0, it.dw, it.dh)
        x0 += it.dw
      }
    } else {
      const targetW = Math.max(...loaded.map((x) => x.w))
      const scaled = loaded.map((x) => {
        const s = targetW / x.w
        return { ...x, dw: targetW, dh: Math.round(x.h * s) }
      })
      canvas.width = targetW
      canvas.height = scaled.reduce((s, x) => s + x.dh, 0)
      let y0 = 0
      for (const it of scaled) {
        ctx.drawImage(it.img, 0, y0, it.dw, it.dh)
        y0 += it.dh
      }
    }
  } else {
    const cols = gridColsFor(loaded.length)
    const rows = Math.ceil(loaded.length / cols)
    const maxW = Math.max(...loaded.map((x) => x.w))
    const maxH = Math.max(...loaded.map((x) => x.h))
    canvas.width = cols * maxW
    canvas.height = rows * maxH
    loaded.forEach((it, idx) => {
      const r = Math.floor(idx / cols)
      const c = idx % cols
      const x = c * maxW + Math.floor((maxW - it.w) / 2)
      const y = r * maxH + Math.floor((maxH - it.h) / 2)
      ctx.drawImage(it.img, x, y)
    })
  }

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.92))
}

export default function App() {
  const [activeTool, setActiveTool] = useState<"merge" | "rename" | "compress">("merge")
  const [raw, setRaw] = useState<RawImage[]>([])
  const [srcFolderName, setSrcFolderName] = useState<string>("")
  const [destDir, setDestDir] = useState<string>("")
  const [mode, setMode] = useState<Mode>("h")
  const [status, setStatus] = useState<string>("等待开始拼接...")

  const tipText = useMemo(
    () =>
      [
        "【图片命名规则】",
        "1) 同组须以相同字母前缀开头：A1.jpg + A2.jpg + A3.jpg → A.jpg；B1.jpg + B2.jpg → B.jpg",
        "2) 每组数量 ≥ 2 自动拼接；组内按数字升序：A1, A2, A3 ...",
        "3) 支持 jpg / jpeg / png",
        "4) 结果保存到：原文件夹名_已拼接",
      ].join("\n"),
    []
  )

  const canStart = useMemo(() => raw.length >= 2, [raw])

  const onPickDir = async () => {
    if (!hasApi) {
      alert("此功能需要在安装版/绿色版中使用（浏览器不能选择文件夹）。")
      return
    }
    const r = await window.api!.pickImageDir()
    if (r.canceled || !r.dir) return
    const list = await window.api!.readImagesInDir(r.dir)
    if (!list.items?.length) {
      setStatus("该文件夹没有可用图片（jpg/png）")
      return
    }
    setRaw(list.items)
    setSrcFolderName(r.dir.split(/[\\/]/).pop() || "未命名")
    setStatus(`已选择：${list.items.length} 张图片；源文件夹：${r.dir}`)
  }

  const onPickFiles = async () => {
    if (!hasApi) alert("浏览器模式：只能下载合并结果，不能选择文件夹/保存到目录。")
    const r = hasApi ? await window.api!.pickImageFiles() : { canceled: true }
    if (r.canceled) return
    if (r.items && r.items.length) {
      setRaw(r.items)
      setSrcFolderName(r.srcFolderName || "手动选择")
      setStatus(`已选择：${r.items.length} 张图片；源：${r.srcFolderName || "手动选择"}`)
    }
  }

  const onPickSave = async () => {
    if (!hasApi) {
      setStatus("浏览器模式：拼接完成后会直接下载到本地。")
      return
    }
    const r = await window.api!.pickSaveDir()
    if (r.canceled || !r.path) return
    setDestDir(r.path)
    setStatus(`已选择保存位置：${r.path}`)
  }

  function buildGroups(list: RawImage[]) {
    const map = new Map<string, RawImage[]>()
    for (const it of list) {
      const key = groupKeyFromName(it.name)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(it)
    }
    for (const [k, arr] of map) {
      arr.sort((a, b) => serialFromName(a.name) - serialFromName(b.name))
      if (arr.length < 2) map.delete(k)
    }
    return map
  }

  const startMerge = async () => {
    if (!raw.length) return
    const groups = buildGroups(raw)
    if (!groups.size) {
      alert("没有符合规则的分组（需同字母前缀且每组至少两张）")
      return
    }

    setStatus("正在加载图片...")
    let ok = 0

    for (const [key, arr] of groups) {
      const loaded = await rawToLoaded(arr)
      setStatus(`分组「${key}」共 ${loaded.length} 张，正在拼接...`)
      const blob = await mergeImages(loaded, mode)
      const outSubdir = `${srcFolderName || "拼接结果"}_已拼接`
      const filename = `${key}.jpg`
      const buf = new Uint8Array(await blob.arrayBuffer())

      if (hasApi && destDir) {
        await window.api!.saveImageInDir(buf, destDir, filename, outSubdir)
      } else {
        const a = document.createElement("a")
        a.href = URL.createObjectURL(blob)
        a.download = filename
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(a.href)
      }
      ok++
    }

    if (hasApi && destDir) {
      alert(`拼接完成！共输出 ${ok} 组。\n保存位置：${destDir}\\${srcFolderName}_已拼接`)
    } else {
      alert(`拼接完成！共输出 ${ok} 组（浏览器已直接下载）。`)
    }
    setStatus("等待开始拼接...")
  }

  // === 动态标题与提示 ===
  const toolMeta = {
    merge: { icon: ImageIcon, label: "图片拼接", tip: tipText },
    rename: { icon: Wrench, label: "批量重命名" },
    compress: { icon: Package2, label: "图片压缩" },
  } as const
  const CurrentIcon = toolMeta[activeTool].icon
  const currentLabel = toolMeta[activeTool].label
  const currentTip = (toolMeta[activeTool] as any).tip as string | undefined

  return (
    <div className="w-full h-[100vh] overflow-hidden bg-slate-50">
      {/* 顶部 */}
      <div className="px-6 pt-6">
        <div className="flex items-center gap-2 text-slate-800">
          <AppWindow className="w-6 h-6" />
          <h1 className="text-2xl font-bold">工具合集</h1>
          <span className="text-slate-400">/</span>
          <CurrentIcon className="w-5 h-5 text-slate-700" />
          <h2 className="text-xl font-semibold">{currentLabel}</h2>

        {/* 只有“图片拼接”显示提示按钮；并标记 no-drag，防止被标题栏拖拽吞掉鼠标事件 */}
          {currentTip && (
            <button
              className="ml-2 rounded-full p-1 text-slate-500 hover:bg-slate-200 app-no-drag cursor-help"
              title={currentTip}
            >
              <Info className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* 工具切换 */}
        <div className="mt-5 flex flex-wrap gap-3">
          <Button
            variant={activeTool === "merge" ? "default" : "secondary"}
            className="gap-2"
            onClick={() => setActiveTool("merge")}
          >
            <ImageIcon className="w-4 h-4" />
            图片拼接
          </Button>

          <Button
            variant={activeTool === "rename" ? "default" : "secondary"}
            className="gap-2"
            onClick={() => setActiveTool("rename")}
          >
            <Wrench className="w-4 h-4" />
            批量重命名
          </Button>

          <Button
            variant={activeTool === "compress" ? "default" : "secondary"}
            className="gap-2"
            onClick={() => setActiveTool("compress")}
          >
            <Package2 className="w-4 h-4" />
            图片压缩
          </Button>
        </div>
      </div>

      {/* 内容 */}
      <div className="px-6 mt-6">
        {activeTool === "merge" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={onPickDir} className="gap-2" variant="secondary">
                <FolderOpen className="w-4 h-4" />
                选择图片文件夹
              </Button>

              <Button onClick={onPickFiles} className="gap-2" variant="secondary">
                <ImagesIcon className="w-4 h-4" />
                选择若干图片
              </Button>

              <Button
                onClick={onPickSave}
                className="gap-2"
                variant="secondary"
                title={hasApi ? "" : "浏览器模式将直接下载"}
              >
                <Save className="w-4 h-4" />
                选择保存位置
              </Button>

              <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="拼接方式" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="h">横向</SelectItem>
                  <SelectItem value="v">纵向</SelectItem>
                  <SelectItem value="grid">网格</SelectItem>
                </SelectContent>
              </Select>

              <Button className="gap-2" onClick={startMerge} disabled={!canStart}>
                <Rocket className="w-4 h-4" />
                开始拼接
              </Button>
            </div>

            <div className="text-slate-500">
              {status ||
                `已选：${raw.length} 张；源文件夹：${srcFolderName || "—"}；保存到：${
                  destDir || (hasApi ? "未选择" : "（浏览器将直接下载）")
                }`}
            </div>
          </div>
        )}

        {activeTool !== "merge" && (
          <div className="text-slate-500 mt-10">
            该工具即将上线：{activeTool === "rename" ? "批量重命名" : "图片压缩"}
          </div>
        )}
      </div>
    </div>
  )
}

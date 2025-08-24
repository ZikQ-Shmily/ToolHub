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

// ---------------- types & helpers ----------------
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
const toBlob = (u8: Uint8Array, type = "image/jpeg") =>
  new Blob([u8], { type })

const extOf = (name: string) => {
  const i = name.lastIndexOf(".")
  return i >= 0 ? name.slice(i).toLowerCase() : ""
}
const stemOf = (name: string) => {
  const i = name.lastIndexOf(".")
  return i >= 0 ? name.slice(0, i) : name
}

/** A1.jpg -> group "A"；B12_x.png -> "B"；没有前缀就用首字母 */
function groupKeyFromName(name: string): string {
  const stem = stemOf(name)
  // 取开头连续的英文字母作为组
  const m = /^[A-Za-z]+/.exec(stem)
  if (m && m[0]) return m[0].toUpperCase()
  // 退化：用第一个字符的大写
  return (stem[0] || "X").toUpperCase()
}

/** A2 -> 2, A10 -> 10, 默认 0，用于组内排序 */
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
  const loaded = await Promise.all(arr.map(loadOne))
  return loaded
}

/** 计算网格列数：尽量取接近正方形的分布 */
const gridColsFor = (n: number) => Math.ceil(Math.sqrt(n))

/** 把一组图片按模式合并成一张，返回 Blob(jpeg) */
async function mergeImages(loaded: LoadedImage[], mode: Mode): Promise<Blob> {
  if (loaded.length === 1) {
    // 单张直接回传
    const canvas = document.createElement("canvas")
    canvas.width = loaded[0].w
    canvas.height = loaded[0].h
    const ctx = canvas.getContext("2d")!
    ctx.drawImage(loaded[0].img, 0, 0)
    return new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.92)
    )
  }

  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")!

  if (mode === "h" || mode === "v") {
    // 横/纵：统一到同一高度或同一宽度再拼接
    if (mode === "h") {
      const targetH = Math.max(...loaded.map((x) => x.h))
      // 计算等比缩放后的宽度
      const scaled = loaded.map((x) => {
        const scale = targetH / x.h
        return { ...x, dw: Math.round(x.w * scale), dh: targetH }
      })
      const totalW = scaled.reduce((s, x) => s + x.dw, 0)
      canvas.width = totalW
      canvas.height = targetH
      let x0 = 0
      for (const it of scaled) {
        ctx.drawImage(it.img, x0, 0, it.dw, it.dh)
        x0 += it.dw
      }
    } else {
      const targetW = Math.max(...loaded.map((x) => x.w))
      const scaled = loaded.map((x) => {
        const scale = targetW / x.w
        return { ...x, dw: targetW, dh: Math.round(x.h * scale) }
      })
      const totalH = scaled.reduce((s, x) => s + x.dh, 0)
      canvas.width = targetW
      canvas.height = totalH
      let y0 = 0
      for (const it of scaled) {
        ctx.drawImage(it.img, 0, y0, it.dw, it.dh)
        y0 += it.dh
      }
    }
  } else {
    // 网格：尽量均匀铺满
    const cols = gridColsFor(loaded.length)
    const rows = Math.ceil(loaded.length / cols)
    // 以每格的最大宽高对齐
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

  return new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.92)
  )
}

// ---------------- main component ----------------

export default function App() {
  // 工具切换（先保留占位，后续可以接入其他工具）
  const [activeTool, setActiveTool] = useState<"merge" | "rename" | "compress">(
    "merge"
  )

  // 选择与保存
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

  // 选择：图片文件夹
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
    setStatus(`已选择：${list.items.length} 张图片；源文件夹：${srcFolderName}`)
  }

  // 选择：若干图片
  const onPickFiles = async () => {
    if (!hasApi) {
      // 浏览器环境直接提示会下载
      alert("浏览器模式：只能处理并下载合并结果，不能选择文件夹/保存到目录。")
    }
    const r = hasApi ? await window.api!.pickImageFiles() : { canceled: true }
    if (r.canceled) return
    if (r.items && r.items.length) {
      setRaw(r.items)
      setSrcFolderName(r.srcFolderName || "手动选择")
      setStatus(`已选择：${r.items.length} 张图片；源：${r.srcFolderName || "手动选择"}`)
    }
  }

  // 选择保存位置
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

  // 分组
  function buildGroups(list: RawImage[]) {
    const map = new Map<string, RawImage[]>()
    for (const it of list) {
      const key = groupKeyFromName(it.name)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(it)
    }
    // 组内排序（按数字）
    for (const [k, arr] of map) {
      arr.sort((a, b) => serialFromName(a.name) - serialFromName(b.name))
      // 至少两张才保留
      if (arr.length < 2) map.delete(k)
    }
    return map
  }

  // 合并
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
        // 浏览器降级：直接触发下载
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

  // ---------------- render ----------------

  return (
    <div className="w-full h-[100vh] overflow-hidden bg-slate-50">
      {/* 顶部：标题与面包屑 */}
      <div className="px-6 pt-6">
        <div className="flex items-center gap-2 text-slate-800">
          <AppWindow className="w-6 h-6" />
          <h1 className="text-2xl font-bold">工具合集</h1>
          <span className="text-slate-400">/</span>
          <ImageIcon className="w-5 h-5 text-slate-700" />
          <h2 className="text-xl font-semibold">图片拼接</h2>

          {/* 只在图片拼接功能显示的提示图标（原规则） */}
          <Info
            className="w-4 h-4 ml-2 text-slate-500 cursor-help"
            title={tipText}
          />
        </div>

        {/* 工具切换（当前页高亮，其它占位） */}
        <div className="mt-5 flex flex-wrap gap-3">
          <Button
            variant="default"
            className="gap-2"
            onClick={() => setActiveTool("merge")}
          >
            <ImageIcon className="w-4 h-4" />
            图片拼接
          </Button>

          <Button
            variant="secondary"
            className="gap-2"
            onClick={() => setActiveTool("rename")}
          >
            <Wrench className="w-4 h-4" />
            批量重命名
          </Button>

          <Button
            variant="secondary"
            className="gap-2"
            onClick={() => setActiveTool("compress")}
          >
            <Package2 className="w-4 h-4" />
            图片压缩
          </Button>
        </div>
      </div>

      {/* 内容区域 */}
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

              <Select
                value={mode}
                onValueChange={(v) => setMode(v as Mode)}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="拼接方式" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="h">横向</SelectItem>
                  <SelectItem value="v">纵向</SelectItem>
                  <SelectItem value="grid">网格</SelectItem>
                </SelectContent>
              </Select>

              <Button
                className="gap-2"
                onClick={startMerge}
                disabled={!canStart}
              >
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

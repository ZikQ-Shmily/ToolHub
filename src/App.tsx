import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import RenameTool from "@/tools/RenameTool"
import { AppWindow, Image as ImageIcon, Wrench, Package2 } from "lucide-react"
import ImageMergeTool from "@/tools/ImageMergeTool"

export default function App() {
  const [activeTool, setActiveTool] = useState<"merge" | "rename" | "compress">("merge")

  const toolMeta = {
    merge: { icon: ImageIcon, label: "图片拼接" },
    rename: { icon: Wrench, label: "文件重命名" },
    compress: { icon: Package2, label: "图片压缩" },
  } as const

  const CurrentIcon = toolMeta[activeTool].icon
  const currentLabel = toolMeta[activeTool].label

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
        </div>

        {/* 工具切换 */}
        <div className="mt-5 flex flex-wrap gap-3">
          <Button variant={activeTool === "merge" ? "default" : "secondary"} onClick={() => setActiveTool("merge")}>
            <ImageIcon className="w-4 h-4 mr-1" /> 图片拼接
          </Button>
          <Button variant={activeTool === "rename" ? "default" : "secondary"} onClick={() => setActiveTool("rename")}>
            <Wrench className="w-4 h-4 mr-1" /> 文件重命名
          </Button>
          <Button variant={activeTool === "compress" ? "default" : "secondary"} onClick={() => setActiveTool("compress")}>
            <Package2 className="w-4 h-4 mr-1" /> 图片压缩
          </Button>
        </div>
      </div>

      {/* 内容 */}
      <div className="px-6 mt-6">
        {activeTool === "merge" && <ImageMergeTool />}
        {activeTool === "rename" && <RenameTool />}
        {activeTool === "compress" && <div className="text-slate-500 mt-10">该工具即将上线：图片压缩</div>}
      </div>
    </div>
  )
}

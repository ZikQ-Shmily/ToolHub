import React, { useMemo, useState } from 'react'
import { Camera, Wrench, Layers3, AlertCircle, LayoutGrid } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import ImageMergeTool from '@/tools/ImageMergeTool'
import ComingSoon from '@/tools/ComingSoon'

type ToolKey = 'merge' | 'rename' | 'compress'

const TOOL_META: Record<
  ToolKey,
  { name: string; icon: React.ComponentType<any>; help?: React.ReactNode; comp: React.ComponentType }
> = {
  merge: {
    name: '图片拼接',
    icon: Camera,
    help: (
      <div>
        <div className="font-semibold mb-1">图片命名规则</div>
        <ul className="list-disc pl-4 space-y-1">
          <li>同组以相同<b>字母前缀</b>：A1.jpg、A2.jpg、A3.jpg → <b>A.jpg</b></li>
          <li>每组<b>数量 ≥ 2</b> 才会拼接，按<b>数字升序</b>。</li>
          <li>支持格式：jpg / jpeg / png。</li>
          <li>保存到：<code>保存目录\原文件夹名_已拼接\</code></li>
          <li>拼接方式：横向 / 纵向 / 网格（网格按数量<b>自动列数</b>）。</li>
        </ul>
      </div>
    ),
    comp: ImageMergeTool,
  },
  // 其他工具目前不显示提示；需要时把 help 填上即可
  rename: { name: '批量重命名', icon: Wrench, comp: ComingSoon },
  compress: { name: '图片压缩', icon: Layers3, comp: ComingSoon },
}

export default function App() {
  const [active, setActive] = useState<ToolKey>('merge')
  const meta = TOOL_META[active]
  const Icon = meta.icon
  const ToolComp = meta.comp

  const Nav = useMemo(
    () => (
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['merge', '图片拼接', Camera],
            ['rename', '批量重命名', Wrench],
            ['compress', '图片压缩', Layers3],
          ] as const
        ).map(([key, label, Ico]) => (
          <Button
            key={key}
            variant={active === key ? 'default' : 'secondary'}
            onClick={() => setActive(key as ToolKey)}
            className="gap-2"
          >
            <Ico className="h-4 w-4" />
            {label}
          </Button>
        ))}
      </div>
    ),
    [active]
  )

  return (
    <div className="h-screen w-screen overflow-auto">
      <Card className="relative h-full w-full rounded-none border-0 shadow-none">
        <CardHeader>
          <CardTitle className="text-2xl flex items-center gap-2">
            <LayoutGrid className="h-6 w-6" />
            工具合集
            <span className="text-base text-muted-foreground">/</span>
            <Icon className="h-5 w-5" />
            <span className="text-xl">{meta.name}</span>

            {/* ✅ 仅当当前工具有 help 时显示；并贴在标题后 */}
            {meta.help && (
              <span className="relative group ml-2 align-middle">
                <AlertCircle className="h-4 w-4 text-gray-500 hover:text-gray-700 cursor-help" />
                <div
                  role="tooltip"
                  className="pointer-events-none absolute left-0 mt-2 hidden w-[380px] rounded-md border bg-white/95 p-3 text-sm text-gray-700 shadow-xl group-hover:block"
                >
                  {meta.help}
                </div>
              </span>
            )}
          </CardTitle>
        </CardHeader>

        <CardContent className="flex h-full flex-col gap-4 p-6 md:p-8">
          {Nav}
          <div className="mt-2">
            <ToolComp />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

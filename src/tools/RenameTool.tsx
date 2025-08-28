// src/tools/RenameTool.tsx
import React, { useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { ArrowDown, ArrowUp, FilePlus2, Trash2, RefreshCw, FolderOpen } from 'lucide-react'

const api: any = (window as any).api

type FileRow = {
  path: string
  name: string
  dir: string
  ext: string
}

type CaseOption =
  | 'none'
  | 'nameLower'
  | 'nameUpper'
  | 'extLower'
  | 'extUpper'
  | 'bothLower'
  | 'bothUpper'

function toAlpha(n: number, upper = false) {
  let num = Math.max(1, n)
  let s = ''
  while (num > 0) {
    num--
    s = String.fromCharCode(97 + (num % 26)) + s
    num = Math.floor(num / 26)
  }
  return upper ? s.toUpperCase() : s
}

function applyCase(name: string, ext: string, opt: CaseOption) {
  let n = name
  let e = ext
  switch (opt) {
    case 'nameLower': n = n.toLowerCase(); break
    case 'nameUpper': n = n.toUpperCase(); break
    case 'extLower':  e = e.toLowerCase(); break
    case 'extUpper':  e = e.toUpperCase(); break
    case 'bothLower': n = n.toLowerCase(); e = e.toLowerCase(); break
    case 'bothUpper': n = n.toUpperCase(); e = e.toUpperCase(); break
  }
  return { n, e }
}

type Mode = 'overall' | 'replace' | 'addremove'

function parsePath(p: string, nameFromApi?: string) {
  const norm = p.replace(/\\/g, '/')
  const parts = norm.split('/')
  const name = nameFromApi || parts.pop() || ''
  const dir = parts.join('/')
  const ext = name.includes('.') ? '.' + name.split('.').pop() : ''
  return { dir, name, ext }
}

export default function RenameTool() {
  const [files, setFiles] = useState<FileRow[]>([])
  const [selected, setSelected] = useState<number[]>([])
  const [mode, setMode] = useState<Mode>('overall')

  const [pattern, setPattern] = useState<string>('*')
  const [startAt, setStartAt] = useState<number>(1)
  const [step, setStep] = useState<number>(1)
  const [digits, setDigits] = useState<number>(2)
  const [alphaMode, setAlphaMode] = useState<boolean>(false)
  const [alphaUpper, setAlphaUpper] = useState<boolean>(false)
  const [changeExt, setChangeExt] = useState<string>('')

  const [caseOpt, setCaseOpt] = useState<CaseOption>('none')

  const [findText, setFindText] = useState<string>('')
  const [replaceText, setReplaceText] = useState<string>('')

  const [prefix, setPrefix] = useState<string>('')
  const [suffix, setSuffix] = useState<string>('')
  const [delText, setDelText] = useState<string>('')

  // 浏览器兜底：选择整个文件夹
  const folderInputRef = useRef<HTMLInputElement>(null)

  const rows = useMemo(() => files.map((f, i) => ({ ...f, index: i })), [files])

  async function onAddFiles() {
    if (!api?.pickAnyFiles) return
    const res = await api.pickAnyFiles()
    if (res?.canceled) return
    const list = res.items || res.files || []
    if (!list.length) return

    const toAdd: FileRow[] = list.map((it: any) => {
      const { dir, name, ext } = parsePath(it.path, it.name)
      return { path: it.path, name, dir, ext }
    })
    setFiles(prev => {
      const exists = new Set(prev.map(p => p.path))
      return [...prev, ...toAdd.filter(f => !exists.has(f.path))]
    })
  }

  // 新增：递归添加整个文件夹
  async function onAddFolder() {
    // ① 推荐：主进程提供 pickFolderAndListFiles（递归枚举）
    if (api?.pickFolderAndListFiles) {
      const res = await api.pickFolderAndListFiles()
      if (res?.canceled) return
      const list = res.items || []
      const toAdd: FileRow[] = list.map((it: any) => {
        const p = it.path || it.filePath || it.fullPath || it
        const { dir, name, ext } = parsePath(p, it.name)
        return { path: p, name, dir, ext }
      })
      setFiles(prev => {
        const seen = new Set(prev.map(p => p.path))
        return [...prev, ...toAdd.filter(f => !seen.has(f.path))]
      })
      return
    }

    // ② 兼容：已有分开的目录选择 + 读文件 API
    if (api?.pickAnyDir && api?.readFilesInDir) {
      const r = await api.pickAnyDir()
      if (r?.canceled) return
      const dir = r.dir || r.path
      const rr = await api.readFilesInDir(dir) // 期望返回 { items: Array<{path,name}> }
      const entries: any[] = rr?.items || rr?.files || []
      const toAdd: FileRow[] = entries.map((it: any) => {
        const p = it.path || it
        const { dir, name, ext } = parsePath(p, it.name)
        return { path: p, name, dir, ext }
      })
      setFiles(prev => {
        const seen = new Set(prev.map(p => p.path))
        return [...prev, ...toAdd.filter(f => !seen.has(f.path))]
      })
      return
    }

    // ③ 浏览器兜底：input[webkitdirectory]
    folderInputRef.current?.click()
  }

  async function onLocalFolder(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files || [])
    if (!picked.length) return
    const toAdd: FileRow[] = picked.map((f: any) => {
      // 浏览器拿不到真实路径，用 webkitRelativePath 做“展示路径”
      const pseudo = f.webkitRelativePath || f.name
      const { dir, name, ext } = parsePath(pseudo, f.name)
      return { path: pseudo, name, dir, ext }
    })
    setFiles(prev => {
      const seen = new Set(prev.map(p => p.path))
      return [...prev, ...toAdd.filter(f => !seen.has(f.path))]
    })
    e.target.value = ''
  }

  function onRemoveSelected() {
    if (!selected.length) return
    const setSel = new Set(selected)
    setFiles(prev => prev.filter((_, idx) => !setSel.has(idx)))
    setSelected([])
  }

  function move(direction: 'up' | 'down') {
    if (selected.length !== 1) return
    const idx = selected[0]
    const to = direction === 'up' ? idx - 1 : idx + 1
    if (to < 0 || to >= files.length) return
    const next = [...files]
    const t = next[idx]; next[idx] = next[to]; next[to] = t
    setFiles(next)
    setSelected([to])
  }

  function buildPreview(row: FileRow, orderIndex: number) {
    let base = row.name.replace(/\.[^.]*$/, '')
    let ext = row.ext.replace(/^\./, '')
    const seqNum = startAt + orderIndex * step
    const token = alphaMode ? toAlpha(seqNum, alphaUpper) : String(seqNum).padStart(digits, '0')

    if (mode === 'overall') {
      let out = pattern
      out = out.replace(/\*/g, base)
      out = out.replace(/#+/g, token)
      base = out
      if (changeExt.trim()) ext = changeExt.replace(/^\./, '')
    } else if (mode === 'replace') {
      if (findText) base = base.split(findText).join(replaceText)
    } else if (mode === 'addremove') {
      base = prefix + base + suffix
      if (delText) base = base.split(delText).join('')
    }

    const { n, e } = applyCase(base, ext, caseOpt)
    const fileName = e ? `${n}.${e}` : n
    const sep = row.dir.includes('/') ? '/' : '\\'
    const to = row.dir ? `${row.dir}${sep}${fileName}` : fileName
    return { fileName, to }
  }

  const preview = useMemo(() => {
    return rows.map((r, i) => buildPreview(r, i))
  }, [rows, pattern, startAt, step, digits, alphaMode, alphaUpper, changeExt, mode, findText, replaceText, prefix, suffix, delText, caseOpt])

  async function doRename() {
    if (!files.length || !api?.renameFiles) return
    const items = files.map((f, i) => ({ from: f.path, to: preview[i].to }))
    const res: any = await api.renameFiles(items)

    const list = Array.isArray(res?.results) ? res.results : items
    const mapped = new Map(list.map((r: any) => [r.from, r.to]))

    const next = files.map(f => {
      const target = mapped.get(f.path) || f.path
      const { dir, name, ext } = parsePath(target)
      return { path: target, name, dir, ext }
    })
    setFiles(next)
  }

  return (
    <Card className="w-full">
      <CardContent className="pt-6 space-y-4">
        {/* 顶部工具栏 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          <div className="col-span-1 lg:col-span-2">
            <div className="flex flex-wrap gap-2">
              <Button onClick={onAddFiles} variant="secondary">
                <FilePlus2 className="mr-2 h-4 w-4" /> 添加
              </Button>
              <Button onClick={onAddFolder} variant="secondary">
                <FolderOpen className="mr-2 h-4 w-4" /> 添加文件夹
              </Button>
              <Button onClick={() => move('up')} variant="ghost">
                <ArrowUp className="mr-2 h-4 w-4" /> 上移
              </Button>
              <Button onClick={() => move('down')} variant="ghost">
                <ArrowDown className="mr-2 h-4 w-4" /> 下移
              </Button>
              <Button onClick={onRemoveSelected} variant="destructive">
                <Trash2 className="mr-2 h-4 w-4" /> 移除
              </Button>
            </div>
          </div>
          <div className="col-span-1">
            <Button onClick={doRename} className="px-6 w-fit">
              <RefreshCw className="mr-2 h-4 w-4" /> 开始重命名
            </Button>
          </div>
        </div>

        {/* 规则设置 + 说明 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          <div className="space-y-3">
            <Label>重命名模式</Label>
            <Select value={mode} onValueChange={v => setMode(v as Mode)}>
              <SelectTrigger><SelectValue placeholder="选择模式" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="overall">整体</SelectItem>
                <SelectItem value="replace">替换</SelectItem>
                <SelectItem value="addremove">添加/删除</SelectItem>
              </SelectContent>
            </Select>

            {mode === 'overall' && (
              <div className="space-y-2">
                <Label>命名规则（* = 原名，# = 编号）</Label>
                <Input value={pattern} onChange={e => setPattern(e.target.value)} placeholder="例如：*_# 或 “身份证_#”" />
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label>开始于</Label>
                    <Input type="number" value={startAt} onChange={e => setStartAt(parseInt(e.target.value || '1'))} />
                  </div>
                  <div>
                    <Label>增量</Label>
                    <Input type="number" value={step} onChange={e => setStep(parseInt(e.target.value || '1'))} />
                  </div>
                  <div>
                    <Label>位数</Label>
                    <Input type="number" value={digits} onChange={e => setDigits(parseInt(e.target.value || '1'))} />
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Checkbox checked={alphaMode} onCheckedChange={v => setAlphaMode(Boolean(v))} />
                    <span>字母编号</span>
                  </div>
                  <Select value={alphaUpper ? 'upper' : 'lower'} onValueChange={v => setAlphaUpper(v === 'upper')} disabled={!alphaMode}>
                    <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lower">小写</SelectItem>
                      <SelectItem value="upper">大写</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>扩展名改成（可空）</Label>
                  <Input value={changeExt} onChange={e => setChangeExt(e.target.value)} placeholder="不填=不变，例如：jpg、png" />
                </div>
              </div>
            )}

            {mode === 'replace' && (
              <div className="space-y-2">
                <Label>把</Label>
                <Input value={findText} onChange={e => setFindText(e.target.value)} placeholder="要替换的文本" />
                <Label>替换成</Label>
                <Input value={replaceText} onChange={e => setReplaceText(e.target.value)} placeholder="新的文本" />
              </div>
            )}

            {mode === 'addremove' && (
              <div className="space-y-2">
                <Label>文件名前添加</Label>
                <Input value={prefix} onChange={e => setPrefix(e.target.value)} />
                <Label>文件名后添加</Label>
                <Input value={suffix} onChange={e => setSuffix(e.target.value)} />
                <Label>删除文件名中的</Label>
                <Input value={delText} onChange={e => setDelText(e.target.value)} placeholder="留空=不删" />
              </div>
            )}
          </div>

          <div className="space-y-3">
            <Label>文件名大小写选项</Label>
            <Select value={caseOpt} onValueChange={v => setCaseOpt(v as CaseOption)}>
              <SelectTrigger><SelectValue placeholder="不改变" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">不改变</SelectItem>
                <SelectItem value="nameLower">仅文件名小写</SelectItem>
                <SelectItem value="nameUpper">仅文件名大写</SelectItem>
                <SelectItem value="extLower">仅扩展名小写</SelectItem>
                <SelectItem value="extUpper">仅扩展名大写</SelectItem>
                <SelectItem value="bothLower">文件名+扩展名小写</SelectItem>
                <SelectItem value="bothUpper">文件名+扩展名大写</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 右侧提示小卡片（与拼接工具风格一致） */}
          <div className="rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground space-y-2">
            <div className="font-medium">命名规则提示</div>
            <ul className="list-disc pl-5 space-y-1">
              <li>整体：<code>*</code> 代表原文件名（不含扩展名），<code>#</code> 代表编号（位数可设）。</li>
              <li>勾选“字母编号”后，<code>#</code> 用 a、b、...、aa 表示；可选大/小写。</li>
              <li>扩展名留空则不改变，填 <code>jpg</code>、<code>png</code> 等可修改。</li>
              <li>替换/添加/删除模式仅操作“文件名”部分（不含扩展名）。</li>
            </ul>
          </div>
        </div>

        {/* 文件列表 + 预览 */}
        <div className="overflow-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="p-2 w-10"></th>
                <th className="p-2 text-left">原文件名</th>
                <th className="p-2 text-left">预览</th>
                <th className="p-2 text-left">结果路径</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const p = preview[i]
                const checked = selected.includes(i)
                return (
                  <tr key={r.path} className="border-t">
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={e => {
                          setSelected(prev => {
                            if (e.target.checked) return Array.from(new Set([...prev, i]))
                            return prev.filter(x => x !== i)
                          })
                        }}
                      />
                    </td>
                    <td className="p-2">{r.name}</td>
                    <td className="p-2 text-blue-700">{p.fileName}</td>
                    <td className="p-2 text-muted-foreground">{p.to}</td>
                  </tr>
                )
              })}
              {!rows.length && (
                <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">列表中暂无文件，点击“添加”或“添加文件夹”。</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 浏览器兜底：选择文件夹（不会出现在 Electron 打包版 UI 中） */}
        <input
          ref={folderInputRef}
          type="file"
          multiple
          // @ts-ignore
          webkitdirectory=""
          hidden
          onChange={onLocalFolder}
        />
      </CardContent>
    </Card>
  )
}

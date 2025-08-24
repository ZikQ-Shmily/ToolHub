export type Layout = 'horizontal' | 'vertical' | 'grid'

export interface MergeOptions {
  layout: Layout
  gap: number               // 间距（像素）
  bgColor: string           // 画布背景色
  cols?: number             // 网格列数（可选，未传则自动取 √n 向上取整）
  targetWidth?: number      // 目标宽（像素，可选）
  targetHeight?: number     // 目标高（像素，可选）
  format: 'image/png' | 'image/jpeg'
  quality: number           // JPEG 质量 0~1
}

export interface LoadedImage { src: string; bmp: ImageBitmap; w: number; h: number }

export async function loadFiles(files: File[]): Promise<LoadedImage[]> {
  const list: LoadedImage[] = []
  for (const f of files) {
    const url = URL.createObjectURL(f)
    const bmp = await createImageBitmap(await (await fetch(url)).blob())
    list.push({ src: f.name, bmp, w: bmp.width, h: bmp.height })
  }
  return list
}

export async function mergeImages(items: LoadedImage[], opts: MergeOptions): Promise<Blob> {
  if (!items.length) throw new Error('没有图片')

  const n = items.length
  const gap = Math.max(0, opts.gap || 0)

  // 画布自然尺寸（未缩放前）
  let naturalW = 0
  let naturalH = 0

  // 为绘制准备好的目标尺寸（未缩放前）
  const dws: number[] = []
  const dhs: number[] = []

  if (opts.layout === 'horizontal') {
    // 按一行拼接：把所有图片高度统一为最大高度，再按比例计算每张的目标宽度
    const rowH = Math.max(...items.map(i => i.h))
    for (const it of items) {
      const s = rowH / it.h
      const dw = it.w * s
      dws.push(dw)
      dhs.push(rowH)
    }
    naturalH = rowH
    naturalW = dws.reduce((a, b) => a + b, 0) + gap * (n - 1)

  } else if (opts.layout === 'vertical') {
    // 按一列拼接：把所有图片宽度统一为最大宽度，再按比例计算每张的目标高度
    const colW = Math.max(...items.map(i => i.w))
    for (const it of items) {
      const s = colW / it.w
      const dh = it.h * s
      dws.push(colW)
      dhs.push(dh)
    }
    naturalW = colW
    naturalH = dhs.reduce((a, b) => a + b, 0) + gap * (n - 1)

  } else {
    // 网格：先按列取最大宽，按行取最大高，再求和得到自然尺寸
    const cols = Math.max(1, opts.cols ?? Math.ceil(Math.sqrt(n)))
    const rows = Math.ceil(n / cols)

    // 每列最大宽、每行最大高
    const colW: number[] = Array(cols).fill(0)
    const rowH: number[] = Array(rows).fill(0)

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c
        if (idx >= n) break
        const it = items[idx]
        colW[c] = Math.max(colW[c], it.w)
        rowH[r] = Math.max(rowH[r], it.h)
      }
    }

    naturalW = colW.reduce((a, b) => a + b, 0) + gap * (cols - 1)
    naturalH = rowH.reduce((a, b) => a + b, 0) + gap * (rows - 1)

    // 预存每格内将要绘制的目标 w/h（未整体缩放前）
    // 这里先填占位，绘制时再依各格计算等比缩放
    for (let i = 0; i < n; i++) { dws[i] = 0; dhs[i] = 0 }
  }

  // 根据 targetWidth / targetHeight 计算整体缩放因子
  let scale = 1
  if (opts.targetWidth && opts.targetHeight) {
    scale = Math.min(opts.targetWidth / naturalW, opts.targetHeight / naturalH)
  } else if (opts.targetWidth) {
    scale = opts.targetWidth / naturalW
  } else if (opts.targetHeight) {
    scale = opts.targetHeight / naturalH
  }
  const canvasW = Math.max(1, Math.round(naturalW * scale))
  const canvasH = Math.max(1, Math.round(naturalH * scale))

  // 准备画布
  const canvas = document.createElement('canvas')
  canvas.width = canvasW
  canvas.height = canvasH
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.fillStyle = opts.bgColor
  ctx.fillRect(0, 0, canvasW, canvasH)

  const draw = (bmp: ImageBitmap, dx: number, dy: number, dw: number, dh: number) => {
    ctx.drawImage(bmp, 0, 0, bmp.width, bmp.height, Math.round(dx), Math.round(dy), Math.round(dw), Math.round(dh))
  }

  const gapS = gap * scale

  if (opts.layout === 'horizontal') {
    let x = 0
    for (let i = 0; i < n; i++) {
      const dw = dws[i] * scale
      const dh = dhs[i] * scale // 与 canvasH 相等
      draw(items[i].bmp, x, 0, dw, dh)
      x += dw + (i < n - 1 ? gapS : 0)
    }

  } else if (opts.layout === 'vertical') {
    let y = 0
    for (let i = 0; i < n; i++) {
      const dw = dws[i] * scale // 与 canvasW 相等
      const dh = dhs[i] * scale
      draw(items[i].bmp, 0, y, dw, dh)
      y += dh + (i < n - 1 ? gapS : 0)
    }

  } else {
    // 网格绘制
    const cols = Math.max(1, opts.cols ?? Math.ceil(Math.sqrt(n)))
    const rows = Math.ceil(n / cols)

    // 再次计算列宽和行高（与上面一致）
    const colW: number[] = Array(cols).fill(0)
    const rowH: number[] = Array(rows).fill(0)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c
        if (idx >= n) break
        const it = items[idx]
        colW[c] = Math.max(colW[c], it.w)
        rowH[r] = Math.max(rowH[r], it.h)
      }
    }

    // 等比例整体缩放到目标画布尺寸
    const s = scale
    const colWS = colW.map(w => w * s)
    const rowHS = rowH.map(h => h * s)

    let y = 0
    let idx = 0
    for (let r = 0; r < rows; r++) {
      let x = 0
      for (let c = 0; c < cols; c++) {
        if (idx >= n) break
        const it = items[idx++]
        const cellW = colWS[c]
        const cellH = rowHS[r]
        // 将图片等比缩放“塞入”格子并居中
        const rs = Math.min(cellW / it.w, cellH / it.h)
        const dw = it.w * rs
        const dh = it.h * rs
        const dx = x + Math.round((cellW - dw) / 2)
        const dy = y + Math.round((cellH - dh) / 2)
        draw(it.bmp, dx, dy, dw, dh)
        x += cellW + (c < cols - 1 ? gapS : 0)
      }
      y += rowHS[r] + (r < rows - 1 ? gapS : 0)
    }
  }

  return await new Promise<Blob>(res => canvas.toBlob(b => res(b!), opts.format, opts.quality))
}

export async function blobToArrayBuffer(blob: Blob) {
  return await blob.arrayBuffer()
}

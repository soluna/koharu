'use client'

// Deliberate divergence from "translation is the only visible text": the source page here is
// a read-only comparison reference. It never enters a rendered or exported frame, so the
// visible output remains translation-only.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { usePage, useSourceImage } from '@/lib/queries'
import { useKoharuStore } from '@/lib/store'

interface Rects {
  leftW: number
  leftH: number
  rightW: number
  rightH: number
  dpr: number
}

const emptyRects: Rects = { leftW: 0, leftH: 0, rightW: 0, rightH: 0, dpr: 1 }

export function SourcePreview() {
  const { t } = useTranslation()
  const page = usePage().data
  const sourceBytes = useSourceImage(page?.id).data
  const camera = useKoharuStore((state) => state.camera)
  const rootRef = useRef<HTMLDivElement>(null)
  const [source, setSource] = useState<string | null>(null)
  const [rects, setRects] = useState<Rects>(emptyRects)

  useEffect(() => {
    if (!sourceBytes) {
      setSource(null)
      return
    }
    const mime = detectMime(sourceBytes)
    const url = URL.createObjectURL(new Blob([sourceBytes.buffer], { type: mime }))
    setSource(url)
    return () => {
      URL.revokeObjectURL(url)
    }
  }, [sourceBytes])

  const readRects = useCallback(() => {
    const root = rootRef.current
    if (!root) return
    const left = root.getBoundingClientRect()
    const right = document
      .querySelector('[data-compare-pane="canvas"]')
      ?.getBoundingClientRect()
    setRects({
      leftW: left.width,
      leftH: left.height,
      rightW: right?.width ?? 0,
      rightH: right?.height ?? 0,
      dpr: window.devicePixelRatio || 1,
    })
  }, [])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    let observedRight: Element | null = null
    const observer = new ResizeObserver(() => readRects())
    const refresh = () => {
      const right = document.querySelector('[data-compare-pane="canvas"]')
      if (right !== observedRight) {
        if (observedRight) observer.unobserve(observedRight)
        if (right) observer.observe(right)
        observedRight = right
      }
      readRects()
    }
    observer.observe(root)
    refresh()
    window.addEventListener('resize', refresh)
    window.visualViewport?.addEventListener('resize', refresh)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', refresh)
      window.visualViewport?.removeEventListener('resize', refresh)
    }
  }, [readRects])

  const pageWidth = page?.size.width ?? 0
  const pageHeight = page?.size.height ?? 0
  const {
    leftW: leftCssW,
    leftH: leftCssH,
    rightW: rightCssW,
    rightH: rightCssH,
    dpr,
  } = rects
  const { zoom, translation } = camera

  // Synchronize with the WebGPU canvas camera. The camera translation is stored in physical
  // pixels and was fitted against the right viewport only, so it cannot be reused verbatim:
  // the left and right panes have different widths. Reproject the page-center offset onto the
  // left viewport. The *W/*H/*Tx values below are physical pixels; the final CSS values divide
  // by dpr. dpr is captured as window.devicePixelRatio || 1 on every measurement.
  //
  //   rightW  = rightRect.width  * dpr ; rightH = rightRect.height * dpr
  //   leftW   = leftRect.width   * dpr ; leftH  = leftRect.height  * dpr
  //   pw      = pageWidth  * zoom      ; ph     = pageHeight * zoom
  //   offsetX = translation[0] + pw / 2 - rightW / 2
  //   offsetY = translation[1] + ph / 2 - rightH / 2
  //   leftTx  = leftW / 2 - pw / 2 + offsetX ; leftTy = leftH / 2 - ph / 2 + offsetY
  //   cssTx   = leftTx / dpr ; cssTy = leftTy / dpr ; cssW = pw / dpr ; cssH = ph / dpr
  // The width/height already encode zoom, so no extra scale() is applied. maxWidth:none below
  // overrides the Tailwind Preflight cap so a zoomed page is never clamped to the viewport.
  const rightW = rightCssW * dpr
  const rightH = rightCssH * dpr
  const leftW = leftCssW * dpr
  const leftH = leftCssH * dpr
  const pw = pageWidth * zoom
  const ph = pageHeight * zoom
  const offsetX = translation[0] + pw / 2 - rightW / 2
  const offsetY = translation[1] + ph / 2 - rightH / 2
  const leftTx = leftW / 2 - pw / 2 + offsetX
  const leftTy = leftH / 2 - ph / 2 + offsetY
  const cssTx = leftTx / dpr
  const cssTy = leftTy / dpr
  const cssW = pw / dpr
  const cssH = ph / dpr

  const hasFrame =
    source !== null &&
    pageWidth > 0 &&
    pageHeight > 0 &&
    leftCssW > 0 &&
    leftCssH > 0 &&
    rightCssW > 0 &&
    rightCssH > 0 &&
    dpr > 0 &&
    Number.isFinite(zoom) &&
    zoom > 0
  const placeable =
    hasFrame && [cssTx, cssTy, cssW, cssH].every((value) => Number.isFinite(value))

  // A missing locale key would otherwise surface the raw key as visible alt text.
  const label = t('canvas.compareView')
  const alt = label === 'canvas.compareView' ? '' : label

  return (
    <div
      ref={rootRef}
      className='relative h-full w-full overflow-hidden bg-[var(--surface-canvas)]'
    >
      {placeable && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={source ?? undefined}
          alt={alt}
          draggable={false}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: `${cssW}px`,
            height: `${cssH}px`,
            maxWidth: 'none',
            transform: `translate(${cssTx}px, ${cssTy}px)`,
            transformOrigin: '0 0',
            userSelect: 'none',
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  )
}

function detectMime(bytes: Uint8Array): string {
  const matches = (offset: number, tag: string) => {
    for (let index = 0; index < tag.length; index += 1) {
      if (bytes[offset + index] !== tag.charCodeAt(index)) return false
    }
    return true
  }
  if (matches(0, '\x89PNG')) return 'image/png'
  if (matches(0, '\xff\xd8\xff')) return 'image/jpeg'
  if (matches(0, 'RIFF') && matches(8, 'WEBP')) return 'image/webp'
  if (matches(0, 'GIF8')) return 'image/gif'
  if (matches(0, 'BM')) return 'image/bmp'
  if (matches(4, 'ftyp')) {
    for (let offset = 8; offset + 4 <= Math.min(bytes.length, 64); offset += 4) {
      if (matches(offset, 'avif') || matches(offset, 'avis')) return 'image/avif'
    }
  }
  return ''
}

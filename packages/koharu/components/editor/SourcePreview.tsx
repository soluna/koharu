'use client'

// Deliberate divergence from "translation is the only visible text": the source page here is
// a read-only comparison reference. It never enters a rendered or exported frame, so the
// visible output remains translation-only.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { usePage, useSourceImage } from '@/lib/queries'
import { useKoharuStore } from '@/lib/store'

interface Geometry {
  insetX: number
  insetY: number
  dpr: number
  ready: boolean
}

const emptyGeometry: Geometry = { insetX: 0, insetY: 0, dpr: 1, ready: false }

export function SourcePreview() {
  const { t } = useTranslation()
  const page = usePage().data
  const sourceBytes = useSourceImage(page?.id).data
  const camera = useKoharuStore((state) => state.camera)
  const rootRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const [source, setSource] = useState<string | null>(null)
  const [geometry, setGeometry] = useState<Geometry>(emptyGeometry)

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

  // The camera is fitted against the WebGPU surface, which sits below the command bar and
  // beside the tool rail. Our frame mirrors that chrome (same 40px header / 28px footer) so
  // the residual insets below are normally zero, but they are measured rather than assumed:
  // the translated pane can change its internal layout without desynchronizing the pages.
  const measure = useCallback(() => {
    const root = rootRef.current
    const frame = frameRef.current
    const pane = document.querySelector<HTMLElement>('[data-compare-pane="canvas"]')
    if (!root || !frame || !pane) return
    const surface = pane.querySelector('canvas') ?? pane
    const paneRect = pane.getBoundingClientRect()
    const surfaceRect = surface.getBoundingClientRect()
    const frameRect = frame.getBoundingClientRect()
    const rootRect = root.getBoundingClientRect()
    setGeometry({
      insetX: surfaceRect.left - paneRect.left - (frameRect.left - rootRect.left),
      insetY: surfaceRect.top - paneRect.top - (frameRect.top - rootRect.top),
      dpr: window.devicePixelRatio || 1,
      ready:
        surfaceRect.width > 0 &&
        surfaceRect.height > 0 &&
        frameRect.width > 0 &&
        frameRect.height > 0,
    })
  }, [])

  useEffect(() => {
    const root = rootRef.current
    const frame = frameRef.current
    if (!root || !frame) return
    let observedSurface: Element | null = null
    const observer = new ResizeObserver(() => measure())
    const refresh = () => {
      const pane = document.querySelector<HTMLElement>('[data-compare-pane="canvas"]')
      const surface = pane?.querySelector('canvas') ?? pane ?? null
      if (surface !== observedSurface) {
        if (observedSurface) observer.unobserve(observedSurface)
        if (surface) observer.observe(surface)
        observedSurface = surface
      }
      measure()
    }
    observer.observe(root)
    observer.observe(frame)
    refresh()
    window.addEventListener('resize', refresh)
    window.visualViewport?.addEventListener('resize', refresh)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', refresh)
      window.visualViewport?.removeEventListener('resize', refresh)
    }
  }, [measure])

  const pageWidth = page?.size.width ?? 0
  const pageHeight = page?.size.height ?? 0
  const { zoom, translation } = camera
  const { insetX, insetY, dpr, ready } = geometry

  // translation is stored in physical pixels relative to the WebGPU surface. Reusing it
  // verbatim (plus the measured chrome inset) keeps both pages at the same offset within
  // their panes, so zooming and panning stay synchronized without reprojecting centers.
  const cssW = (pageWidth * zoom) / dpr
  const cssH = (pageHeight * zoom) / dpr
  const cssTx = insetX + translation[0] / dpr
  const cssTy = insetY + translation[1] / dpr

  const placeable =
    source !== null &&
    ready &&
    pageWidth > 0 &&
    pageHeight > 0 &&
    dpr > 0 &&
    Number.isFinite(zoom) &&
    zoom > 0 &&
    [cssTx, cssTy, cssW, cssH].every(Number.isFinite)

  // A missing locale key would otherwise surface the raw key as visible alt text.
  const label = t('canvas.compareView')
  const alt = label === 'canvas.compareView' ? '' : label
  const zoomPercent = Math.round(zoom * 100)

  return (
    <div
      ref={rootRef}
      className='flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--surface-canvas)]'
    >
      <header className='flex h-10 shrink-0 items-center gap-2 border-b border-border/80 bg-[var(--surface-toolbar)] px-2.5'>
        <span className='text-[11px] font-medium text-foreground'>
          {t('layers.originalArtwork')}
        </span>
        {page && (
          <span className='min-w-0 truncate text-[10px] text-muted-foreground'>{page.label}</span>
        )}
      </header>
      <div
        ref={frameRef}
        className='relative min-h-0 min-w-0 flex-1 overflow-hidden bg-[var(--surface-canvas)]'
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
      <footer className='flex h-7 shrink-0 items-center gap-3 border-t border-border/80 bg-[var(--surface-toolbar)] px-2.5 text-[10px] text-muted-foreground'>
        <span className='tabular-nums text-foreground'>{zoomPercent}%</span>
        <div className='flex-1' />
        {page && (
          <span className='tabular-nums'>
            {pageWidth} × {pageHeight} px
          </span>
        )}
      </footer>
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

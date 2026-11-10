'use client'

import { ColorSamplingProvider } from '@/components/controls/ColorSampling'
import { ActivityCenter } from '@/components/editor/ActivityCenter'
import { CanvasWorkspace } from '@/components/editor/CanvasWorkspace'
import { PageRail } from '@/components/editor/PageRail'
import { RightSidebar } from '@/components/editor/RightSidebar'
import { SourcePreview } from '@/components/editor/SourcePreview'
import { useKoharuStore } from '@/lib/store'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@koharu/ui/components/resizable'
import { cn } from '@koharu/ui/lib/utils'

export function Editor() {
  const compareView = useKoharuStore((state) => state.compareView)
  return (
    <ColorSamplingProvider>
      <div className='relative min-h-0 flex-1 bg-transparent'>
        <ActivityCenter />
        <ResizablePanelGroup id='editor' orientation='horizontal' className='h-full min-h-0'>
          <ResizablePanel
            id='pages'
            defaultSize='18%'
            minSize='14%'
            maxSize='22%'
            collapsible
            collapsedSize='4%'
            className='min-h-0 overflow-hidden'
          >
            <PageRail />
          </ResizablePanel>
          <ResizableHandle className='w-0 bg-transparent' />
          <ResizablePanel
            id='canvas'
            defaultSize='58%'
            minSize='50%'
            className='workspace-corner-mask relative z-10 min-h-0 rounded-tl-2xl bg-transparent shadow-[var(--shadow-content)]'
          >
            <div className='relative flex h-full min-h-0 w-full'>
              <div
                className={cn(
                  'h-full min-h-0 shrink-0 overflow-hidden',
                  compareView ? 'w-1/2' : 'w-0',
                )}
                aria-hidden={!compareView}
              >
                {compareView && <SourcePreview />}
              </div>
              <div
                data-compare-pane='canvas'
                className={cn(
                  'h-full min-h-0 min-w-0 flex-1',
                  compareView && 'border-l border-border/40',
                )}
              >
                <CanvasWorkspace />
              </div>
            </div>
          </ResizablePanel>
          <ResizableHandle className='w-0 bg-transparent' />
          <ResizablePanel
            id='inspector'
            defaultSize='24%'
            minSize='20%'
            maxSize='27%'
            collapsible
            collapsedSize='4%'
            className='min-h-0 overflow-hidden border-l border-border/40 bg-[var(--surface-panel)]'
          >
            <RightSidebar />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </ColorSamplingProvider>
  )
}

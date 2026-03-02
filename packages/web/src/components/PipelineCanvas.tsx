"use client";

import { useState, useCallback, useRef, type ReactNode } from "react";

interface PipelineCanvasProps {
  children: ReactNode;
}

const MIN_SCALE = 0.5;
const MAX_SCALE = 2.0;
const DEFAULT_SCALE = 1;
const ZOOM_STEP = 0.1;

/**
 * Pan/zoom wrapper for the pipeline view.
 * - Scroll to zoom (clamped 0.5x–2.0x)
 * - Click-drag to pan
 * - Double-click to reset
 */
export function PipelineCanvas({ children }: PipelineCanvasProps) {
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const dragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    setScale((s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s + delta)));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only pan on background or container clicks
    if ((e.target as HTMLElement).closest(".pipeline-card, button")) return;
    dragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };
    setPanX((x) => x + dx);
    setPanY((y) => y + dy);
  }, []);

  const handleMouseUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".pipeline-card, button")) return;
    setPanX(0);
    setPanY(0);
    setScale(DEFAULT_SCALE);
  }, []);

  const zoomIn = useCallback(() => {
    setScale((s) => Math.min(MAX_SCALE, s + ZOOM_STEP));
  }, []);

  const zoomOut = useCallback(() => {
    setScale((s) => Math.max(MIN_SCALE, s - ZOOM_STEP));
  }, []);

  const resetZoom = useCallback(() => {
    setPanX(0);
    setPanY(0);
    setScale(DEFAULT_SCALE);
  }, []);

  return (
    <div
      className="pipeline-canvas relative flex-1 overflow-hidden"
      style={{ cursor: dragging.current ? "grabbing" : "grab" }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDoubleClick={handleDoubleClick}
    >
      {/* Transformed content */}
      <div
        className="h-full w-full origin-top-left will-change-transform"
        style={{
          transform: `translate(${panX}px, ${panY}px) scale(${scale})`,
        }}
      >
        {children}
      </div>

      {/* Zoom controls — bottom-left */}
      <div className="absolute bottom-4 left-4 flex items-center gap-1 rounded-[6px] border border-[var(--color-border-default)] bg-[var(--color-bg-elevated)] p-1">
        <button
          onClick={zoomOut}
          className="rounded px-2 py-0.5 text-[13px] font-bold text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text-primary)]"
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          onClick={resetZoom}
          className="rounded px-2 py-0.5 text-[10px] font-semibold text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text-primary)]"
          aria-label="Reset zoom"
        >
          {Math.round(scale * 100)}%
        </button>
        <button
          onClick={zoomIn}
          className="rounded px-2 py-0.5 text-[13px] font-bold text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text-primary)]"
          aria-label="Zoom in"
        >
          +
        </button>
      </div>
    </div>
  );
}

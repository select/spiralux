/**
 * useCanvasNavigation — unified pan & zoom controls for any canvas.
 *
 * Provides consistent behavior across the main bezier canvas and
 * the deformation shape editor:
 *
 *   Zoom:
 *   - Ctrl+scroll / pinch-to-zoom (zoom around cursor)
 *   - Plain scroll without modifiers zooms (on canvases that opt in)
 *
 *   Pan:
 *   - Shift+scroll pans (horizontal follows deltaX or deltaY)
 *   - Middle-mouse drag pans
 *   - Alt+click drag pans (main canvas also uses this for pen tool)
 *
 *   Reset:
 *   - Double-click on empty space resets pan/zoom (opt-in)
 *
 * Usage:
 *   const nav = useCanvasNavigation({ scrollZoom: true });
 *   // In template: @wheel.prevent="nav.onWheel" etc.
 *   // Use nav.panX, nav.panY, nav.zoom in your draw function
 *   // Call nav.screenToLocal(sx, sy) to convert screen → local coordinates
 */

interface CanvasNavOptions {
  /** Whether plain scroll (no modifier) zooms. Default: false (only Ctrl+scroll zooms) */
  scrollZoom?: boolean;
  /** Minimum zoom level. Default: 0.1 */
  minZoom?: number;
  /** Maximum zoom level. Default: 20 */
  maxZoom?: number;
  /** Zoom speed factor. Default: 1.1 */
  zoomFactor?: number;
  /** Pan speed multiplier for scroll-based panning. Default: 1 */
  panSpeed?: number;
  /** Fixed center point for zoom (instead of cursor). Used by shape editor. */
  zoomCenter?: { x: number; y: number } | null;
}

export function useCanvasNavigation(options: CanvasNavOptions = {}) {
  const {
    scrollZoom = false,
    minZoom = 0.1,
    maxZoom = 20,
    zoomFactor = 1.1,
    panSpeed = 1,
    zoomCenter = null,
  } = options;

  const panX = ref(0);
  const panY = ref(0);
  const zoom = ref(1);

  // ── Drag-to-pan state (non-reactive, internal) ───────────────────────────

  let isPanning = false;
  let panStartMouse = { x: 0, y: 0 };
  let panStartOffset = { x: 0, y: 0 };

  // ── Coordinate conversion ────────────────────────────────────────────────

  /** Convert screen/canvas pixel coordinates to world/local coordinates */
  function screenToLocal(sx: number, sy: number) {
    return {
      x: (sx - panX.value) / zoom.value,
      y: (sy - panY.value) / zoom.value,
    };
  }

  /** Convert world/local coordinates to screen/canvas pixel coordinates */
  function localToScreen(lx: number, ly: number) {
    return {
      x: lx * zoom.value + panX.value,
      y: ly * zoom.value + panY.value,
    };
  }

  // ── Zoom helper ──────────────────────────────────────────────────────────

  function applyZoom(newZoom: number, pivotX: number, pivotY: number) {
    const clamped = Math.max(minZoom, Math.min(maxZoom, newZoom));
    if (clamped === zoom.value) return;
    const ratio = clamped / zoom.value;
    panX.value = pivotX - (pivotX - panX.value) * ratio;
    panY.value = pivotY - (pivotY - panY.value) * ratio;
    zoom.value = clamped;
  }

  // ── Wheel handler ────────────────────────────────────────────────────────

  /**
   * Call from @wheel. Pass the mouse position relative to the canvas element.
   * `canvasX`/`canvasY` are the cursor position in canvas-local pixels
   * (e.g. from getBoundingClientRect offset).
   */
  function onWheel(e: WheelEvent, canvasX: number, canvasY: number) {
    const isZoomGesture = e.ctrlKey || e.metaKey || (scrollZoom && !e.shiftKey);
    const isPanGesture = e.shiftKey;

    if (isZoomGesture) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? zoomFactor : 1 / zoomFactor;
      const pivotX = zoomCenter ? zoomCenter.x : canvasX;
      const pivotY = zoomCenter ? zoomCenter.y : canvasY;
      applyZoom(zoom.value * factor, pivotX, pivotY);
    } else if (isPanGesture) {
      e.preventDefault();
      // Shift+scroll: use deltaY as horizontal pan if deltaX is 0
      const dx = e.deltaX !== 0 ? e.deltaX : e.deltaY;
      panX.value -= dx * panSpeed;
      panY.value -= (e.deltaX !== 0 ? e.deltaY : 0) * panSpeed;
    } else if (!scrollZoom) {
      // Default scroll = pan (when scrollZoom is off, i.e., main canvas)
      // Horizontal tilt-wheel deltaX is typically much smaller than vertical deltaY,
      // so boost it 3× to feel equally responsive.
      panX.value -= e.deltaX * panSpeed * 3;
      panY.value -= e.deltaY * panSpeed;
    }
  }

  // ── Drag-to-pan (middle mouse / Alt+click) ───────────────────────────────

  /** Call from mousedown. Returns true if panning started (caller should skip other logic). */
  function startPanIfNeeded(e: MouseEvent): boolean {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      isPanning = true;
      panStartMouse = { x: e.clientX, y: e.clientY };
      panStartOffset = { x: panX.value, y: panY.value };
      e.preventDefault();
      return true;
    }
    return false;
  }

  /** Call from mousemove. Returns true if currently panning. */
  function movePan(e: MouseEvent): boolean {
    if (!isPanning) return false;
    panX.value = panStartOffset.x + (e.clientX - panStartMouse.x);
    panY.value = panStartOffset.y + (e.clientY - panStartMouse.y);
    return true;
  }

  /** Call from mouseup. Returns true if was panning. */
  function endPan(): boolean {
    if (!isPanning) return false;
    isPanning = false;
    return true;
  }

  /** Whether a pan drag is currently in progress */
  function panning(): boolean {
    return isPanning;
  }

  // ── Reset ────────────────────────────────────────────────────────────────

  function resetView() {
    panX.value = 0;
    panY.value = 0;
    zoom.value = 1;
  }

  return {
    panX,
    panY,
    zoom,
    screenToLocal,
    localToScreen,
    applyZoom,
    onWheel,
    startPanIfNeeded,
    movePan,
    endPan,
    panning,
    resetView,
  };
}

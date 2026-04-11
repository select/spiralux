/**
 * useCanvasTransform — unified rotate & scale gestures for any canvas.
 *
 * Provides consistent interaction across the main bezier canvas (spiral)
 * and the deformation shape editor:
 *
 *   Rotate:  Alt+drag — rotates around a pivot point
 *   Scale:   Alt+scroll — scales around a pivot point
 *
 * The composable tracks drag state internally and calls the provided
 * callbacks with delta values. The consumer decides what to transform.
 *
 * Usage:
 *   const transform = useCanvasTransform({
 *     onRotate: (delta) => { angle += delta; redraw(); },
 *     onScale:  (factor) => { scale *= factor; redraw(); },
 *   });
 *   // Wire: @mousedown="transform.onMouseDown" etc.
 */

interface TransformOptions {
  /** Called with rotation delta in radians */
  onRotate?: (deltaRadians: number) => void;
  /** Called with scale factor (>1 = grow, <1 = shrink) */
  onScale?: (factor: number) => void;
  /** Scale factor per scroll step. Default: 1.08 */
  scaleFactor?: number;
}

export function useCanvasTransform(opts: TransformOptions) {
  const {
    onRotate,
    onScale,
    scaleFactor = 1.08,
  } = opts;

  // ── Internal drag state ────────────────────────────────────────────────

  let rotating = false;
  let pivotX = 0;
  let pivotY = 0;
  let prevAngle = 0;

  /** Visual feedback: current rotation line endpoint (null when not rotating) */
  const rotatingPos = ref<{ x: number; y: number } | null>(null);

  // ── Rotate (Alt+drag) ─────────────────────────────────────────────────

  /**
   * Call from mousedown. Provide canvas-local mouse position and the pivot
   * (center of rotation — e.g. shape center or spiral centroid).
   * Returns true if transform started (caller should skip other drag logic).
   */
  function onMouseDown(
    e: MouseEvent,
    canvasX: number,
    canvasY: number,
    pivX: number,
    pivY: number,
  ): boolean {
    if (e.button !== 0 || !e.altKey) return false;

    rotating = true;
    pivotX = pivX;
    pivotY = pivY;
    prevAngle = Math.atan2(canvasY - pivY, canvasX - pivX);
    rotatingPos.value = { x: canvasX, y: canvasY };
    return true;
  }

  /**
   * Call from mousemove. Provide canvas-local mouse position.
   * Returns true if currently in a transform drag.
   */
  function onMouseMove(canvasX: number, canvasY: number): boolean {
    if (!rotating) return false;

    const curAngle = Math.atan2(canvasY - pivotY, canvasX - pivotX);
    const delta = curAngle - prevAngle;
    prevAngle = curAngle;
    rotatingPos.value = { x: canvasX, y: canvasY };
    onRotate?.(delta);
    return true;
  }

  /** Call from mouseup. Returns true if was transforming. */
  function onMouseUp(): boolean {
    if (!rotating) return false;
    rotating = false;
    rotatingPos.value = null;
    return true;
  }

  // ── Scale (Alt+scroll) ────────────────────────────────────────────────

  /**
   * Call from wheel handler. Returns true if the event was consumed.
   */
  function onWheel(e: WheelEvent): boolean {
    if (!e.altKey) return false;
    e.preventDefault();
    const factor = e.deltaY < 0 ? scaleFactor : 1 / scaleFactor;
    onScale?.(factor);
    return true;
  }

  /** Whether a rotate drag is in progress */
  function isRotating(): boolean {
    return rotating;
  }

  return {
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onWheel,
    isRotating,
    /** Reactive position of cursor during rotation (for visual feedback) */
    rotatingPos,
    /** Pivot point (for drawing rotation indicator) */
    get pivotX() { return pivotX; },
    get pivotY() { return pivotY; },
  };
}

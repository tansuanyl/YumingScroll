export type WheelZoomInput = {
  currentScale: number;
  minScale: number;
  maxScale: number;
  deltaY: number;
  clientX: number;
  clientY: number;
  canvasRect: {
    left: number;
    top: number;
  };
  scrollLeft: number;
  scrollTop: number;
};

export type WheelZoomResult = {
  scale: number;
  scrollLeft: number;
  scrollTop: number;
};

const wheelZoomSensitivity = 0.0014;

export function calculateWheelZoom(input: WheelZoomInput): WheelZoomResult {
  const currentScale = clamp(input.currentScale, input.minScale, input.maxScale);
  const nextScale = clamp(currentScale * Math.exp(-input.deltaY * wheelZoomSensitivity), input.minScale, input.maxScale);
  const pointerX = input.clientX - input.canvasRect.left;
  const pointerY = input.clientY - input.canvasRect.top;
  const boardX = (input.scrollLeft + pointerX) / currentScale;
  const boardY = (input.scrollTop + pointerY) / currentScale;

  return {
    scale: nextScale,
    scrollLeft: boardX * nextScale - pointerX,
    scrollTop: boardY * nextScale - pointerY
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

import { describe, expect, it } from "vitest";
import { calculateWheelZoom } from "../src/lib/workflowViewport";

describe("workflow viewport helpers", () => {
  it("keeps the board point under the cursor anchored while zooming in", () => {
    const result = calculateWheelZoom({
      currentScale: 1,
      minScale: 0.5,
      maxScale: 2,
      deltaY: -100,
      clientX: 260,
      clientY: 180,
      canvasRect: { left: 60, top: 30 },
      scrollLeft: 800,
      scrollTop: 400
    });

    const pointerX = 200;
    const pointerY = 150;
    const beforeBoardX = 1000;
    const beforeBoardY = 550;

    expect(result.scale).toBeGreaterThan(1);
    expect((result.scrollLeft + pointerX) / result.scale).toBeCloseTo(beforeBoardX, 5);
    expect((result.scrollTop + pointerY) / result.scale).toBeCloseTo(beforeBoardY, 5);
  });

  it("clamps scale changes at the configured zoom limits", () => {
    const result = calculateWheelZoom({
      currentScale: 1.9,
      minScale: 0.5,
      maxScale: 2,
      deltaY: -1200,
      clientX: 140,
      clientY: 160,
      canvasRect: { left: 40, top: 60 },
      scrollLeft: 300,
      scrollTop: 500
    });

    const pointerX = 100;
    const pointerY = 100;

    expect(result.scale).toBe(2);
    expect((result.scrollLeft + pointerX) / result.scale).toBeCloseTo((300 + pointerX) / 1.9, 5);
    expect((result.scrollTop + pointerY) / result.scale).toBeCloseTo((500 + pointerY) / 1.9, 5);
  });
});

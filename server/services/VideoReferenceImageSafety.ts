import sharp from "sharp";

type StoredImagePayload = {
  body: Buffer;
  contentType: string;
};

const outputContentType = "image/png";
const maxReferenceDimension = 1536;

export async function applyCharacterReferenceSafetyOverlay(payload: StoredImagePayload): Promise<StoredImagePayload> {
  const image = sharp(payload.body, { animated: false }).rotate();
  const metadata = await image.metadata();
  const sourceWidth = metadata.width;
  const sourceHeight = metadata.height;
  if (!sourceWidth || !sourceHeight) {
    throw new Error("could not read image dimensions");
  }

  const scale = Math.min(1, maxReferenceDimension / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  if (!width || !height) {
    throw new Error("could not read image dimensions");
  }

  const overlay = Buffer.from(buildSafetyOverlaySvg(width, height));
  const body = await image
    .resize({
      width,
      height,
      fit: "inside",
      withoutEnlargement: true
    })
    .flatten({ background: "#ffffff" })
    .modulate({ saturation: 0.82, brightness: 1.03 })
    .median(1)
    .composite([{ input: overlay, blend: "over" }])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();

  return { body, contentType: outputContentType };
}

function buildSafetyOverlaySvg(width: number, height: number): string {
  const columns = [0, 1, 2];
  const columnWidth = width / columns.length;
  const headBandHeight = clamp(height * 0.052, 14, 78);
  const closeupBandHeight = clamp(height * 0.043, 12, 66);
  const blurRadius = clamp(height * 0.006, 3, 12);
  const lineStep = clamp(Math.max(width, height) * 0.035, 22, 60);

  const bands = [
    { yRatio: 0.092, height: headBandHeight, opacity: 0.4 },
    { yRatio: 0.118, height: headBandHeight, opacity: 0.62 },
    { yRatio: 0.15, height: headBandHeight, opacity: 0.46 },
    { yRatio: 0.202, height: closeupBandHeight, opacity: 0.26 },
    { yRatio: 0.306, height: closeupBandHeight, opacity: 0.24 },
    { yRatio: 0.372, height: closeupBandHeight, opacity: 0.16 }
  ];

  const columnRects = columns
    .flatMap((column) =>
      bands.map((band) => {
        const x = column * columnWidth + columnWidth * 0.16;
        const y = height * band.yRatio;
        const rectWidth = columnWidth * 0.68;
        const radius = band.height / 2;
        return `<rect x="${round(x)}" y="${round(y)}" width="${round(rectWidth)}" height="${round(
          band.height
        )}" rx="${round(radius)}" fill="rgba(235,245,255,${band.opacity})" stroke="rgba(255,255,255,0.46)" stroke-width="${round(
          Math.max(1, band.height * 0.08)
        )}" filter="url(#mist)" />`;
      })
    )
    .join("\n");
  const fullWidthRects = [
    { yRatio: 0.122, height: headBandHeight * 0.55, opacity: 0.14 },
    { yRatio: 0.33, height: closeupBandHeight * 0.45, opacity: 0.11 }
  ]
    .map((band) => {
      const y = height * band.yRatio;
      return `<rect x="${round(width * 0.045)}" y="${round(y)}" width="${round(width * 0.91)}" height="${round(
        band.height
      )}" rx="${round(band.height / 2)}" fill="rgba(235,245,255,${band.opacity})" filter="url(#mist)" />`;
    })
    .join("\n");
  const hatchLines = buildHatchLines(width, height, lineStep);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <filter id="mist" x="-20%" y="-140%" width="140%" height="380%">
      <feGaussianBlur stdDeviation="${round(blurRadius)}" />
    </filter>
  </defs>
  <rect width="${width}" height="${height}" fill="rgba(255,255,255,0.035)" />
  <g opacity="0.16" stroke="rgba(255,255,255,0.62)" stroke-width="${round(clamp(width * 0.0014, 1, 2.4))}">
    ${hatchLines}
  </g>
  ${fullWidthRects}
  ${columnRects}
</svg>`;
}

function buildHatchLines(width: number, height: number, step: number): string {
  const diagonal = width + height;
  const lines: string[] = [];
  for (let start = -height; start < width; start += step) {
    lines.push(`<line x1="${round(start)}" y1="${round(height)}" x2="${round(start + height)}" y2="0" />`);
  }
  for (let start = -height + step / 2; start < width; start += step * 1.85) {
    lines.push(`<line x1="${round(start)}" y1="0" x2="${round(start + height)}" y2="${round(height)}" opacity="0.55" />`);
  }
  lines.push(`<rect x="${round(width * 0.025)}" y="${round(height * 0.025)}" width="${round(width * 0.95)}" height="${round(height * 0.95)}" rx="${round(diagonal * 0.012)}" fill="none" opacity="0.42" />`);
  return lines.join("\n");
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

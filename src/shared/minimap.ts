export interface MinimapPanel { x: number; y: number; width: number; height: number }

/** Locate the compact minimap header by its orange WORLD button and pale title bar. */
export function findCompactMinimap(pixels: Uint8ClampedArray, width: number, height: number): MinimapPanel | null {
  if (pixels.length !== width * height * 4) return null;
  const isPale = (x: number, y: number): boolean => {
    const i = (y * width + x) * 4;
    return pixels[i]! >= 190 && pixels[i + 1]! >= 190 && pixels[i + 2]! >= 190;
  };
  for (let y = 3; y < Math.min(height - 15, Math.ceil(height * .3)); y++) {
    let start = -1;
    for (let x = 0; x <= width; x++) {
      const i = (y * width + x) * 4;
      const orange = x < width && pixels[i]! > 170 && pixels[i + 1]! > 70 &&
        pixels[i + 1]! < 190 && pixels[i + 2]! < 80;
      if (orange && start < 0) start = x;
      if (!orange && start >= 0) {
        const run = x - start;
        if (run >= 25 && run <= 100) {
          const scale = run / 36;
          const top = Math.round(y - 3 * scale);
          if (top >= 0 && isPale(start, top)) {
            let left = start;
            while (left > 0 && isPale(left - 1, top)) left--;
            const titleX = Math.round(left + 3 * scale);
            const titleWidth = Math.floor(start - 31 * scale - titleX);
            const titleHeight = Math.round(17 * scale);
            if (titleWidth >= 80 && titleWidth <= 1200 && top + titleHeight <= height &&
                start - left >= 100 * scale) {
              const controlX = Math.round(start - 30 * scale);
              let controlBorder = false;
              const tolerance = Math.ceil(3 * scale);
              for (let cx = Math.max(0, controlX - tolerance); cx <= Math.min(width - 1, controlX + tolerance); cx++) {
                let dark = 0;
                for (let dy = 0; dy < Math.round(10 * scale) && y + dy < height; dy++) {
                  const i = ((y + dy) * width + cx) * 4;
                  if (pixels[i]! < 110 && pixels[i + 1]! < 110 && pixels[i + 2]! < 110) dark++;
                }
                if (dark >= 4 * scale) { controlBorder = true; break; }
              }
              if (controlBorder) return { x: titleX, y: top, width: titleWidth, height: titleHeight };
            }
          }
        }
        start = -1;
      }
    }
  }
  return null;
}

/** A compact header alone is not proof of safety; require an explicit shop name. */
export function isShopHeader(text: string): boolean {
  return /^[a-z][a-z0-9 .':;-]{3,110}\b(?:shop|store)\s*$/i.test(text.trim().replace(/\s+/g, ' '));
}

/** Locate the blue name panel between the minimap header and its map image. */
export function findMinimapPanel(pixels: Uint8ClampedArray, width: number, height: number): MinimapPanel | null {
  if (pixels.length !== width * height * 4) return null;
  const rows: { x: number; y: number; width: number }[] = [];
  for (let y = 0; y < height; y += 2) {
    let start = -1;
    for (let x = 0; x <= width; x++) {
      const i = (y * width + x) * 4;
      const blue = x < width && Math.abs(pixels[i]! - 153) <= 12 &&
        Math.abs(pixels[i + 1]! - 187) <= 12 && Math.abs(pixels[i + 2]! - 204) <= 12;
      if (blue && start < 0) start = x;
      if (!blue && start >= 0) {
        if (x - start >= 150) rows.push({ x: start, y, width: x - start });
        start = -1;
      }
    }
  }
  for (const top of rows) for (const bottom of rows) {
    const h = bottom.y - top.y;
    if (h < 58 || h > 115 || Math.abs(top.x - bottom.x) > 3 ||
        Math.abs(top.width - bottom.width) > 4) continue;
    const scale = h / 80;
    const x = Math.round(top.x + 93 * scale);
    const y = Math.round(top.y + 13 * scale);
    const w = Math.round(top.width - 98 * scale);
    const lineHeight = Math.round(25 * scale);
    if (w < 80 || x + w > width || y + lineHeight * 2 + 5 > height) continue;
    const ink = (offset: number): number => {
      let n = 0;
      for (let yy = y + offset; yy < y + offset + lineHeight; yy++)
        for (let xx = x; xx < x + w; xx++) {
          const i = (yy * width + xx) * 4;
          if (pixels[i]! > 205 && pixels[i + 1]! > 205 && pixels[i + 2]! > 205) n++;
        }
      return n;
    };
    if (ink(0) >= 20 && ink(Math.round(29 * scale)) >= 20)
      return { x: top.x, y: top.y, width: top.width, height: h };
  }
  return null;
}

export function minimapTextRegions(panel: MinimapPanel): [MinimapPanel, MinimapPanel] {
  const scale = panel.height / 80;
  const x = Math.round(panel.x + 93 * scale);
  const width = Math.round(panel.width - 98 * scale);
  const height = Math.round(25 * scale);
  return [15, 44].map(offset => ({ x, y: Math.round(panel.y + offset * scale), width, height })) as [MinimapPanel, MinimapPanel];
}

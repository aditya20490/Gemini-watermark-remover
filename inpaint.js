// inpaint.js
// Simple Telea-inspired inpainting for browser canvas.

function inpaint(imageData, mask, radius = 5) {
  const { width, height, data } = imageData;
  const totalPixels = width * height;

  // visited[i] = true when pixel i is already "known" (not masked)
  const visited = new Uint8Array(totalPixels);
  const isMask = new Uint8Array(totalPixels);

  for (let i = 0; i < totalPixels; i++) {
    if (mask[i]) {
      isMask[i] = 1;
    } else {
      visited[i] = 1;
    }
  }

  // Collect boundary pixels (mask pixels with at least one known neighbor)
  let boundary = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!isMask[i]) continue;
      if (hasKnownNeighbor(x, y, width, height, visited)) {
        boundary.push(i);
      }
    }
  }

  // Iteratively fill boundary pixels until all mask pixels are done
  while (boundary.length > 0) {
    const nextBoundary = [];

    for (const idx of boundary) {
      const x = idx % width;
      const y = (idx / width) | 0;

      const [r, g, b] = weightedAverage(x, y, width, height, data, visited, radius);
      const p = idx * 4;
      data[p] = r;
      data[p + 1] = g;
      data[p + 2] = b;
      data[p + 3] = 255;

      visited[idx] = 1;
    }

    // Recompute boundary for the next layer
    for (const idx of boundary) {
      const x = idx % width;
      const y = (idx / width) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const ni = ny * width + nx;
          if (isMask[ni] && !visited[ni] && hasKnownNeighbor(nx, ny, width, height, visited)) {
            if (!nextBoundary.includes(ni)) nextBoundary.push(ni);
          }
        }
      }
    }

    boundary = nextBoundary;
  }

  return imageData;
}

function hasKnownNeighbor(x, y, width, height, visited) {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      if (visited[ny * width + nx]) return true;
    }
  }
  return false;
}

function weightedAverage(x, y, width, height, data, visited, radius) {
  let sumR = 0, sumG = 0, sumB = 0, sumW = 0;

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const ni = ny * width + nx;
      if (!visited[ni]) continue;

      const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
      const w = 1 / (dist * dist);

      const p = ni * 4;
      sumR += data[p] * w;
      sumG += data[p + 1] * w;
      sumB += data[p + 2] * w;
      sumW += w;
    }
  }

  if (sumW === 0) return [128, 128, 128];
  return [sumR / sumW, sumG / sumW, sumB / sumW];
}

window.inpaint = inpaint;

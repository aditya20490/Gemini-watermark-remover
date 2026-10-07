// ============================================================
// CONTENT-AWARE HEALING ENGINE
// ============================================================
//
// This is a browser-only healing algorithm.
//
// Instead of simply averaging every surrounding pixel,
// it searches nearby source patches and copies texture
// from the most suitable surrounding area.
//
// Best for small unwanted objects, marks, spots and text.
// ============================================================

function inpaint(imageData, mask, radius = 12) {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;

  const total = width * height;

  const original = new Uint8ClampedArray(data);

  const target = new Uint8Array(total);

  for (let i = 0; i < total; i++) {
    target[i] = mask[i] ? 1 : 0;
  }

  // ----------------------------------------------------------
  // Find bounding box of the healing region
  // ----------------------------------------------------------

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {

      if (!target[y * width + x]) continue;

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < 0) {
    return imageData;
  }

  // ----------------------------------------------------------
  // Expand search area around selected region
  // ----------------------------------------------------------

  const searchPadding =
    Math.max(
      30,
      Math.min(
        100,
        radius * 5
      )
    );

  const searchMinX =
    Math.max(
      0,
      minX - searchPadding
    );

  const searchMinY =
    Math.max(
      0,
      minY - searchPadding
    );

  const searchMaxX =
    Math.min(
      width - 1,
      maxX + searchPadding
    );

  const searchMaxY =
    Math.min(
      height - 1,
      maxY + searchPadding
    );

  // ----------------------------------------------------------
  // Distance from mask boundary
  // ----------------------------------------------------------

  const distance =
    new Int16Array(total);

  distance.fill(-1);

  const queueX = [];
  const queueY = [];

  for (
    let y = minY;
    y <= maxY;
    y++
  ) {
    for (
      let x = minX;
      x <= maxX;
      x++
    ) {

      const index =
        y * width + x;

      if (!target[index]) continue;

      let boundary = false;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {

          if (
            dx === 0 &&
            dy === 0
          ) continue;

          const nx = x + dx;
          const ny = y + dy;

          if (
            nx < 0 ||
            ny < 0 ||
            nx >= width ||
            ny >= height
          ) {
            boundary = true;
            continue;
          }

          if (
            !target[
              ny * width + nx
            ]
          ) {
            boundary = true;
          }
        }
      }

      if (boundary) {
        distance[index] = 0;

        queueX.push(x);
        queueY.push(y);
      }
    }
  }

  // ----------------------------------------------------------
  // Fill distance map
  // ----------------------------------------------------------

  let head = 0;

  while (head < queueX.length) {

    const x = queueX[head];
    const y = queueY[head];

    head++;

    const current =
      distance[
        y * width + x
      ];

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {

        const nx = x + dx;
        const ny = y + dy;

        if (
          nx < minX ||
          ny < minY ||
          nx > maxX ||
          ny > maxY
        ) continue;

        const ni =
          ny * width + nx;

        if (
          !target[ni] ||
          distance[ni] !== -1
        ) {
          continue;
        }

        distance[ni] =
          current + 1;

        queueX.push(nx);
        queueY.push(ny);
      }
    }
  }

  // ----------------------------------------------------------
  // Process pixels from outside → inside
  // ----------------------------------------------------------

  let maxDistance = 0;

  for (let i = 0; i < total; i++) {
    if (
      distance[i] >
      maxDistance
    ) {
      maxDistance = distance[i];
    }
  }

  for (
    let layer = 0;
    layer <= maxDistance;
    layer++
  ) {

    for (
      let y = minY;
      y <= maxY;
      y++
    ) {
      for (
        let x = minX;
        x <= maxX;
        x++
      ) {

        const index =
          y * width + x;

        if (
          !target[index] ||
          distance[index] !== layer
        ) {
          continue;
        }

        const result =
          findBestSource(
            x,
            y,
            width,
            height,
            original,
            target,
            searchMinX,
            searchMinY,
            searchMaxX,
            searchMaxY,
            radius
          );

        const p =
          index * 4;

        data[p] = result[0];
        data[p + 1] = result[1];
        data[p + 2] = result[2];
        data[p + 3] = 255;

        // Mark this pixel as available
        // for subsequent inner pixels.
        original[p] = result[0];
        original[p + 1] = result[1];
        original[p + 2] = result[2];
        original[p + 3] = 255;

        target[index] = 0;
      }
    }
  }

  return imageData;
}


// ============================================================
// FIND BEST SOURCE
// ============================================================

function findBestSource(
  tx,
  ty,
  width,
  height,
  data,
  mask,
  minX,
  minY,
  maxX,
  maxY,
  radius
) {
  const patchRadius =
    Math.max(
      2,
      Math.min(
        6,
        Math.floor(radius / 2)
      )
    );

  const candidates = [];

  const searchStep =
    Math.max(
      2,
      Math.floor(
        patchRadius / 2
      )
    );

  // ----------------------------------------------------------
  // Search around the healing region.
  // ----------------------------------------------------------

  for (
    let y = minY;
    y <= maxY;
    y += searchStep
  ) {
    for (
      let x = minX;
      x <= maxX;
      x += searchStep
    ) {

      // Source cannot overlap the
      // original healing area.
      if (
        mask[
          y * width + x
        ]
      ) {
        continue;
      }

      const score =
        comparePatch(
          tx,
          ty,
          x,
          y,
          width,
          height,
          data,
          mask,
          patchRadius
        );

      if (
        Number.isFinite(score)
      ) {
        candidates.push({
          x,
          y,
          score
        });
      }
    }
  }

  if (!candidates.length) {
    return fallbackAverage(
      tx,
      ty,
      width,
      height,
      data,
      mask,
      radius
    );
  }

  candidates.sort(
    (a, b) =>
      a.score - b.score
  );

  // Randomize slightly among the
  // very best matches so the result
  // does not look mechanically copied.
  const topCount =
    Math.min(
      4,
      candidates.length
    );

  const chosen =
    candidates[
      Math.floor(
        Math.random() * topCount
      )
    ];

  return sampleColor(
    chosen.x,
    chosen.y,
    width,
    height,
    data
  );
}


// ============================================================
// PATCH COMPARISON
// ============================================================

function comparePatch(
  tx,
  ty,
  sx,
  sy,
  width,
  height,
  data,
  mask,
  r
) {
  let score = 0;
  let samples = 0;

  for (
    let dy = -r;
    dy <= r;
    dy++
  ) {
    for (
      let dx = -r;
      dx <= r;
      dx++
    ) {

      if (
        dx * dx +
        dy * dy >
        r * r
      ) {
        continue;
      }

      const targetX =
        tx + dx;

      const targetY =
        ty + dy;

      const sourceX =
        sx + dx;

      const sourceY =
        sy + dy;

      if (
        targetX < 0 ||
        targetY < 0 ||
        targetX >= width ||
        targetY >= height ||
        sourceX < 0 ||
        sourceY < 0 ||
        sourceX >= width ||
        sourceY >= height
      ) {
        continue;
      }

      const targetIndex =
        targetY * width +
        targetX;

      // Only compare pixels that are
      // already known/outside the healing area.
      if (mask[targetIndex]) {
        continue;
      }

      const sourceIndex =
        sourceY * width +
        sourceX;

      if (mask[sourceIndex]) {
        continue;
      }

      const tp =
        targetIndex * 4;

      const sp =
        sourceIndex * 4;

      const dr =
        data[tp] -
        data[sp];

      const dg =
        data[tp + 1] -
        data[sp + 1];

      const db =
        data[tp + 2] -
        data[sp + 2];

      score +=
        dr * dr +
        dg * dg +
        db * db;

      samples++;
    }
  }

  if (samples < 3) {
    return Infinity;
  }

  return score / samples;
}


// ============================================================
// COLOR SAMPLE
// ============================================================

function sampleColor(
  x,
  y,
  width,
  height,
  data
) {
  x = Math.max(
    0,
    Math.min(
      width - 1,
      Math.round(x)
    )
  );

  y = Math.max(
    0,
    Math.min(
      height - 1,
      Math.round(y)
    )
  );

  const p =
    (y * width + x) * 4;

  return [
    data[p],
    data[p + 1],
    data[p + 2]
  ];
}


// ============================================================
// FALLBACK
// ============================================================

function fallbackAverage(
  x,
  y,
  width,
  height,
  data,
  mask,
  radius
) {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;

  for (
    let dy = -radius;
    dy <= radius;
    dy++
  ) {
    for (
      let dx = -radius;
      dx <= radius;
      dx++
    ) {

      const nx = x + dx;
      const ny = y + dy;

      if (
        nx < 0 ||
        ny < 0 ||
        nx >= width ||
        ny >= height
      ) {
        continue;
      }

      const index =
        ny * width + nx;

      if (mask[index]) {
        continue;
      }

      const p =
        index * 4;

      r += data[p];
      g += data[p + 1];
      b += data[p + 2];

      count++;
    }
  }

  if (!count) {
    return [
      128,
      128,
      128
    ];
  }

  return [
    Math.round(r / count),
    Math.round(g / count),
    Math.round(b / count)
  ];
}


// ============================================================
// EXPORT
// ============================================================

window.inpaint = inpaint;

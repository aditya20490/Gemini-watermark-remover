function inpaint(imageData, mask, radius = 8) {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;

  const total = width * height;

  const original =
    new Uint8ClampedArray(data);

  const workingMask =
    new Uint8Array(mask);

  let remaining = 0;

  for (let i = 0; i < total; i++) {
    if (workingMask[i]) {
      remaining++;
    }
  }

  if (!remaining) {
    return imageData;
  }

  /*
   * Fill the mask from its outside edge
   * toward the center.
   */
  const maxIterations =
    Math.max(
      width,
      height
    );

  for (
    let iteration = 0;
    iteration < maxIterations &&
    remaining > 0;
    iteration++
  ) {
    const boundary = [];

    /*
     * Find pixels touching known image pixels.
     */
    for (
      let y = 0;
      y < height;
      y++
    ) {
      for (
        let x = 0;
        x < width;
        x++
      ) {
        const index =
          y * width + x;

        if (!workingMask[index]) {
          continue;
        }

        let isBoundary = false;

        for (
          let dy = -1;
          dy <= 1;
          dy++
        ) {
          for (
            let dx = -1;
            dx <= 1;
            dx++
          ) {
            if (
              dx === 0 &&
              dy === 0
            ) {
              continue;
            }

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

            if (
              !workingMask[
                ny * width + nx
              ]
            ) {
              isBoundary = true;
              break;
            }
          }

          if (isBoundary) break;
        }

        if (isBoundary) {
          boundary.push(index);
        }
      }
    }

    if (!boundary.length) {
      break;
    }

    /*
     * Heal this boundary.
     */
    for (const index of boundary) {
      const x = index % width;
      const y = Math.floor(
        index / width
      );

      const color =
        estimatePixel(
          x,
          y,
          width,
          height,
          data,
          workingMask,
          radius
        );

      const p = index * 4;

      data[p] = color[0];
      data[p + 1] = color[1];
      data[p + 2] = color[2];
      data[p + 3] = 255;

      workingMask[index] = 0;

      remaining--;
    }

    /*
     * Yield to the browser so the
     * phone doesn't appear frozen.
     */
    if (
      iteration % 3 === 0
    ) {
      awaitFrame();
    }
  }

  return imageData;
}


function estimatePixel(
  x,
  y,
  width,
  height,
  data,
  mask,
  radius
) {
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumWeight = 0;

  const r =
    Math.max(
      2,
      Math.min(
        radius,
        10
      )
    );

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
        dx === 0 &&
        dy === 0
      ) {
        continue;
      }

      const distance =
        Math.hypot(dx, dy);

      if (
        distance > r
      ) {
        continue;
      }

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

      /*
       * Nearby pixels have greater influence.
       */
      const weight =
        1 /
        (distance * distance);

      const p =
        index * 4;

      sumR +=
        data[p] * weight;

      sumG +=
        data[p + 1] *
        weight;

      sumB +=
        data[p + 2] *
        weight;

      sumWeight += weight;
    }
  }

  if (!sumWeight) {
    return [
      128,
      128,
      128
    ];
  }

  return [
    Math.round(
      sumR / sumWeight
    ),
    Math.round(
      sumG / sumWeight
    ),
    Math.round(
      sumB / sumWeight
    )
  ];
}


function awaitFrame() {
  return new Promise(
    (resolve) => {
      requestAnimationFrame(
        resolve
      );
    }
  );
}


window.inpaint =
  inpaint;

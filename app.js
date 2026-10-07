const upload = document.getElementById("upload");
const uploadBtn = document.getElementById("uploadBtn");

const emptyState = document.getElementById("emptyState");
const workspace = document.getElementById("workspace");

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d", {
  willReadFrequently: true
});

const brush = document.getElementById("brush");
const brushRow = document.getElementById("brushRow");

const generateBtn = document.getElementById("generate");
const downloadBtn = document.getElementById("download");
const resetBtn = document.getElementById("reset");

const themeToggle = document.getElementById("themeToggle");

const modePredefined = document.getElementById("modePredefined");
const modeDoodle = document.getElementById("modeDoodle");

const bulkStatus = document.getElementById("bulkStatus");


/* ============================================================
   STATE
   ============================================================ */

let originalImageData = null;
let mask = null;

let currentFile = null;
let currentFileIndex = 0;
let totalFiles = 0;

let drawing = false;
let lastPos = null;

let mode = "predefined";

let processing = false;


/* ============================================================
   PREDEFINED POLYGON
   ============================================================ */

const PREDEFINED_POLYGON = [
  [0.8896, 0.8525],
  [0.9141, 0.8809],
  [0.8789, 0.9092],
  [0.8604, 0.8770]
];


const POLYGON_EXPANSION = 1 / 1024;

const centerX =
  PREDEFINED_POLYGON.reduce(
    (sum, point) => sum + point[0],
    0
  ) / PREDEFINED_POLYGON.length;

const centerY =
  PREDEFINED_POLYGON.reduce(
    (sum, point) => sum + point[1],
    0
  ) / PREDEFINED_POLYGON.length;


const EXPANDED_POLYGON =
  PREDEFINED_POLYGON.map(([x, y]) => {

    const dx = x - centerX;
    const dy = y - centerY;

    const length =
      Math.sqrt(
        dx * dx +
        dy * dy
      ) || 1;

    return [
      x +
        (dx / length) *
        POLYGON_EXPANSION,

      y +
        (dy / length) *
        POLYGON_EXPANSION
    ];

  });


/*
 * Move only the leftmost vertex an additional 2 pixels left.
 */

let leftmostIndex = 0;

for (
  let i = 1;
  i < EXPANDED_POLYGON.length;
  i++
) {

  if (
    EXPANDED_POLYGON[i][0] <
    EXPANDED_POLYGON[leftmostIndex][0]
  ) {
    leftmostIndex = i;
  }

}

EXPANDED_POLYGON[leftmostIndex][0] -=
  2 / 1024;


/* ============================================================
   WEBP SETTINGS
   ============================================================ */

const MIN_OUTPUT_KB = 300;
const MAX_OUTPUT_KB = 500;

const TARGET_OUTPUT_KB = 400;


/* ============================================================
   THEME
   ============================================================ */

themeToggle.addEventListener(
  "click",
  () => {

    const html =
      document.documentElement;

    const current =
      html.getAttribute("data-theme");

    const next =
      current === "dark"
        ? "light"
        : "dark";

    html.setAttribute(
      "data-theme",
      next
    );

  }
);


/* ============================================================
   UPLOAD
   ============================================================ */

uploadBtn.addEventListener(
  "click",
  () => {
    upload.click();
  }
);


upload.addEventListener(
  "change",
  async () => {

    const files =
      Array.from(
        upload.files || []
      ).slice(0, 20);

    if (!files.length) {
      return;
    }

    currentFileIndex = 0;
    totalFiles = files.length;

    currentFile = files[0];

    try {

      await loadImage(
        currentFile
      );

      emptyState.classList.add(
        "hidden"
      );

      workspace.classList.remove(
        "hidden"
      );

      updateBulkStatus();

      setMode("predefined");

    } catch (error) {

      console.error(error);

      alert(
        "Could not load the image."
      );

    }

  }
);


/* ============================================================
   IMAGE LOADING
   ============================================================ */

function loadImage(file) {

  return new Promise(
    (resolve, reject) => {

      const img =
        new Image();

      const objectUrl =
        URL.createObjectURL(file);

      img.onload = () => {

        const maxDimension = 1600;

        const scale =
          Math.min(
            1,
            maxDimension /
              Math.max(
                img.width,
                img.height
              )
          );

        canvas.width =
          Math.max(
            1,
            Math.round(
              img.width * scale
            )
          );

        canvas.height =
          Math.max(
            1,
            Math.round(
              img.height * scale
            )
          );

        ctx.clearRect(
          0,
          0,
          canvas.width,
          canvas.height
        );

        ctx.drawImage(
          img,
          0,
          0,
          canvas.width,
          canvas.height
        );

        originalImageData =
          ctx.getImageData(
            0,
            0,
            canvas.width,
            canvas.height
          );

        mask =
          new Uint8Array(
            canvas.width *
            canvas.height
          );

        URL.revokeObjectURL(
          objectUrl
        );

        resolve();

      };


      img.onerror = () => {

        URL.revokeObjectURL(
          objectUrl
        );

        reject(
          new Error(
            "Could not load image."
          )
        );

      };


      img.src =
        objectUrl;

    }
  );

}


/* ============================================================
   MODES
   ============================================================ */

function setMode(nextMode) {

  mode = nextMode;

  modePredefined.classList.toggle(
    "active",
    mode === "predefined"
  );

  modeDoodle.classList.toggle(
    "active",
    mode === "doodle"
  );

  brushRow.classList.toggle(
    "hidden",
    mode !== "doodle"
  );

  if (mode === "predefined") {

    buildPredefinedMask();

  } else {

    if (mask) {
      mask.fill(0);
    }

  }

  redrawOverlay();

}


modePredefined.addEventListener(
  "click",
  () => {

    if (!processing) {
      setMode("predefined");
    }

  }
);


modeDoodle.addEventListener(
  "click",
  () => {

    if (!processing) {
      setMode("doodle");
    }

  }
);


/* ============================================================
   PREDEFINED MASK
   ============================================================ */

function buildPredefinedMask() {

  if (
    !canvas.width ||
    !canvas.height ||
    !mask
  ) {
    return;
  }

  mask.fill(0);

  const points =
    EXPANDED_POLYGON.map(
      ([nx, ny]) => [
        nx * canvas.width,
        ny * canvas.height
      ]
    );


  for (
    let y = 0;
    y < canvas.height;
    y++
  ) {

    for (
      let x = 0;
      x < canvas.width;
      x++
    ) {

      if (
        pointInPolygon(
          x + 0.5,
          y + 0.5,
          points
        )
      ) {

        mask[
          y * canvas.width + x
        ] = 1;

      }

    }

  }

}


function pointInPolygon(
  x,
  y,
  polygon
) {

  let inside = false;

  for (
    let i = 0,
    j = polygon.length - 1;

    i < polygon.length;

    j = i++
  ) {

    const xi =
      polygon[i][0];

    const yi =
      polygon[i][1];

    const xj =
      polygon[j][0];

    const yj =
      polygon[j][1];


    const intersects =
      yi > y !== yj > y &&
      x <
        ((xj - xi) *
          (y - yi)) /
          (yj - yi) +
          xi;


    if (intersects) {
      inside = !inside;
    }

  }

  return inside;

}


/* ============================================================
   OVERLAY
   ============================================================ */

function redrawOverlay() {

  if (!originalImageData) {
    return;
  }

  ctx.putImageData(
    originalImageData,
    0,
    0
  );

  if (mode === "predefined") {

    drawPredefinedOverlay();

  } else {

    drawDoodleOverlay();

  }

}


function drawPredefinedOverlay() {

  const points =
    EXPANDED_POLYGON.map(
      ([nx, ny]) => [
        nx * canvas.width,
        ny * canvas.height
      ]
    );


  ctx.save();

  ctx.beginPath();

  ctx.moveTo(
    points[0][0],
    points[0][1]
  );


  for (
    let i = 1;
    i < points.length;
    i++
  ) {

    ctx.lineTo(
      points[i][0],
      points[i][1]
    );

  }


  ctx.closePath();


  ctx.fillStyle =
    "rgba(255, 69, 58, 0.22)";

  ctx.fill();


  ctx.strokeStyle =
    "#ff453a";

  ctx.lineWidth =
    Math.max(
      1.5,
      canvas.width / 700
    );

  ctx.stroke();

  ctx.restore();

}


function drawDoodleOverlay() {

  if (!mask) {
    return;
  }

  const overlay =
    ctx.createImageData(
      canvas.width,
      canvas.height
    );


  for (
    let i = 0;
    i < mask.length;
    i++
  ) {

    if (!mask[i]) {
      continue;
    }

    const p = i * 4;

    overlay.data[p] = 255;
    overlay.data[p + 1] = 69;
    overlay.data[p + 2] = 58;
    overlay.data[p + 3] = 85;

  }


  ctx.putImageData(
    overlay,
    0,
    0
  );

}


/* ============================================================
   DOODLE
   ============================================================ */

canvas.addEventListener(
  "pointerdown",
  event => {

    if (
      processing ||
      mode !== "doodle" ||
      !mask
    ) {
      return;
    }

    drawing = true;

    canvas.setPointerCapture(
      event.pointerId
    );

    lastPos =
      getCanvasPosition(
        event
      );

    paint(
      lastPos.x,
      lastPos.y
    );

    redrawOverlay();

  }
);


canvas.addEventListener(
  "pointermove",
  event => {

    if (
      !drawing ||
      mode !== "doodle"
    ) {
      return;
    }

    const pos =
      getCanvasPosition(
        event
      );

    drawLine(
      lastPos.x,
      lastPos.y,
      pos.x,
      pos.y
    );

    lastPos = pos;

  }
);


canvas.addEventListener(
  "pointerup",
  stopDrawing
);


canvas.addEventListener(
  "pointercancel",
  stopDrawing
);


function stopDrawing() {

  drawing = false;
  lastPos = null;

}


function getCanvasPosition(
  event
) {

  const rect =
    canvas.getBoundingClientRect();


  return {

    x:
      ((event.clientX -
        rect.left) /
        rect.width) *
      canvas.width,

    y:
      ((event.clientY -
        rect.top) /
        rect.height) *
      canvas.height

  };

}


function paint(x, y) {

  const radius =
    Number(brush.value) / 2;


  const minX =
    Math.max(
      0,
      Math.floor(
        x - radius
      )
    );


  const maxX =
    Math.min(
      canvas.width - 1,
      Math.ceil(
        x + radius
      )
    );


  const minY =
    Math.max(
      0,
      Math.floor(
        y - radius
      )
    );


  const maxY =
    Math.min(
      canvas.height - 1,
      Math.ceil(
        y + radius
      )
    );


  for (
    let py = minY;
    py <= maxY;
    py++
  ) {

    for (
      let px = minX;
      px <= maxX;
      px++
    ) {

      const dx =
        px - x;

      const dy =
        py - y;


      if (
        dx * dx +
          dy * dy <=
        radius * radius
      ) {

        mask[
          py * canvas.width + px
        ] = 1;

      }

    }

  }

}


function drawLine(
  x1,
  y1,
  x2,
  y2
) {

  const distance =
    Math.hypot(
      x2 - x1,
      y2 - y1
    );


  const step =
    Math.max(
      1,
      Number(brush.value) / 4
    );


  for (
    let i = 0;
    i <= distance;
    i += step
  ) {

    const t =
      distance === 0
        ? 0
        : i / distance;


    paint(
      x1 + (x2 - x1) * t,
      y1 + (y2 - y1) * t
    );

  }


  redrawOverlay();

}


/* ============================================================
   GENERATE
   ============================================================ */

generateBtn.addEventListener(
  "click",
  async () => {

    if (
      processing ||
      !originalImageData ||
      !mask
    ) {
      return;
    }

    processing = true;

    generateBtn.disabled = true;
    downloadBtn.disabled = true;
    resetBtn.disabled = true;

    generateBtn.textContent =
      "Healing...";


    try {

      if (
        mode === "predefined"
      ) {

        buildPredefinedMask();

      }


      const working =
        new ImageData(
          new Uint8ClampedArray(
            originalImageData.data
          ),
          originalImageData.width,
          originalImageData.height
        );


      const activeMask =
        new Uint8Array(mask);


      await new Promise(
        resolve =>
          requestAnimationFrame(
            () => resolve()
          )
      );


      const result =
        window.inpaint(
          working,
          activeMask
        );


      originalImageData =
        result;


      mask =
        new Uint8Array(
          canvas.width *
          canvas.height
        );


      ctx.putImageData(
        originalImageData,
        0,
        0
      );


      if (
        totalFiles > 1 &&
        currentFileIndex <
          totalFiles - 1
      ) {

        await processRemainingFiles();

      }

    } catch (error) {

      console.error(error);

      alert(
        "Healing failed. Please try again."
      );

    } finally {

      processing = false;

      generateBtn.disabled = false;
      downloadBtn.disabled = false;
      resetBtn.disabled = false;

      generateBtn.textContent =
        "✨ Generate";

    }

  }
);


/* ============================================================
   BULK PROCESSING
   ============================================================ */

async function processRemainingFiles() {

  const files =
    Array.from(
      upload.files || []
    );


  for (
    let i =
      currentFileIndex + 1;

    i < totalFiles;

    i++
  ) {

    currentFileIndex = i;

    updateBulkStatus();


    const file =
      files[i];


    if (!file) {
      continue;
    }


    await loadImage(
      file
    );


    buildPredefinedMask();


    const working =
      new ImageData(
        new Uint8ClampedArray(
          originalImageData.data
        ),
        originalImageData.width,
        originalImageData.height
      );


    const activeMask =
      new Uint8Array(mask);


    await new Promise(
      resolve =>
        requestAnimationFrame(
          () => resolve()
        )
    );


    const result =
      window.inpaint(
        working,
        activeMask
      );


    originalImageData =
      result;


    mask =
      new Uint8Array(
        canvas.width *
        canvas.height
      );


    ctx.putImageData(
      originalImageData,
      0,
      0
    );


    await saveCurrentAsWebP(
      `healed-${i + 1}.webp`
    );

  }


  currentFileIndex =
    totalFiles - 1;

  updateBulkStatus();

}


/* ============================================================
   WEBP ENCODING
   ============================================================ */

/*
 * Encode the image repeatedly until the file is
 * approximately 300–500 KB.
 *
 * We use binary search so this does not create
 * dozens of unnecessary files.
 */

async function encodeWebPForTargetSize() {

  const exportCanvas =
    document.createElement(
      "canvas"
    );


  exportCanvas.width =
    originalImageData.width;

  exportCanvas.height =
    originalImageData.height;


  const exportCtx =
    exportCanvas.getContext(
      "2d"
    );


  exportCtx.putImageData(
    originalImageData,
    0,
    0
  );


  /*
   * First try maximum quality.
   */

  let high = 1.0;
  let low = 0.05;

  let bestBlob = null;

  let bestDifference =
    Infinity;


  /*
   * If even maximum quality is below
   * 300 KB, that maximum-quality file
   * is the best possible WebP result.
   */

  const maximumQualityBlob =
    await canvasToWebP(
      exportCanvas,
      1.0
    );


  const maximumSize =
    maximumQualityBlob.size / 1024;


  if (
    maximumSize <=
    TARGET_OUTPUT_KB
  ) {

    return maximumQualityBlob;

  }


  /*
   * Binary-search quality.
   *
   * Higher quality = larger file.
   */

  for (
    let i = 0;
    i < 10;
    i++
  ) {

    const quality =
      (low + high) / 2;


    const blob =
      await canvasToWebP(
        exportCanvas,
        quality
      );


    const sizeKB =
      blob.size / 1024;


    /*
     * Prefer files inside 300–500 KB.
     */

    if (
      sizeKB >=
        MIN_OUTPUT_KB &&
      sizeKB <=
        MAX_OUTPUT_KB
    ) {

      const difference =
        Math.abs(
          sizeKB -
          TARGET_OUTPUT_KB
        );


      if (
        difference <
        bestDifference
      ) {

        bestBlob = blob;

        bestDifference =
          difference;

      }

    }


    /*
     * If file is too small,
     * increase quality.
     */

    if (
      sizeKB <
      TARGET_OUTPUT_KB
    ) {

      low = quality;

    } else {

      /*
       * File is too large.
       * Reduce quality.
       */

      high = quality;

    }

  }


  /*
   * If we found a file in the requested
   * range, use the closest one.
   */

  if (bestBlob) {
    return bestBlob;
  }


  /*
   * Otherwise return the quality closest
   * to the 400 KB target.
   */

  let closestBlob =
    maximumQualityBlob;

  let closestDifference =
    Math.abs(
      maximumSize -
      TARGET_OUTPUT_KB
    );


  for (
    let quality = 0.1;
    quality <= 1.0;
    quality += 0.1
  ) {

    const blob =
      await canvasToWebP(
        exportCanvas,
        Math.min(
          1,
          quality
        )
      );


    const sizeKB =
      blob.size / 1024;


    const difference =
      Math.abs(
        sizeKB -
        TARGET_OUTPUT_KB
      );


    if (
      difference <
      closestDifference
    ) {

      closestBlob = blob;

      closestDifference =
        difference;

    }

  }


  return closestBlob;

}


/* ============================================================
   CANVAS → WEBP
   ============================================================ */

function canvasToWebP(
  canvasElement,
  quality
) {

  return new Promise(
    resolve => {

      canvasElement.toBlob(
        blob => {

          resolve(blob);

        },
        "image/webp",
        quality
      );

    }
  );

}


/* ============================================================
   SAVE
   ============================================================ */

downloadBtn.addEventListener(
  "click",
  async () => {

    if (
      !originalImageData ||
      processing
    ) {
      return;
    }


    downloadBtn.disabled = true;

    downloadBtn.textContent =
      "Preparing...";


    try {

      await saveCurrentAsWebP(
        "healed-image.webp"
      );

    } finally {

      downloadBtn.disabled = false;

      downloadBtn.textContent =
        "⬇️ Save WebP";

    }

  }
);


async function saveCurrentAsWebP(
  filename
) {

  const blob =
    await encodeWebPForTargetSize();


  if (!blob) {
    return;
  }


  const link =
    document.createElement(
      "a"
    );


  link.download =
    filename;

  link.href =
    URL.createObjectURL(
      blob
    );


  document.body.appendChild(
    link
  );

  link.click();

  link.remove();


  setTimeout(
    () => {

      URL.revokeObjectURL(
        link.href
      );

    },
    1000
  );

}


/* ============================================================
   RESET
   ============================================================ */

resetBtn.addEventListener(
  "click",
  () => {

    if (
      !originalImageData ||
      processing
    ) {
      return;
    }


    if (
      mode === "predefined"
    ) {

      buildPredefinedMask();

    } else {

      mask.fill(0);

    }


    redrawOverlay();

  }
);


/* ============================================================
   BULK STATUS
   ============================================================ */

function updateBulkStatus() {

  if (totalFiles <= 1) {

    bulkStatus.classList.add(
      "hidden"
    );

    return;

  }


  bulkStatus.classList.remove(
    "hidden"
  );


  bulkStatus.textContent =
    `Photo ${currentFileIndex + 1} of ${totalFiles}`;

}


/* ============================================================
   INITIAL STATE
   ============================================================ */

setMode("predefined");

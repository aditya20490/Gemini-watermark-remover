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


/*
 * The polygon was previously expanded by approximately
 * 1 pixel on the 1024 × 1024 reference image.
 */

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


/*
 * Expand the polygon normally, then move the
 * LEFTMOST VERTEX an additional 2 pixels left.
 */

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
 * Move only the leftmost vertex 2 additional
 * pixels to the left on the 1024 × 1024 reference.
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

  for (
    let i =
      currentFileIndex + 1;

    i < totalFiles;

    i++
  ) {

    currentFileIndex = i;

    updateBulkStatus();


    const file =
      Array.from(
        upload.files || []
      )[i];


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

    await saveCurrentAsWebP(
      "healed-image.webp"
    );

  }
);


function saveCurrentAsWebP(
  filename
) {

  return new Promise(
    resolve => {

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


      exportCanvas.toBlob(
        blob => {

          if (!blob) {
            resolve();
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


          resolve();

        },
        "image/webp",
        0.95
      );

    }
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

// ============================================================
// HEAL TOOL
// ============================================================

const uploadInput = document.getElementById("upload");
const uploadBtn = document.getElementById("uploadBtn");
const uploadAnother = document.getElementById("uploadAnother");

const emptyState = document.getElementById("emptyState");
const workspace = document.getElementById("workspace");

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d", {
  willReadFrequently: true
});

const brushSlider = document.getElementById("brush");
const brushRow = document.getElementById("brushRow");
const brushValue = document.getElementById("brushValue");

const generateBtn = document.getElementById("generate");
const downloadBtn = document.getElementById("download");
const resetBtn = document.getElementById("reset");

const modePredefined = document.getElementById("modePredefined");
const modeDoodle = document.getElementById("modeDoodle");

const modeTitle = document.getElementById("modeTitle");
const predefinedHint = document.getElementById("predefinedHint");

const themeToggle = document.getElementById("themeToggle");


// ============================================================
// THEME
// ============================================================

const THEME_KEY = "heal-tool-theme";

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);

  const meta = document.querySelector(
    'meta[name="theme-color"]'
  );

  if (meta) {
    meta.setAttribute(
      "content",
      theme === "dark" ? "#080a10" : "#f3f5f9"
    );
  }

  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch (_) {}
}

function initTheme() {
  let saved = null;

  try {
    saved = localStorage.getItem(THEME_KEY);
  } catch (_) {}

  if (saved === "dark" || saved === "light") {
    applyTheme(saved);
    return;
  }

  applyTheme("dark");
}

themeToggle.addEventListener("click", () => {
  const current =
    document.documentElement.getAttribute("data-theme") ||
    "dark";

  applyTheme(
    current === "dark" ? "light" : "dark"
  );
});

initTheme();


// ============================================================
// PREDEFINED HEALING AREA
// ============================================================
//
// This is the exact region you previously marked.
//
// Coordinates are normalized:
// 0 = left/top
// 1 = right/bottom
//

const PREDEFINED_POLYGON = [
  [0.8896, 0.8525],
  [0.9141, 0.8809],
  [0.8789, 0.9092],
  [0.8604, 0.8770]
];


// ============================================================
// STATE
// ============================================================

let originalImageData = null;
let mask = null;

let drawing = false;
let lastPos = null;

let mode = "predefined";

let sourceImage = null;


// ============================================================
// MODE
// ============================================================

function setMode(newMode) {
  mode = newMode;

  if (mode === "predefined") {
    modePredefined.classList.add("active");
    modeDoodle.classList.remove("active");

    brushRow.classList.add("hidden");

    modeTitle.textContent = "Predefined area";
    predefinedHint.classList.remove("hidden");
  } else {
    modeDoodle.classList.add("active");
    modePredefined.classList.remove("active");

    brushRow.classList.remove("hidden");

    modeTitle.textContent = "Doodle area";
    predefinedHint.classList.add("hidden");
  }

  redraw();
}

modePredefined.addEventListener(
  "click",
  () => setMode("predefined")
);

modeDoodle.addEventListener(
  "click",
  () => setMode("doodle")
);


// ============================================================
// UPLOAD
// ============================================================

uploadBtn.addEventListener(
  "click",
  () => uploadInput.click()
);

uploadAnother.addEventListener(
  "click",
  () => uploadInput.click()
);

uploadInput.addEventListener("change", (event) => {
  const file = event.target.files[0];

  if (!file) return;

  const url = URL.createObjectURL(file);

  const img = new Image();

  img.onload = () => {
    sourceImage = img;

    // Keep the image square.
    // The healing coordinates are designed for 1:1 images.
    if (img.width !== img.height) {
      alert(
        "Please use a 1:1 square image for this healing tool."
      );

      URL.revokeObjectURL(url);
      uploadInput.value = "";
      return;
    }

    // Keep enough resolution for good healing,
    // while avoiding enormous browser canvases.
    const MAX_SIZE = 1600;

    const scale = Math.min(
      1,
      MAX_SIZE / img.width
    );

    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);

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

    originalImageData = ctx.getImageData(
      0,
      0,
      canvas.width,
      canvas.height
    );

    mask = new Uint8Array(
      canvas.width * canvas.height
    );

    emptyState.classList.add("hidden");
    workspace.classList.remove("hidden");

    setMode(mode);

    URL.revokeObjectURL(url);
  };

  img.onerror = () => {
    alert("Unable to open this image.");
    URL.revokeObjectURL(url);
  };

  img.src = url;
});


// ============================================================
// DRAW
// ============================================================

function redraw() {
  if (!originalImageData) return;

  ctx.putImageData(
    originalImageData,
    0,
    0
  );

  if (mode === "predefined") {
    drawPredefinedOverlay();
  } else {
    drawMaskOverlay();
  }
}


// ============================================================
// PREDEFINED OVERLAY
// ============================================================

function drawPredefinedOverlay() {
  const W = canvas.width;
  const H = canvas.height;

  const pts = PREDEFINED_POLYGON.map(
    ([x, y]) => [
      x * W,
      y * H
    ]
  );

  ctx.save();

  ctx.beginPath();

  ctx.moveTo(
    pts[0][0],
    pts[0][1]
  );

  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(
      pts[i][0],
      pts[i][1]
    );
  }

  ctx.closePath();

  // Selected area
  ctx.fillStyle =
    "rgba(139, 108, 255, 0.28)";

  ctx.fill();

  // Border
  ctx.strokeStyle =
    "rgba(174, 157, 255, 0.95)";

  ctx.lineWidth =
    Math.max(2, W / 500);

  ctx.stroke();

  // Handles
  for (const [x, y] of pts) {
    ctx.beginPath();

    ctx.arc(
      x,
      y,
      Math.max(5, W / 110),
      0,
      Math.PI * 2
    );

    ctx.fillStyle = "#ffffff";
    ctx.fill();

    ctx.strokeStyle = "#8b6cff";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  ctx.restore();
}


// ============================================================
// DOODLE OVERLAY
// ============================================================

function drawMaskOverlay() {
  if (!mask) return;

  const W = canvas.width;
  const H = canvas.height;

  const img = ctx.getImageData(
    0,
    0,
    W,
    H
  );

  const data = img.data;

  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;

    const p = i * 4;

    data[p] =
      Math.round(data[p] * 0.45 + 139 * 0.55);

    data[p + 1] =
      Math.round(data[p + 1] * 0.45 + 108 * 0.55);

    data[p + 2] =
      Math.round(data[p + 2] * 0.45 + 255 * 0.55);

    data[p + 3] = 255;
  }

  ctx.putImageData(img, 0, 0);
}


// ============================================================
// POINTER POSITION
// ============================================================

function getPos(event) {
  const rect =
    canvas.getBoundingClientRect();

  const clientX =
    event.touches
      ? event.touches[0].clientX
      : event.clientX;

  const clientY =
    event.touches
      ? event.touches[0].clientY
      : event.clientY;

  return {
    x:
      (clientX - rect.left) *
      (canvas.width / rect.width),

    y:
      (clientY - rect.top) *
      (canvas.height / rect.height)
  };
}


// ============================================================
// DOODLE PAINTING
// ============================================================

function paintAt(x, y) {
  if (!mask) return;

  const r =
    Number(brushSlider.value);

  const x0 =
    Math.max(0, Math.floor(x - r));

  const x1 =
    Math.min(
      canvas.width - 1,
      Math.ceil(x + r)
    );

  const y0 =
    Math.max(0, Math.floor(y - r));

  const y1 =
    Math.min(
      canvas.height - 1,
      Math.ceil(y + r)
    );

  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {

      const dx = px - x;
      const dy = py - y;

      if (
        dx * dx +
        dy * dy <=
        r * r
      ) {
        mask[
          py * canvas.width + px
        ] = 1;
      }
    }
  }
}

function onPointerDown(event) {
  if (mode !== "doodle") return;

  event.preventDefault();

  drawing = true;

  lastPos = getPos(event);

  paintAt(
    lastPos.x,
    lastPos.y
  );

  redraw();
}

function onPointerMove(event) {
  if (
    mode !== "doodle" ||
    !drawing
  ) {
    return;
  }

  event.preventDefault();

  const p = getPos(event);

  const distance =
    Math.hypot(
      p.x - lastPos.x,
      p.y - lastPos.y
    );

  const steps =
    Math.max(
      1,
      Math.ceil(distance / 4)
    );

  for (let i = 1; i <= steps; i++) {

    const t = i / steps;

    paintAt(
      lastPos.x +
        (p.x - lastPos.x) * t,

      lastPos.y +
        (p.y - lastPos.y) * t
    );
  }

  lastPos = p;

  redraw();
}

function onPointerUp() {
  drawing = false;
  lastPos = null;
}

canvas.addEventListener(
  "mousedown",
  onPointerDown
);

canvas.addEventListener(
  "mousemove",
  onPointerMove
);

canvas.addEventListener(
  "mouseup",
  onPointerUp
);

canvas.addEventListener(
  "mouseleave",
  onPointerUp
);

canvas.addEventListener(
  "touchstart",
  onPointerDown,
  { passive: false }
);

canvas.addEventListener(
  "touchmove",
  onPointerMove,
  { passive: false }
);

canvas.addEventListener(
  "touchend",
  onPointerUp
);


// ============================================================
// PREDEFINED POLYGON → MASK
// ============================================================

function buildPredefinedMask() {
  const W = canvas.width;
  const H = canvas.height;

  const m =
    new Uint8Array(W * H);

  const pts =
    PREDEFINED_POLYGON.map(
      ([x, y]) => [
        x * W,
        y * H
      ]
    );

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const [x, y] of pts) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  minX = Math.max(
    0,
    Math.floor(minX)
  );

  minY = Math.max(
    0,
    Math.floor(minY)
  );

  maxX = Math.min(
    W - 1,
    Math.ceil(maxX)
  );

  maxY = Math.min(
    H - 1,
    Math.ceil(maxY)
  );

  function pointInPolygon(px, py) {
    let inside = false;

    for (
      let i = 0,
      j = pts.length - 1;
      i < pts.length;
      j = i++
    ) {
      const xi = pts[i][0];
      const yi = pts[i][1];

      const xj = pts[j][0];
      const yj = pts[j][1];

      const intersect =
        ((yi > py) !== (yj > py)) &&
        (
          px <
          ((xj - xi) *
            (py - yi)) /
            (yj - yi || 1e-9) +
            xi
        );

      if (intersect) {
        inside = !inside;
      }
    }

    return inside;
  }

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {

      if (
        pointInPolygon(
          x + 0.5,
          y + 0.5
        )
      ) {
        m[
          y * W + x
        ] = 1;
      }
    }
  }

  return m;
}


// ============================================================
// GENERATE / HEAL
// ============================================================

generateBtn.addEventListener(
  "click",
  async () => {

    if (!originalImageData) return;

    generateBtn.disabled = true;
    generateBtn.innerHTML =
      "<span>✦</span> Healing…";

    // Always start from the current image.
    const working =
      new ImageData(
        new Uint8ClampedArray(
          originalImageData.data
        ),
        canvas.width,
        canvas.height
      );

    const activeMask =
      mode === "predefined"
        ? buildPredefinedMask()
        : mask;

    // Give the browser a frame before
    // doing the expensive operation.
    await new Promise(
      resolve => setTimeout(resolve, 30)
    );

    try {
      window.inpaint(
        working,
        activeMask,
        12
      );

      ctx.putImageData(
        working,
        0,
        0
      );

      // The healed result becomes the
      // new source for another healing pass.
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

    } catch (error) {
      console.error(error);

      alert(
        "Healing failed. Try a smaller area."
      );
    }

    generateBtn.disabled = false;

    generateBtn.innerHTML =
      "<span>✦</span> Heal selected area";

    redraw();
  }
);


// ============================================================
// RESET
// ============================================================

resetBtn.addEventListener(
  "click",
  () => {

    if (!originalImageData) return;

    mask =
      new Uint8Array(
        canvas.width *
        canvas.height
      );

    redraw();
  }
);


// ============================================================
// SAVE
// ============================================================

downloadBtn.addEventListener(
  "click",
  () => {

    if (!originalImageData) return;

    const output =
      document.createElement("canvas");

    output.width =
      canvas.width;

    output.height =
      canvas.height;

    const outputCtx =
      output.getContext("2d");

    outputCtx.putImageData(
      originalImageData,
      0,
      0
    );

    const link =
      document.createElement("a");

    link.download =
      "healed.png";

    link.href =
      output.toDataURL(
        "image/png"
      );

    link.click();
  }
);


// ============================================================
// BRUSH LABEL
// ============================================================

function updateBrushLabel() {
  brushValue.textContent =
    `${brushSlider.value} px`;
}

brushSlider.addEventListener(
  "input",
  updateBrushLabel
);

updateBrushLabel();


// ============================================================
// INITIAL
// ============================================================

setMode("predefined");

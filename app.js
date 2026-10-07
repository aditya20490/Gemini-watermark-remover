// ---------- Element refs ----------
const uploadInput = document.getElementById('upload');
const uploadBtn = document.getElementById('uploadBtn');
const emptyState = document.getElementById('emptyState');
const workspace = document.getElementById('workspace');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const brushSlider = document.getElementById('brush');
const brushRow = document.getElementById('brushRow');
const generateBtn = document.getElementById('generate');
const downloadBtn = document.getElementById('download');
const resetBtn = document.getElementById('reset');
const themeToggle = document.getElementById('themeToggle');
const modePredefined = document.getElementById('modePredefined');
const modeDoodle = document.getElementById('modeDoodle');

// ---------- Theme handling ----------
const THEME_KEY = 'heal-tool-theme';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0d0d10' : '#f4f5f9');
  try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
}

function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch (e) {}
  if (saved === 'light' || saved === 'dark') {
    applyTheme(saved);
    return;
  }
  const prefersLight = window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: light)').matches;
  applyTheme(prefersLight ? 'light' : 'dark');
}

themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
});

initTheme();

// ---------- Predefined region ----------
// Normalized coordinates (0..1, origin top-left) of the polygon to heal
// when "Predefined" mode is active.
const PREDEFINED_POLYGON = [
  [0.8896, 0.8525],
  [0.9141, 0.8809],
  [0.8789, 0.9092],
  [0.8604, 0.8770],
];

// ---------- State ----------
let originalImageData = null;
let mask = null;
let drawing = false;
let lastPos = null;
let mode = 'predefined'; // 'predefined' | 'doodle'

// ---------- Mode switching ----------
function setMode(newMode) {
  mode = newMode;
  if (mode === 'predefined') {
    modePredefined.classList.add('active');
    modeDoodle.classList.remove('active');
    brushRow.style.display = 'none';
  } else {
    modeDoodle.classList.add('active');
    modePredefined.classList.remove('active');
    brushRow.style.display = 'flex';
  }
  redrawOverlay();
}

modePredefined.addEventListener('click', () => setMode('predefined'));
modeDoodle.addEventListener('click', () => setMode('doodle'));

// ---------- Upload ----------
uploadBtn.onclick = () => uploadInput.click();

uploadInput.onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const img = new Image();
  img.onload = () => {
    const maxW = Math.min(window.innerWidth - 24, 1200);
    const scale = Math.min(1, maxW / img.width);
    canvas.width = Math.floor(img.width * scale);
    canvas.height = Math.floor(img.height * scale);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    mask = new Uint8Array(canvas.width * canvas.height);

    emptyState.classList.add('hidden');
    workspace.classList.remove('hidden');

    setMode(mode); // triggers redrawOverlay()
  };
  img.src = URL.createObjectURL(file);
};

// ---------- Overlay rendering (mask preview) ----------
function redrawOverlay() {
  if (!originalImageData) return;
  // Draw the pristine image, then overlay the current mask
  ctx.putImageData(originalImageData, 0, 0);

  if (mode === 'predefined') {
    drawPredefinedOverlay();
  } else {
    drawMaskOverlay();
  }
}

function drawPredefinedOverlay() {
  const W = canvas.width;
  const H = canvas.height;
  const pts = PREDEFINED_POLYGON.map(([nx, ny]) => [nx * W, ny * H]);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255, 0, 0, 0.35)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 80, 80, 0.9)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawMaskOverlay() {
  if (!mask) return;
  const W = canvas.width;
  const H = canvas.height;
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) {
      const p = i * 4;
      d[p] = Math.round(d[p] * 0.6 + 255 * 0.4);
      d[p + 1] = Math.round(d[p + 1] * 0.6);
      d[p + 2] = Math.round(d[p + 2] * 0.6);
      d[p + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

// ---------- Pointer helpers ----------
function getPos(evt) {
  const rect = canvas.getBoundingClientRect();
  const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
  const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
  return {
    x: (clientX - rect.left) * (canvas.width / rect.width),
    y: (clientY - rect.top) * (canvas.height / rect.height),
  };
}

function paintAt(x, y) {
  const r = Number(brushSlider.value);
  const x0 = Math.max(0, Math.floor(x - r));
  const x1 = Math.min(canvas.width - 1, Math.ceil(x + r));
  const y0 = Math.max(0, Math.floor(y - r));
  const y1 = Math.min(canvas.height - 1, Math.ceil(y + r));
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const dx = px - x, dy = py - y;
      if (dx * dx + dy * dy <= r * r) {
        mask[py * canvas.width + px] = 1;
      }
    }
  }
}

function onDown(e) {
  if (mode !== 'doodle') return;
  e.preventDefault();
  drawing = true;
  lastPos = getPos(e);
  paintAt(lastPos.x, lastPos.y);
  redrawOverlay();
}

function onMove(e) {
  if (mode !== 'doodle' || !drawing) return;
  e.preventDefault();
  const p = getPos(e);
  const dist = Math.hypot(p.x - lastPos.x, p.y - lastPos.y);
  const steps = Math.max(1, Math.floor(dist / 4));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    paintAt(lastPos.x + (p.x - lastPos.x) * t, lastPos.y + (p.y - lastPos.y) * t);
  }
  lastPos = p;
  redrawOverlay();
}

function onUp() {
  drawing = false;
  lastPos = null;
}

canvas.addEventListener('mousedown', onDown);
canvas.addEventListener('mousemove', onMove);
canvas.addEventListener('mouseup', onUp);
canvas.addEventListener('mouseleave', onUp);
canvas.addEventListener('touchstart', onDown, { passive: false });
canvas.addEventListener('touchmove', onMove, { passive: false });
canvas.addEventListener('touchend', onUp);

// ---------- Build a mask from the predefined polygon ----------
function buildPredefinedMask() {
  const W = canvas.width;
  const H = canvas.height;
  const m = new Uint8Array(W * H);

  const pts = PREDEFINED_POLYGON.map(([nx, ny]) => [nx * W, ny * H]);

  // Bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  minX = Math.max(0, Math.floor(minX));
  minY = Math.max(0, Math.floor(minY));
  maxX = Math.min(W - 1, Math.ceil(maxX));
  maxY = Math.min(H - 1, Math.ceil(maxY));

  // Ray-casting point-in-polygon test
  function pointInPoly(px, py) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i][0], yi = pts[i][1];
      const xj = pts[j][0], yj = pts[j][1];
      const intersect =
        ((yi > py) !== (yj > py)) &&
        (px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-9) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (pointInPoly(x + 0.5, y + 0.5)) {
        m[y * W + x] = 1;
      }
    }
  }
  return m;
}

// ---------- Generate (heal) ----------
generateBtn.onclick = () => {
  if (!originalImageData) return;
  generateBtn.disabled = true;
  generateBtn.textContent = 'Healing…';

  const working = new ImageData(
    new Uint8ClampedArray(originalImageData.data),
    canvas.width,
    canvas.height
  );

  const activeMask =
    mode === 'predefined' ? buildPredefinedMask() : mask;

  setTimeout(() => {
    window.inpaint(working, activeMask, 5);
    ctx.putImageData(working, 0, 0);

    // Reset for the next pass
    originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    mask = new Uint8Array(canvas.width * canvas.height);

    generateBtn.disabled = false;
    generateBtn.textContent = '✨ Generate';
    redrawOverlay();
  }, 30);
};

// ---------- Reset ----------
resetBtn.onclick = () => {
  if (!originalImageData) return;
  mask = new Uint8Array(canvas.width * canvas.height);
  redrawOverlay();
};

// ---------- Download ----------
downloadBtn.onclick = () => {
  // Export without the red overlay
  const W = canvas.width;
  const H = canvas.height;
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const octx = out.getContext('2d');
  octx.putImageData(originalImageData, 0, 0);

  const link = document.createElement('a');
  link.download = 'healed.png';
  link.href = out.toDataURL('image/png');
  link.click();
};

// ---------- Initial mode ----------
setMode('predefined');

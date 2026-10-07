// ---------- Element refs ----------
const uploadInput = document.getElementById('upload');
const uploadBtn = document.getElementById('uploadBtn');
const emptyState = document.getElementById('emptyState');
const workspace = document.getElementById('workspace');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const brushSlider = document.getElementById('brush');
const generateBtn = document.getElementById('generate');
const downloadBtn = document.getElementById('download');
const resetBtn = document.getElementById('reset');
const themeToggle = document.getElementById('themeToggle');

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

// ---------- State ----------
let originalImageData = null;
let mask = null;
let drawing = false;
let lastPos = null;

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
  };
  img.src = URL.createObjectURL(file);
};

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
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
  ctx.fill();

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
  e.preventDefault();
  drawing = true;
  lastPos = getPos(e);
  paintAt(lastPos.x, lastPos.y);
}

function onMove(e) {
  if (!drawing) return;
  e.preventDefault();
  const p = getPos(e);
  const dist = Math.hypot(p.x - lastPos.x, p.y - lastPos.y);
  const steps = Math.max(1, Math.floor(dist / 4));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    paintAt(lastPos.x + (p.x - lastPos.x) * t, lastPos.y + (p.y - lastPos.y) * t);
  }
  lastPos = p;
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

  setTimeout(() => {
    window.inpaint(working, mask, 5);
    ctx.putImageData(working, 0, 0);
    mask = new Uint8Array(canvas.width * canvas.height);
    generateBtn.disabled = false;
    generateBtn.textContent = '✨ Generate';
  }, 30);
};

// ---------- Reset ----------
resetBtn.onclick = () => {
  if (!originalImageData) return;
  ctx.putImageData(originalImageData, 0, 0);
  mask = new Uint8Array(canvas.width * canvas.height);
};

// ---------- Download ----------
downloadBtn.onclick = () => {
  const link = document.createElement('a');
  link.download = 'healed.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
};

// app.js
const uploadInput = document.getElementById('upload');
const uploadBtn = document.getElementById('uploadBtn');
const workspace = document.getElementById('workspace');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const brushSlider = document.getElementById('brush');
const generateBtn = document.getElementById('generate');
const downloadBtn = document.getElementById('download');
const resetBtn = document.getElementById('reset');

let originalImage = null;        // HTMLImageElement
let originalImageData = null;    // pristine pixels
let mask = null;                 // Uint8Array, 1 = heal here
let drawing = false;
let lastPos = null;

uploadBtn.onclick = () => uploadInput.click();

uploadInput.onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const img = new Image();
  img.onload = () => {
    originalImage = img;

    // Fit image to canvas while preserving aspect ratio
    const maxW = Math.min(window.innerWidth - 24, 1200);
    const scale = Math.min(1, maxW / img.width);
    canvas.width = Math.floor(img.width * scale);
    canvas.height = Math.floor(img.height * scale);

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    mask = new Uint8Array(canvas.width * canvas.height);

    workspace.classList.remove('hidden');
    uploadBtn.classList.add('hidden');
  };
  img.src = URL.createObjectURL(file);
};

// ---- Drawing the mask ----
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

  // Mark mask pixels
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

function onDown(e) { e.preventDefault(); drawing = true; lastPos = getPos(e); paintAt(lastPos.x, lastPos.y); }
function onMove(e) {
  if (!drawing) return;
  e.preventDefault();
  const p = getPos(e);
  // interpolate between last and current for smooth strokes
  const dist = Math.hypot(p.x - lastPos.x, p.y - lastPos.y);
  const steps = Math.max(1, Math.floor(dist / 4));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    paintAt(lastPos.x + (p.x - lastPos.x) * t, lastPos.y + (p.y - lastPos.y) * t);
  }
  lastPos = p;
}
function onUp() { drawing = false; lastPos = null; }

canvas.addEventListener('mousedown', onDown);
canvas.addEventListener('mousemove', onMove);
canvas.addEventListener('mouseup', onUp);
canvas.addEventListener('mouseleave', onUp);
canvas.addEventListener('touchstart', onDown, { passive: false });
canvas.addEventListener('touchmove', onMove, { passive: false });
canvas.addEventListener('touchend', onUp);

// ---- Generate (heal) ----
generateBtn.onclick = () => {
  generateBtn.disabled = true;
  generateBtn.textContent = 'Healing…';

  // Work on a fresh copy of the original image
  const working = new ImageData(
    new Uint8ClampedArray(originalImageData.data),
    canvas.width,
    canvas.height
  );

  // Run the inpainting (small timeout so the button label updates)
  setTimeout(() => {
    window.inpaint(working, mask, 5);
    ctx.putImageData(working, 0, 0);
    mask = new Uint8Array(canvas.width * canvas.height); // clear mask
    generateBtn.disabled = false;
    generateBtn.textContent = '✨ Generate';
  }, 30);
};

// ---- Reset to original ----
resetBtn.onclick = () => {
  if (!originalImageData) return;
  ctx.putImageData(originalImageData, 0, 0);
  mask = new Uint8Array(canvas.width * canvas.height);
};

// ---- Download ----
downloadBtn.onclick = () => {
  const link = document.createElement('a');
  link.download = 'healed.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
};

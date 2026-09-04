import './research-workbench-v3021.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const viewer = document.getElementById('viewer-scroll');
const stage = document.getElementById('viewer-stage');
const svg = document.getElementById('landmark-layer');
const referenceLayer = document.getElementById('reference-layer');
const review = document.getElementById('review-confirmed');
const toolbarHelp = document.querySelector('.viewer-toolbar p');
const radiusSlider = document.getElementById('radius-slider');
const fileStatus = document.getElementById('file-status');
const caseCode = document.getElementById('case-code');

const CIRCLE_KEYS = new Set(['cabeza', 'femur_proximal', 'femur_f10', 'tibia_t4', 'tibia_t10', 'tobillo']);

// Native v3.0.21 values from graphics_items.py / image_view.py.
// Qt cosmetic pens and ItemIgnoresTransformations are device-pixel based.
const NATIVE_CENTER_RADIUS_PX = 3.8;
const NATIVE_POINT_RADIUS_PX = 4.5;
const NATIVE_ENDPOINT_RADIUS_PX = 3.8;
const NATIVE_EDGE_TOLERANCE_PX = 9.0;

// Browser wheel/trackpad events arrive much more frequently than Qt wheel events.
// Keep wheel as a fine adjustment; direct border dragging remains the primary resize method.
const WEB_RADIUS_WHEEL_STEP = 0.5;
const WEB_RADIUS_WHEEL_THRESHOLD = 24;

let selectedCircleKey = null;
let resizing = null;
let lastCircleTool = null;
let radiusFrame = 0;
let pendingRadius = null;
let overlayScheduled = false;
const radiusWheelAccumulator = new Map();

// v3.0.21 RadiusControl uses an internal scale of 10 = 0.1 px resolution.
if (radiusSlider) radiusSlider.step = '0.1';

function language() {
  return document.documentElement.lang === 'en' ? 'en' : 'es';
}

function deviceScale() {
  return Math.max(1, Number(window.devicePixelRatio) || 1);
}

function nativeCssPixels(devicePixels) {
  return Number(devicePixels) / deviceScale();
}

function stageScale() {
  if (!stage) return 1;
  const transform = window.getComputedStyle(stage).transform;
  if (!transform || transform === 'none') return 1;
  try {
    const matrix = new DOMMatrixReadOnly(transform);
    return Math.max(0.001, Math.hypot(matrix.a, matrix.b));
  } catch (_) {
    const match = transform.match(/^matrix\(([^)]+)\)$/);
    if (!match) return 1;
    const values = match[1].split(',').map(Number);
    return Math.max(0.001, Math.hypot(values[0] || 1, values[1] || 0));
  }
}

function syncNativePixelMetrics() {
  const root = document.documentElement;
  const px = (value) => `${nativeCssPixels(value)}px`;
  root.style.setProperty('--kpai-circle-stroke', px(2.5));
  root.style.setProperty('--kpai-center-stroke', px(1.0));
  root.style.setProperty('--kpai-point-stroke', px(1.5));
  root.style.setProperty('--kpai-endpoint-stroke', px(1.5));
  // Slightly lighter than the native 1.7 px because the browser rasterizer
  // makes these two joint lines appear visually heavier on Retina displays.
  root.style.setProperty('--kpai-reference-line-stroke', px(1.25));
  root.style.setProperty('--kpai-mechanical-axis-stroke', px(2.4));
  root.style.setProperty('--kpai-anatomical-axis-stroke', px(1.8));
  root.style.setProperty('--kpai-local-axis-stroke', px(1.5));
  root.style.setProperty('--kpai-selection-stroke', px(1.0));
}

function updateToolbarHelp() {
  if (!toolbarHelp) return;
  toolbarHelp.dataset.es = 'Círculo: arrastra para mover · arrastra el borde para cambiar radio · rueda: ajuste fino · colocar: cruz';
  toolbarHelp.dataset.en = 'Circle: drag to move · drag the edge to resize · wheel: fine adjustment · placement: crosshair';
  toolbarHelp.textContent = toolbarHelp.dataset[language()];
}

function ensureReviewRecorded() {
  if (!review || review.checked) return;
  review.checked = true;
  review.dispatchEvent(new Event('change', { bubbles: true }));
}

ensureReviewRecorded();
window.setInterval(ensureReviewRecorded, 700);

function placementMode() {
  const activeTool = document.querySelector('[data-tool].active');
  const calibrationActive = document.getElementById('calibrate-25')?.classList.contains('active');
  viewer?.classList.toggle('placement-mode', Boolean(activeTool || calibrationActive));
}

const toolObserver = new MutationObserver(() => {
  const active = document.querySelector('[data-tool].active');
  if (active && CIRCLE_KEYS.has(active.dataset.tool)) lastCircleTool = active.dataset.tool;
  placementMode();
  if (!active && lastCircleTool) {
    const key = lastCircleTool;
    requestAnimationFrame(() => {
      if (circleForKey(key)) selectCircleVisual(key);
    });
  }
});
for (const button of document.querySelectorAll('[data-tool], #calibrate-25')) {
  toolObserver.observe(button, { attributes: true, attributeFilter: ['class'] });
}
placementMode();

function svgPoint(clientX, clientY) {
  const matrix = svg?.getScreenCTM();
  if (!matrix) return null;
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  return point.matrixTransform(matrix.inverse());
}

function circleForKey(key) {
  if (!referenceLayer || !key) return null;
  return [...referenceLayer.querySelectorAll('.reference-circle[data-key]')]
    .find((circle) => circle.dataset.key === key) || null;
}

function circleGeometry(circle) {
  if (!circle) return null;
  const cx = Number(circle.getAttribute('cx'));
  const cy = Number(circle.getAttribute('cy'));
  const radius = Number(circle.getAttribute('r'));
  return [cx, cy, radius].every(Number.isFinite) ? { cx, cy, radius } : null;
}

function classifyReferenceElements() {
  if (!referenceLayer) return;
  syncNativePixelMetrics();
  const scale = stageScale();

  for (const line of referenceLayer.querySelectorAll('.reference-line')) {
    if (!line.dataset.key) {
      let sibling = line.nextElementSibling;
      while (sibling && !sibling.dataset?.key) sibling = sibling.nextElementSibling;
      if (sibling?.dataset?.key) line.dataset.key = sibling.dataset.key;
    }
  }

  for (const handle of referenceLayer.querySelectorAll('.reference-handle[data-key]')) {
    handle.classList.remove('native-circle-center', 'native-landmark-point', 'native-line-endpoint');
    const key = handle.dataset.key;
    const part = handle.dataset.part || '';
    let nativeRadius = NATIVE_ENDPOINT_RADIUS_PX;

    if (handle.classList.contains('reference-point')) {
      handle.classList.add('native-landmark-point');
      nativeRadius = NATIVE_POINT_RADIUS_PX;
    } else if (part === 'point_1' || part === 'point_2') {
      handle.classList.add('native-line-endpoint');
      nativeRadius = NATIVE_ENDPOINT_RADIUS_PX;
    } else if (CIRCLE_KEYS.has(key)) {
      handle.classList.add('native-circle-center');
      nativeRadius = NATIVE_CENTER_RADIUS_PX;
    }

    // Browser SVG uses CSS pixels; native Qt values are device pixels.
    // Divide by devicePixelRatio first, then cancel the radiograph zoom.
    const cssRadius = nativeCssPixels(nativeRadius);
    handle.setAttribute('r', String(cssRadius / scale));
  }
}

function drawSelectionBox() {
  referenceLayer?.querySelectorAll('.circle-selection-box').forEach((node) => node.remove());
  const circle = circleForKey(selectedCircleKey);
  const geometry = circleGeometry(circle);
  if (!geometry || !referenceLayer) return;
  const box = document.createElementNS(SVG_NS, 'rect');
  box.setAttribute('x', String(geometry.cx - geometry.radius));
  box.setAttribute('y', String(geometry.cy - geometry.radius));
  box.setAttribute('width', String(geometry.radius * 2));
  box.setAttribute('height', String(geometry.radius * 2));
  box.setAttribute('class', 'circle-selection-box');
  box.dataset.key = selectedCircleKey;
  referenceLayer.insertBefore(box, referenceLayer.firstChild);
}

function selectCircleVisual(key) {
  if (!circleForKey(key)) return;
  selectedCircleKey = key;
  scheduleNativeOverlaySync();
}

function scheduleNativeOverlaySync() {
  if (overlayScheduled) return;
  overlayScheduled = true;
  requestAnimationFrame(() => {
    overlayScheduled = false;
    classifyReferenceElements();
    drawSelectionBox();
  });
}

if (referenceLayer) {
  new MutationObserver(scheduleNativeOverlaySync).observe(referenceLayer, { childList: true });
}
if (stage) {
  new MutationObserver(scheduleNativeOverlaySync).observe(stage, { attributes: true, attributeFilter: ['style'] });
}
window.addEventListener('resize', scheduleNativeOverlaySync);

function applyRadius(value) {
  if (!radiusSlider || !Number.isFinite(value)) return;
  const min = Math.max(3, Number(radiusSlider.min) || 3);
  const max = Math.max(min, Number(radiusSlider.max) || value);
  const next = Math.max(min, Math.min(max, value));
  radiusSlider.value = String(Math.round(next * 10) / 10);
  radiusSlider.dispatchEvent(new Event('input', { bubbles: true }));
  scheduleNativeOverlaySync();
}

function scheduleRadius(value) {
  pendingRadius = value;
  if (radiusFrame) return;
  radiusFrame = requestAnimationFrame(() => {
    radiusFrame = 0;
    const next = pendingRadius;
    pendingRadius = null;
    applyRadius(next);
  });
}

function edgeDistance(event, circle) {
  const point = svgPoint(event.clientX, event.clientY);
  const geometry = circleGeometry(circle);
  if (!point || !geometry) return null;
  return {
    point,
    geometry,
    distance: Math.hypot(point.x - geometry.cx, point.y - geometry.cy),
  };
}

function isNearCircleEdge(event, circle) {
  const data = edgeDistance(event, circle);
  if (!data) return false;
  const tolerance = nativeCssPixels(NATIVE_EDGE_TOLERANCE_PX) / stageScale();
  return Math.abs(data.distance - data.geometry.radius) <= tolerance;
}

referenceLayer?.addEventListener('pointerdown', (event) => {
  const circle = event.target.closest?.('.reference-circle[data-key]');
  const handle = event.target.closest?.('.reference-handle[data-key]');
  const key = circle?.dataset.key || handle?.dataset.key;
  if (key && circleForKey(key)) selectCircleVisual(key);
  if (!circle || !isNearCircleEdge(event, circle)) return;

  // The base workbench selects the same circle. Subsequent pointer motion is
  // intercepted so dragging the border controls only the radius, 1:1.
  resizing = { key: circle.dataset.key, pointerId: event.pointerId };
  viewer?.classList.add('circle-resizing');
}, true);

svg?.addEventListener('pointermove', (event) => {
  if (resizing && event.pointerId === resizing.pointerId) {
    const circle = circleForKey(resizing.key);
    const data = edgeDistance(event, circle);
    if (!data) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    scheduleRadius(data.distance);
    return;
  }

  const circle = event.target.closest?.('.reference-circle[data-key]');
  referenceLayer?.querySelectorAll('.reference-circle.radius-edge-hover').forEach((node) => node.classList.remove('radius-edge-hover'));
  if (circle && isNearCircleEdge(event, circle)) circle.classList.add('radius-edge-hover');
}, true);

function stopResize(event) {
  if (!resizing || (event.pointerId !== undefined && event.pointerId !== resizing.pointerId)) return;
  resizing = null;
  viewer?.classList.remove('circle-resizing');
  scheduleNativeOverlaySync();
}
window.addEventListener('pointerup', stopResize);
window.addEventListener('pointercancel', stopResize);

// Intercept circle wheel events before the base workbench receives them.
// Trackpad deltas accumulate and produce small 0.5 px changes, preventing sudden jumps.
viewer?.addEventListener('wheel', (event) => {
  if (!event.deltaY) return;
  const key = event.target?.dataset?.key;
  if (!CIRCLE_KEYS.has(key) || !circleForKey(key) || !radiusSlider) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  selectCircleVisual(key);

  const normalized = event.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? event.deltaY : event.deltaY * 18;
  let accumulated = (radiusWheelAccumulator.get(key) || 0) + normalized;
  const direction = Math.sign(accumulated);
  let steps = Math.floor(Math.abs(accumulated) / WEB_RADIUS_WHEEL_THRESHOLD);
  steps = Math.min(2, steps);

  if (steps > 0) {
    const current = Number(radiusSlider.value);
    if (Number.isFinite(current)) {
      applyRadius(current + (direction < 0 ? 1 : -1) * WEB_RADIUS_WHEEL_STEP * steps);
    }
    accumulated -= direction * WEB_RADIUS_WHEEL_THRESHOLD * steps;
  }
  radiusWheelAccumulator.set(key, accumulated);
}, { capture: true, passive: false });

function genericClipboardFilename(name) {
  return /^(image|clipboard|clipboard-image|pasted-image|captura|screenshot)([-_ ]?\d+)?\.(png|jpe?g|webp|tiff?)$/i.test(name || '');
}

function basenameFromClipboardText(value) {
  const raw = String(value || '').trim().split(/\r?\n/).find(Boolean) || '';
  if (!raw) return '';
  try {
    const decoded = decodeURIComponent(raw.replace(/^file:\/\//i, ''));
    const candidate = decoded.split(/[\\/]/).pop()?.trim() || '';
    if (/\.(png|jpe?g|webp|tiff?|dcm|dicom|dcim)$/i.test(candidate)) return candidate;
  } catch (_) {}
  return '';
}

function clipboardOriginalFilename(event) {
  const files = [...(event.clipboardData?.files || [])];
  const image = files.find((file) => file.type?.startsWith('image/'));
  if (image?.name && !genericClipboardFilename(image.name)) return image.name;

  const uriName = basenameFromClipboardText(event.clipboardData?.getData('text/uri-list'));
  if (uriName) return uriName;
  const textName = basenameFromClipboardText(event.clipboardData?.getData('text/plain'));
  if (textName) return textName;
  return '';
}

function caseCodeFromOriginalFilename(filename) {
  const lastDot = filename.lastIndexOf('.');
  const base = (lastDot > 0 ? filename.slice(0, lastDot) : filename).normalize('NFC').trim();
  return base.replace(/[\u0000-\u001F<>:"/\\|?*]/g, '-').replace(/-+/g, '-').slice(0, 120).trim();
}

function restorePastedFilename(filename, attempts = 0) {
  if (!filename || !fileStatus) return;
  const text = fileStatus.textContent || '';
  const stillLoading = /Procesando localmente|Processing locally/i.test(text);
  if (stillLoading && attempts < 40) {
    window.setTimeout(() => restorePastedFilename(filename, attempts + 1), 50);
    return;
  }
  if (stillLoading) return;

  const suffixMatch = text.match(/\s·\s\d+\s×\s\d+\s*$/);
  fileStatus.textContent = `${filename}${suffixMatch ? suffixMatch[0] : ''}`;
  const recoveredCode = caseCodeFromOriginalFilename(filename);
  if (recoveredCode && caseCode) {
    caseCode.value = recoveredCode;
    caseCode.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

// Safari often keeps the actual filename when a file is copied from Finder,
// even though the base UI used to replace the visible label with “Portapapeles”.
// Capture that metadata before the base paste handler runs and restore it afterward.
window.addEventListener('paste', (event) => {
  const filename = clipboardOriginalFilename(event);
  if (!filename) return;
  window.setTimeout(() => restorePastedFilename(filename), 0);
}, { capture: true });

for (const button of document.querySelectorAll('[data-language]')) {
  button.addEventListener('click', () => requestAnimationFrame(() => {
    updateToolbarHelp();
    scheduleNativeOverlaySync();
  }));
}

syncNativePixelMetrics();
updateToolbarHelp();
scheduleNativeOverlaySync();

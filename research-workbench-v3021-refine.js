import './research-workbench-v3021.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const viewer = document.getElementById('viewer-scroll');
const stage = document.getElementById('viewer-stage');
const svg = document.getElementById('landmark-layer');
const referenceLayer = document.getElementById('reference-layer');
const review = document.getElementById('review-confirmed');
const toolbarHelp = document.querySelector('.viewer-toolbar p');
const radiusSlider = document.getElementById('radius-slider');
const canvas = document.getElementById('radiograph-canvas');

const CIRCLE_KEYS = new Set(['cabeza', 'femur_proximal', 'femur_f10', 'tibia_t4', 'tibia_t10', 'tobillo']);
const NATIVE_CENTER_RADIUS_PX = 3.8;
const NATIVE_POINT_RADIUS_PX = 4.5;
const NATIVE_ENDPOINT_RADIUS_PX = 3.8;
const NATIVE_EDGE_TOLERANCE_PX = 9.0;
const NATIVE_RADIUS_STEP_PX = 2.0;

let selectedCircleKey = null;
let resizing = null;
let lastCircleTool = null;
let radiusFrame = 0;
let pendingRadius = null;
let overlayScheduled = false;

// v3.0.21 RadiusControl uses an internal scale of 10 = 0.1 px resolution.
if (radiusSlider) radiusSlider.step = '0.1';

function language() {
  return document.documentElement.lang === 'en' ? 'en' : 'es';
}

function updateToolbarHelp() {
  if (!toolbarHelp) return;
  toolbarHelp.dataset.es = 'Círculo: arrastra para mover · borde (±9 px): cambia radio · rueda: ±2 px · colocar: cruz';
  toolbarHelp.dataset.en = 'Circle: drag to move · edge (±9 px): resize · wheel: ±2 px · placement: crosshair';
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

function screenScale() {
  const matrix = svg?.getScreenCTM();
  if (!matrix) return 1;
  return Math.max(0.001, Math.hypot(matrix.a, matrix.b));
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
  const scale = screenScale();

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
    let screenRadius = NATIVE_ENDPOINT_RADIUS_PX;

    if (handle.classList.contains('reference-point')) {
      handle.classList.add('native-landmark-point');
      screenRadius = NATIVE_POINT_RADIUS_PX;
    } else if (part === 'point_1' || part === 'point_2') {
      handle.classList.add('native-line-endpoint');
      screenRadius = NATIVE_ENDPOINT_RADIUS_PX;
    } else if (CIRCLE_KEYS.has(key)) {
      handle.classList.add('native-circle-center');
      screenRadius = NATIVE_CENTER_RADIUS_PX;
    }

    // Equivalent to QGraphicsItem::ItemIgnoresTransformations in v3.0.21:
    // marker dimensions remain constant on screen at every zoom level.
    handle.setAttribute('r', String(screenRadius / scale));
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
  const tolerance = NATIVE_EDGE_TOLERANCE_PX / screenScale();
  return Math.abs(data.distance - data.geometry.radius) <= tolerance;
}

referenceLayer?.addEventListener('pointerdown', (event) => {
  const circle = event.target.closest?.('.reference-circle[data-key]');
  const handle = event.target.closest?.('.reference-handle[data-key]');
  const key = circle?.dataset.key || handle?.dataset.key;
  if (key && circleForKey(key)) selectCircleVisual(key);
  if (!circle || !isNearCircleEdge(event, circle)) return;

  // Base workbench receives pointerdown and selects this circle internally.
  // We intercept only pointer movement to reproduce v3.0.21 direct 1:1 resize.
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

// The native app changes every circle by exactly ±2.0 image pixels for each
// wheel event. The base web module has a width-dependent step; it runs first,
// then this listener corrects the remainder so the total matches v3.0.21.
viewer?.addEventListener('wheel', (event) => {
  if (!event.deltaY) return;
  const key = event.target?.dataset?.key;
  if (!CIRCLE_KEYS.has(key) || !circleForKey(key) || !radiusSlider) return;

  selectCircleVisual(key);
  const direction = event.deltaY < 0 ? 1 : -1;
  const imageWidth = Number(canvas?.width) || 0;
  const baseStep = Math.max(0.6, Math.min(3, imageWidth / 1400));
  const currentAfterBase = Number(radiusSlider.value);
  if (Number.isFinite(currentAfterBase)) {
    applyRadius(currentAfterBase + direction * (NATIVE_RADIUS_STEP_PX - baseStep));
  }
}, { passive: false });

for (const button of document.querySelectorAll('[data-language]')) {
  button.addEventListener('click', () => requestAnimationFrame(() => {
    updateToolbarHelp();
    scheduleNativeOverlaySync();
  }));
}

updateToolbarHelp();
scheduleNativeOverlaySync();

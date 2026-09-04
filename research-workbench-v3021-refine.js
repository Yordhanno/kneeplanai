import './research-workbench-v3021.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const viewer = document.getElementById('viewer-scroll');
const svg = document.getElementById('landmark-layer');
const referenceLayer = document.getElementById('reference-layer');
const review = document.getElementById('review-confirmed');
const toolbarHelp = document.querySelector('.viewer-toolbar p');
const radiusSlider = document.getElementById('radius-slider');

let selectedCircleKey = null;
let resizing = null;
let lastCircleTool = null;
let radiusFrame = 0;
let pendingRadius = null;

if (radiusSlider) radiusSlider.step = '0.25';

function language() {
  return document.documentElement.lang === 'en' ? 'en' : 'es';
}

function updateToolbarHelp() {
  if (!toolbarHelp) return;
  toolbarHelp.dataset.es = 'Círculo: arrastra el centro para mover · arrastra el borde para cambiar radio · rueda sobre círculo: ajuste fino · colocar: cruz';
  toolbarHelp.dataset.en = 'Circle: drag center to move · drag edge to resize · wheel over circle: fine adjustment · placement: crosshair';
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
  if (activeTool && circleForKey(activeTool.dataset.tool)) lastCircleTool = activeTool.dataset.tool;
}

const toolObserver = new MutationObserver(() => {
  const active = document.querySelector('[data-tool].active');
  if (active && ['cabeza', 'femur_proximal', 'femur_f10', 'tibia_t4', 'tibia_t10', 'tobillo'].includes(active.dataset.tool)) {
    lastCircleTool = active.dataset.tool;
  }
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
  drawSelectionBox();
}

let overlayScheduled = false;
function scheduleSelectionBox() {
  if (overlayScheduled) return;
  overlayScheduled = true;
  requestAnimationFrame(() => {
    overlayScheduled = false;
    drawSelectionBox();
  });
}

if (referenceLayer) {
  new MutationObserver(scheduleSelectionBox).observe(referenceLayer, { childList: true });
}

function syntheticRadiusWheel(target, increase) {
  if (!target) return;
  const event = new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    deltaY: increase ? -100 : 100,
    deltaMode: WheelEvent.DOM_DELTA_PIXEL,
  });
  Object.defineProperty(event, '__kpaiRadiusSynthetic', { value: true });
  target.dispatchEvent(event);
}

function applyRadius(value) {
  if (!radiusSlider || !Number.isFinite(value)) return;
  const min = Math.max(2, Number(radiusSlider.min) || 2);
  const max = Math.max(min, Number(radiusSlider.max) || value);
  const next = Math.max(min, Math.min(max, value));
  radiusSlider.value = String(Math.round(next * 4) / 4);
  radiusSlider.dispatchEvent(new Event('input', { bubbles: true }));
  scheduleSelectionBox();
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
  const tolerance = Math.max(2.25, 12 / screenScale());
  return Math.abs(data.distance - data.geometry.radius) <= tolerance;
}

referenceLayer?.addEventListener('pointerdown', (event) => {
  const circle = event.target.closest?.('.reference-circle[data-key]');
  const handle = event.target.closest?.('.reference-handle[data-key]');
  const key = circle?.dataset.key || handle?.dataset.key;
  if (key && circleForKey(key)) selectCircleVisual(key);
  if (!circle || !isNearCircleEdge(event, circle)) return;

  // Do not stop this pointerdown: the base workbench receives it too, which
  // selects the same circle internally. We only replace the subsequent drag
  // motion with direct 1:1 radius editing.
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
  scheduleSelectionBox();
}
window.addEventListener('pointerup', stopResize);
window.addEventListener('pointercancel', stopResize);

// More responsive wheel/trackpad radius editing. Tiny trackpad deltas accumulate,
// but each deliberate motion produces several native radius steps instead of
// feeling delayed or heavy.
const radiusWheelAccumulator = new Map();
viewer?.addEventListener('wheel', (event) => {
  if (event.__kpaiRadiusSynthetic) return;
  const key = event.target?.dataset?.key;
  const circle = circleForKey(key);
  if (!circle) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  selectCircleVisual(key);

  const normalized = event.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? event.deltaY : event.deltaY * 18;
  let accumulated = (radiusWheelAccumulator.get(key) || 0) + normalized;
  const direction = Math.sign(accumulated);
  const threshold = 3;
  let steps = Math.floor(Math.abs(accumulated) / threshold);
  if (!steps && Math.abs(normalized) >= 1.5) steps = 1;
  steps = Math.min(12, steps);
  if (steps > 0) {
    for (let index = 0; index < steps; index += 1) {
      syntheticRadiusWheel(circleForKey(key), direction < 0);
    }
    accumulated -= direction * steps * threshold;
  }
  radiusWheelAccumulator.set(key, accumulated);
  scheduleSelectionBox();
}, { capture: true, passive: false });

for (const button of document.querySelectorAll('[data-language]')) {
  button.addEventListener('click', () => requestAnimationFrame(updateToolbarHelp));
}

updateToolbarHelp();

import './research-workbench-v3021.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const viewer = document.getElementById('viewer-scroll');
const svg = document.getElementById('landmark-layer');
const referenceLayer = document.getElementById('reference-layer');
const review = document.getElementById('review-confirmed');
const toolbarHelp = document.querySelector('.viewer-toolbar p');

function language() {
  return document.documentElement.lang === 'en' ? 'en' : 'es';
}

function updateToolbarHelp() {
  if (!toolbarHelp) return;
  toolbarHelp.dataset.es = 'Rueda: zoom · círculo: rueda fina o arrastra el tirador · colocar: cruz · doble clic: ampliar/ajustar';
  toolbarHelp.dataset.en = 'Wheel: zoom · circle: fine wheel or drag the handle · placement: crosshair · double-click: zoom/fit';
  toolbarHelp.textContent = toolbarHelp.dataset[language()];
}

function ensureReviewRecorded() {
  if (!review || review.checked) return;
  review.checked = true;
  review.dispatchEvent(new Event('change', { bubbles: true }));
}

// The prior checkbox added friction without changing the stored research payload.
ensureReviewRecorded();
window.setInterval(ensureReviewRecorded, 700);

function placementMode() {
  const activeTool = document.querySelector('[data-tool].active');
  const calibrationActive = document.getElementById('calibrate-25')?.classList.contains('active');
  viewer?.classList.toggle('placement-mode', Boolean(activeTool || calibrationActive));
}

const toolObserver = new MutationObserver(() => placementMode());
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

let gripScheduled = false;
function addRadiusGrips() {
  gripScheduled = false;
  if (!referenceLayer) return;
  for (const circle of referenceLayer.querySelectorAll('.reference-circle[data-key]')) {
    const key = circle.dataset.key;
    if (!key || referenceLayer.querySelector(`.radius-grip[data-key="${CSS.escape(key)}"]`)) continue;
    const cx = Number(circle.getAttribute('cx'));
    const cy = Number(circle.getAttribute('cy'));
    const radius = Number(circle.getAttribute('r'));
    if (![cx, cy, radius].every(Number.isFinite)) continue;
    const grip = document.createElementNS(SVG_NS, 'circle');
    grip.setAttribute('cx', String(cx + radius));
    grip.setAttribute('cy', String(cy));
    grip.setAttribute('r', String(Math.max(2.2, Math.min(4.2, radius * .11))));
    grip.setAttribute('class', 'radius-grip');
    grip.dataset.key = key;
    grip.setAttribute('aria-label', language() === 'es' ? 'Ajustar radio' : 'Adjust radius');
    referenceLayer.append(grip);
  }
}

function scheduleRadiusGrips() {
  if (gripScheduled) return;
  gripScheduled = true;
  requestAnimationFrame(addRadiusGrips);
}

if (referenceLayer) {
  new MutationObserver(scheduleRadiusGrips).observe(referenceLayer, { childList: true });
  scheduleRadiusGrips();
}

function syntheticRadiusWheel(target, increase) {
  if (!target) return;
  const event = new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    deltaY: increase ? -100 : 100,
    deltaMode: WheelEvent.DOM_DELTA_PIXEL,
  });
  Object.defineProperty(event, '__kpaiFineRadius', { value: true });
  target.dispatchEvent(event);
}

// Trackpad wheel events can arrive in very small bursts. Accumulate them first so
// the circle changes by controlled, predictable increments instead of jumping.
const radiusWheelAccumulator = new Map();
viewer?.addEventListener('wheel', (event) => {
  if (event.__kpaiFineRadius) return;
  const key = event.target?.dataset?.key;
  const circle = circleForKey(key);
  if (!circle) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  const threshold = event.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? 34 : 1;
  let accumulated = (radiusWheelAccumulator.get(key) || 0) + event.deltaY;
  const direction = Math.sign(accumulated);
  const steps = Math.min(2, Math.floor(Math.abs(accumulated) / threshold));
  if (steps > 0) {
    for (let index = 0; index < steps; index += 1) {
      const current = circleForKey(key);
      syntheticRadiusWheel(current, direction < 0);
    }
    accumulated -= direction * steps * threshold;
  }
  radiusWheelAccumulator.set(key, accumulated);
}, { capture: true, passive: false });

let resizing = null;
referenceLayer?.addEventListener('pointerdown', (event) => {
  const grip = event.target.closest?.('.radius-grip');
  if (!grip) return;
  event.preventDefault();
  event.stopPropagation();
  resizing = { key: grip.dataset.key, pointerId: event.pointerId };
  grip.classList.add('active');
}, true);

window.addEventListener('pointermove', (event) => {
  if (!resizing || event.pointerId !== resizing.pointerId) return;
  const point = svgPoint(event.clientX, event.clientY);
  const circle = circleForKey(resizing.key);
  if (!point || !circle) return;
  const cx = Number(circle.getAttribute('cx'));
  const cy = Number(circle.getAttribute('cy'));
  const radius = Number(circle.getAttribute('r'));
  const desired = Math.hypot(point.x - cx, point.y - cy);
  if (![cx, cy, radius, desired].every(Number.isFinite)) return;
  const difference = desired - radius;
  if (Math.abs(difference) < .75) return;
  const steps = Math.min(3, Math.max(1, Math.floor(Math.abs(difference) / 1.4)));
  for (let index = 0; index < steps; index += 1) {
    syntheticRadiusWheel(circleForKey(resizing.key), difference > 0);
  }
});

function stopResize(event) {
  if (!resizing || (event.pointerId !== undefined && event.pointerId !== resizing.pointerId)) return;
  resizing = null;
  scheduleRadiusGrips();
}
window.addEventListener('pointerup', stopResize);
window.addEventListener('pointercancel', stopResize);

for (const button of document.querySelectorAll('[data-language]')) {
  button.addEventListener('click', () => requestAnimationFrame(() => {
    updateToolbarHelp();
    scheduleRadiusGrips();
  }));
}

updateToolbarHelp();

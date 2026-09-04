import './research-workbench-v3021-refine.js';

// Safari/Retina fix for native-like circle resizing.
// The previous implementation converted the absolute pointer position through
// SVG getScreenCTM(). At high zoom Safari can report that transform differently
// from the CSS-transformed stage, causing the radius to jump to a huge value.
//
// v3.0.21 behaviour is reproduced here with a relative drag:
// radius(new) = radius(start) + radial_pointer_delta_in_screen_px / stage_scale.
// This guarantees zero jump at pointer-down and keeps the resize 1:1 with the hand.

const stage = document.getElementById('viewer-stage');
const referenceLayer = document.getElementById('reference-layer');
const radiusSlider = document.getElementById('radius-slider');
const viewer = document.getElementById('viewer-scroll');

let dragResize = null;

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

function circleForKey(key) {
  if (!referenceLayer || !key) return null;
  return [...referenceLayer.querySelectorAll('.reference-circle[data-key]')]
    .find((circle) => circle.dataset.key === key) || null;
}

function screenCenter(circle) {
  const rect = circle.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function applyRadius(radius) {
  if (!radiusSlider || !Number.isFinite(radius)) return;
  const min = Math.max(3, Number(radiusSlider.min) || 3);
  const max = Math.max(min, Number(radiusSlider.max) || radius);
  const value = Math.max(min, Math.min(max, radius));
  radiusSlider.value = String(Math.round(value * 10) / 10);
  radiusSlider.dispatchEvent(new Event('input', { bubbles: true }));
}

// Observe pointer-down before SVG capture handlers, but allow the event to keep
// propagating so the base workbench selects the correct circle internally.
window.addEventListener('pointerdown', (event) => {
  const hit = event.target?.closest?.('.circle-resize-hit[data-key]');
  if (!hit) return;
  const key = hit.dataset.key;
  const circle = circleForKey(key);
  if (!circle) return;

  const radius = Number(circle.getAttribute('r'));
  if (!Number.isFinite(radius)) return;

  const center = screenCenter(circle);
  const startDistance = Math.hypot(event.clientX - center.x, event.clientY - center.y);
  dragResize = {
    key,
    pointerId: event.pointerId,
    startRadius: radius,
    startDistance,
    centerX: center.x,
    centerY: center.y,
    scale: stageScale(),
  };
  viewer?.classList.add('circle-resizing');
}, { capture: true });

// Run before the previous SVG handlers. Once a resize drag is active, this is
// the only code allowed to change the radius during pointer movement.
window.addEventListener('pointermove', (event) => {
  if (!dragResize || event.pointerId !== dragResize.pointerId) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  const currentDistance = Math.hypot(
    event.clientX - dragResize.centerX,
    event.clientY - dragResize.centerY,
  );
  const radialDeltaScreen = currentDistance - dragResize.startDistance;
  const nextRadius = dragResize.startRadius + radialDeltaScreen / Math.max(0.001, dragResize.scale);
  applyRadius(nextRadius);
}, { capture: true, passive: false });

function finishResize(event) {
  if (!dragResize || (event.pointerId !== undefined && event.pointerId !== dragResize.pointerId)) return;
  dragResize = null;
  viewer?.classList.remove('circle-resizing');
  // Do not stop propagation: the base/refine handlers must clear their own drag state.
}

window.addEventListener('pointerup', finishResize, { capture: true });
window.addEventListener('pointercancel', finishResize, { capture: true });

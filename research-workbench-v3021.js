import { calculateMeasurements, missingGeometry, normalizeGeometry, roundMeasurements, seedLocalAxes } from './research-math.js';
import { loadRadiograph } from './research-imaging.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const APP_VERSION = 'KneePlanAI Web Research 1.1.1';
const CALIBRATION_DIAMETER_MM = 25;
const MIN_ZOOM = 65;
const MAX_ZOOM = 3500;
const WHEEL_ZOOM_FACTOR = 1.06;
const BUTTON_ZOOM_FACTOR = 1.12;
const CIRCLES = new Set(['cabeza', 'femur_proximal', 'femur_f10', 'tibia_t4', 'tibia_t10', 'tobillo']);
const POINTS = new Set(['femur_distal', 'tibia_proximal']);
const LINES = new Set(['linea_femoral', 'linea_tibial']);
const COMPACT_LABELS = new Set(['femur_f10', 'tibia_t4', 'tibia_t10']);
const LABELS = {
  cabeza: 'FH', femur_proximal: 'FAA-P', femur_distal: 'FN', femur_f10: 'F10',
  linea_femoral: 'FMC–FLC', tibia_proximal: 'TP', tibia_t4: 'T4',
  tibia_t10: 'T10', linea_tibial: 'TMP–TLP', tobillo: 'AC',
};
const RESULT_ROWS = [
  ['HKA', 'HKA_firmado'], ['Alineación', 'clasificacion_HKA'], ['HKA interno', 'HKA_interno'],
  ['mLDFA', 'mLDFA'], ['MPTA', 'MPTA'], ['JLCA', 'JLCA_firmado'], ['aLDFA', 'aLDFA'],
  ['Valgo femoral', 'Valgo_femoral'], ['aFTA', 'aFTA'], ['aHKA', 'aHKA'],
  ['JLO', 'JLO_CPAK'], ['CPAK', 'CPAK_tipo'],
];
const ROLE_LABELS = {
  es: { validator: 'Validador externo', tester: 'Tester', both: 'Validador y tester' },
  en: { validator: 'External validator', tester: 'Tester', both: 'Validator and tester' },
};
const COPY = {
  es: {
    title: 'KneePlanAI Research | Programa web',
    ready: 'Radiografía lista. Selecciona una referencia para comenzar.',
    loadError: 'No se pudo abrir la imagen.',
    compressedDicom: 'Este DICOM utiliza compresión no compatible. Expórtalo como DICOM sin comprimir, PNG o TIFF.',
    tool: 'Sitúa {label} sobre la radiografía.',
    lineFirst: 'Sitúa el primer extremo de {label}.',
    lineSecond: 'Ahora sitúa el segundo extremo de {label}.',
    incomplete: 'Completa todas las referencias antes de finalizar.',
    review: 'Confirma la revisión de las referencias y la desidentificación del caso.',
    saved: 'Resultado sincronizado. Ya forma parte del CSV para Excel y del JSON acumulado.',
    saveError: 'No fue posible sincronizar el resultado.',
    invalidCase: 'El nombre del archivo no puede usarse como código de caso.',
    axesNeed: 'Primero sitúa FH, FAA-P, FN, TP y AC.',
    statusOpen: 'Abra una radiografía para comenzar.',
    statusStart: 'Seleccione una referencia anatómica y sitúela en la imagen.',
    statusContinue: 'Complete las referencias anatómicas.',
    statusReady: 'Resultados calculados. Revise el control de calidad y finalice el caso.',
    statusSaved: 'Resultado sincronizado. Puede continuar con la siguiente radiografía.',
    resultSaved: 'Imagen de resultado descargada.',
    reportSaved: 'Informe PDF descargado.',
    downloadError: 'No fue posible generar la descarga.',
    calibrationStart: 'Escala 25 mm: marque un borde del marcador circular.',
    calibrationSecond: 'Escala 25 mm: marque el borde opuesto del marcador.',
    calibrationInvalid: 'La escala marcada es demasiado pequeña. Repita la calibración.',
    calibrationReady: 'Escala calibrada: 25 mm = {px} px · {spacing} mm/px.',
    calibrationNone: 'Escala 25 mm no definida. DICOM puede usar Pixel Spacing cuando esté disponible.',
    calibrationDicom: 'Pixel Spacing DICOM disponible: {spacing} mm/px. Puede reemplazarlo con escala manual de 25 mm.',
    pasted: 'Imagen pegada desde el portapapeles.',
  },
  en: {
    title: 'KneePlanAI Research | Web program',
    ready: 'Radiograph ready. Select a landmark to begin.',
    loadError: 'The image could not be opened.',
    compressedDicom: 'This DICOM uses unsupported compression. Export it as uncompressed DICOM, PNG or TIFF.',
    tool: 'Place {label} on the radiograph.',
    lineFirst: 'Place the first endpoint of {label}.',
    lineSecond: 'Now place the second endpoint of {label}.',
    incomplete: 'Complete every landmark before finishing.',
    review: 'Confirm landmark review and case de-identification.',
    saved: 'Result synchronized. It is now part of the cumulative Excel-ready CSV and JSON.',
    saveError: 'The result could not be synchronized.',
    invalidCase: 'The filename cannot be used as a case code.',
    axesNeed: 'Place FH, FAA-P, FN, TP and AC first.',
    statusOpen: 'Open a radiograph to begin.',
    statusStart: 'Select an anatomical landmark and place it on the image.',
    statusContinue: 'Complete the anatomical landmarks.',
    statusReady: 'Results calculated. Review quality control and finish the case.',
    statusSaved: 'Result synchronized. You can continue with the next radiograph.',
    resultSaved: 'Result image downloaded.',
    reportSaved: 'PDF report downloaded.',
    downloadError: 'The download could not be generated.',
    calibrationStart: '25 mm scale: mark one edge of the circular marker.',
    calibrationSecond: '25 mm scale: mark the opposite edge of the marker.',
    calibrationInvalid: 'The marked scale is too small. Repeat calibration.',
    calibrationReady: 'Scale calibrated: 25 mm = {px} px · {spacing} mm/px.',
    calibrationNone: '25 mm scale not defined. DICOM Pixel Spacing is used when available.',
    calibrationDicom: 'DICOM Pixel Spacing available: {spacing} mm/px. You can replace it with a manual 25 mm scale.',
    pasted: 'Image pasted from clipboard.',
  },
};

const state = {
  language: 'es', user: null, geometry: {}, activeTool: null, lineStart: null,
  selectedKey: null, drag: null, width: 0, height: 0, zoom: 100,
  fitScale: 1, scale: 1, panX: 0, panY: 0,
  imageHash: '', filenameHash: '', fileName: '', technical: null, openedAt: null, results: null,
  calibration: null, calibrationStart: null,
};

const canvas = document.getElementById('radiograph-canvas');
const stage = document.getElementById('viewer-stage');
const viewer = document.getElementById('viewer-scroll');
const svg = document.getElementById('landmark-layer');
const referenceLayer = document.getElementById('reference-layer');
const axisLayer = document.getElementById('axis-layer');
const guidance = document.getElementById('tool-guidance');
const radiusControl = document.getElementById('radius-control');
const radiusSlider = document.getElementById('radius-slider');
const saveButton = document.getElementById('save-result');
const downloadResultButton = document.getElementById('download-result');
const downloadReportButton = document.getElementById('download-report');
const calibrationButton = document.getElementById('calibrate-25');
const calibrationStatus = document.getElementById('calibration-status');

function detectLanguage() {
  try { const saved = localStorage.getItem('kneeplanai-language'); if (['es', 'en'].includes(saved)) return saved; } catch (_) {}
  return (navigator.languages || [navigator.language || 'en']).some((value) => value.toLowerCase().startsWith('es')) ? 'es' : 'en';
}

function setLanguage(language, persist = true) {
  state.language = language === 'en' ? 'en' : 'es';
  document.documentElement.lang = state.language;
  document.title = COPY[state.language].title;
  document.querySelectorAll('[data-es][data-en]').forEach((element) => { element.textContent = element.dataset[state.language]; });
  document.querySelectorAll('[data-language]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.language === state.language)));
  if (state.user) document.getElementById('workbench-role').textContent = ROLE_LABELS[state.language][state.user.role] || state.user.role;
  updateCompletion();
  updateCalibrationStatus();
  if (persist) { try { localStorage.setItem('kneeplanai-language', state.language); } catch (_) {} }
}

function showMessage(text, type = 'success') {
  const element = document.getElementById(type === 'error' ? 'workbench-error' : 'workbench-message');
  const other = document.getElementById(type === 'error' ? 'workbench-message' : 'workbench-error');
  other.classList.remove('visible');
  element.textContent = text;
  element.className = `portal-alert ${type} workbench-alert visible`;
  window.clearTimeout(element._hideTimer);
  element._hideTimer = window.setTimeout(() => element.classList.remove('visible'), 7000);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { accept: 'application/json', ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'default');
  return payload;
}

async function loadIdentity() {
  try {
    const payload = await api('/api/research/me');
    state.user = payload.user;
    document.getElementById('workbench-user').textContent = `${payload.user.full_name} · ${payload.user.kneeplan_id}`;
    document.getElementById('workbench-role').textContent = ROLE_LABELS[state.language][payload.user.role] || payload.user.role;
    updateSaveState();
  } catch (error) {
    showMessage(error.message === 'device_not_authorized'
      ? (state.language === 'es' ? 'Esta identidad está vinculada a otro dispositivo.' : 'This identity is linked to another device.')
      : COPY[state.language].saveError, 'error');
  }
}

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}

function pointFromEvent(event) {
  const rect = viewer.getBoundingClientRect();
  return [
    Math.max(0, Math.min(state.width, (event.clientX - rect.left - state.panX) / state.scale)),
    Math.max(0, Math.min(state.height, (event.clientY - rect.top - state.panY) / state.scale)),
  ];
}

function center(item) { return item?.center || item?.position || null; }
function midpoint(a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
function baseLabelFont(key) {
  const raw = Math.min(state.width, state.height) / 70;
  return Math.max(COMPACT_LABELS.has(key) ? 9 : 10, Math.min(COMPACT_LABELS.has(key) ? 16 : 20, raw));
}

function labelPosition(key, point, item = null) {
  const fontSize = baseLabelFont(key);
  if (item?.type === 'circle') {
    const direction = point[0] <= state.width / 2 ? 1 : -1;
    const distance = item.radius + fontSize * .55;
    return { x: point[0] + direction * distance, y: point[1] + fontSize * .28, anchor: direction > 0 ? 'start' : 'end', fontSize };
  }
  const direction = point[0] <= state.width / 2 ? 1 : -1;
  return { x: point[0] + direction * fontSize * .55, y: point[1] - fontSize * .45, anchor: direction > 0 ? 'start' : 'end', fontSize };
}

function appendLabel(key, point, item = null, textOverride = null) {
  const pos = labelPosition(key, point, item);
  const label = svgElement('text', {
    x: pos.x, y: pos.y, class: `reference-label${COMPACT_LABELS.has(key) ? ' compact' : ''}`,
    'font-size': pos.fontSize, 'text-anchor': pos.anchor,
  });
  label.textContent = textOverride || LABELS[key];
  referenceLayer.append(label);
}

function handleRadius() { return Math.max(4, Math.min(16, Math.min(state.width, state.height) / 150)); }
function draggableAttributes(key, part = '') { return { class: 'reference-handle draggable', r: handleRadius(), 'data-key': key, 'data-part': part }; }

function renderGeometry() {
  referenceLayer.replaceChildren();
  axisLayer.replaceChildren();
  for (const [key, item] of Object.entries(state.geometry)) {
    if (item.type === 'circle') {
      const circle = svgElement('circle', {
        cx: item.center[0], cy: item.center[1], r: item.radius,
        class: 'reference-circle draggable', 'data-key': key, 'data-part': 'circle',
      });
      const centerPoint = svgElement('circle', { cx: item.center[0], cy: item.center[1], ...draggableAttributes(key) });
      referenceLayer.append(circle, centerPoint);
      appendLabel(key, item.center, item);
    } else if (item.type === 'point') {
      const point = svgElement('circle', { cx: item.position[0], cy: item.position[1], ...draggableAttributes(key) });
      point.classList.add('reference-point'); referenceLayer.append(point); appendLabel(key, item.position, item);
    } else if (item.type === 'line') {
      const line = svgElement('line', { x1: item.point_1[0], y1: item.point_1[1], x2: item.point_2[0], y2: item.point_2[1], class: 'reference-line' });
      const first = svgElement('circle', { cx: item.point_1[0], cy: item.point_1[1], ...draggableAttributes(key, 'point_1') });
      const second = svgElement('circle', { cx: item.point_2[0], cy: item.point_2[1], ...draggableAttributes(key, 'point_2') });
      referenceLayer.append(line, first, second);
      appendLabel(key, midpoint(item.point_1, item.point_2), item);
    }
  }
  drawAxes();
  renderCalibration();
  updateCompletion(); updateToolButtons(); updateRadiusControl();
}

function appendAxis(className, a, b, extra = {}) {
  if (a && b) axisLayer.append(svgElement('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: `axis-line ${className}`, ...extra }));
}

function tibialGuideIntersection() {
  const t4 = center(state.geometry.tibia_t4);
  const t10 = center(state.geometry.tibia_t10);
  const tp = center(state.geometry.tibia_proximal);
  if (!t4 || !t10 || !tp || Math.abs(t10[1] - t4[1]) < 1e-9) return null;
  const t = (tp[1] - t4[1]) / (t10[1] - t4[1]);
  return [t4[0] + (t10[0] - t4[0]) * t, tp[1]];
}

function drawAxes() {
  const g = state.geometry;
  appendAxis('axis-mechanical-femur', center(g.cabeza), center(g.femur_distal));
  appendAxis('axis-mechanical-tibia', center(g.tibia_proximal), center(g.tobillo));
  appendAxis('axis-anatomical', center(g.femur_proximal), center(g.femur_distal));
  appendAxis('axis-local-femur', center(g.femur_f10), center(g.femur_distal));
  appendAxis('axis-local-tibia', center(g.tibia_t4), center(g.tibia_t10));
  const intersection = tibialGuideIntersection();
  if (intersection) appendAxis('axis-local-tibia-guide', center(g.tibia_t4), intersection, { 'stroke-dasharray': '8 7' });
}

function renderCalibration() {
  if (!state.calibration) return;
  const { p1, p2 } = state.calibration;
  appendAxis('calibration-line', p1, p2, { 'stroke-dasharray': '6 5' });
  const mid = midpoint(p1, p2);
  const label = svgElement('text', { x: mid[0] + 8, y: mid[1] - 8, class: 'calibration-label' });
  label.textContent = '25 mm'; referenceLayer.append(label);
}

function resultSummary(results) {
  if (!results) return '';
  const hka = `${results.HKA_firmado > 0 ? '+' : ''}${results.HKA_firmado.toFixed(2)}° ${results.alineacion}`;
  return `${hka} · ${results.clasificacion_HKA} · CPAK ${results.CPAK_tipo}`;
}

function updateCompletion() {
  const missing = missingGeometry(state.geometry);
  const complete = 10 - missing.length;
  const completion = document.getElementById('completion-status');
  completion.querySelector('strong').textContent = `${complete} / 10`;
  completion.classList.toggle('complete', missing.length === 0);
  state.results = null;
  if (!missing.length) {
    try {
      const side = document.getElementById('case-side').value;
      state.results = roundMeasurements(calculateMeasurements(normalizeGeometry(state.geometry, side), side));
    } catch (_) {}
  }
  const statusCard = document.getElementById('status-card');
  const progress = document.getElementById('status-progress');
  const detail = document.getElementById('status-detail');
  progress.textContent = state.language === 'es' ? `${complete} de 10 referencias completadas` : `${complete} of 10 landmarks completed`;
  statusCard.classList.toggle('complete', Boolean(state.results));
  if (!state.imageHash) detail.textContent = COPY[state.language].statusOpen;
  else if (state.results) detail.textContent = resultSummary(state.results);
  else if (!complete) detail.textContent = COPY[state.language].statusStart;
  else if (missing.length) detail.textContent = COPY[state.language].statusContinue;
  else detail.textContent = COPY[state.language].statusReady;
  renderResults(); updateSaveState();
}

function renderResults() {
  const body = document.getElementById('measurement-results');
  body.replaceChildren();
  for (const [label, key] of RESULT_ROWS) {
    const row = document.createElement('tr');
    const heading = document.createElement('th'); const value = document.createElement('td');
    heading.textContent = label;
    const result = state.results?.[key];
    let shown = '—';
    if (result !== undefined) {
      if (key === 'CPAK_tipo') shown = `${state.language === 'es' ? 'Tipo' : 'Type'} ${result}`;
      else shown = typeof result === 'number' ? `${result.toFixed(2)}°` : result;
    }
    const strong = document.createElement('strong'); strong.textContent = shown; value.append(strong);
    row.append(heading, value); body.append(row);
  }
}

function updateToolButtons() {
  document.querySelectorAll('[data-tool]').forEach((button) => {
    button.classList.toggle('active', button.dataset.tool === state.activeTool);
    button.classList.toggle('complete', Boolean(state.geometry[button.dataset.tool]));
  });
  calibrationButton?.classList.toggle('active', state.activeTool === 'calibration_25');
}

function selectTool(tool) {
  state.activeTool = state.activeTool === tool ? null : tool;
  state.lineStart = null; state.calibrationStart = null; state.selectedKey = null;
  updateToolButtons(); updateRadiusControl();
  if (!state.activeTool) { guidance.textContent = COPY[state.language].ready; return; }
  const template = LINES.has(state.activeTool) ? COPY[state.language].lineFirst : COPY[state.language].tool;
  guidance.textContent = template.replace('{label}', LABELS[state.activeTool]);
}

function selectCalibrationTool() {
  if (!state.width) return;
  const activate = state.activeTool !== 'calibration_25';
  state.activeTool = activate ? 'calibration_25' : null;
  state.calibrationStart = null; state.lineStart = null; state.selectedKey = null;
  guidance.textContent = activate ? COPY[state.language].calibrationStart : COPY[state.language].ready;
  updateToolButtons(); updateRadiusControl();
}

function completeCalibration(p1, p2) {
  const px = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  if (px < 5) {
    state.calibrationStart = null; state.activeTool = null;
    showMessage(COPY[state.language].calibrationInvalid, 'error'); updateToolButtons(); return;
  }
  const spacing = CALIBRATION_DIAMETER_MM / px;
  state.calibration = { p1, p2, px, spacing };
  if (!state.technical) state.technical = {};
  state.technical.rendered_pixel_spacing_mm = [spacing, spacing];
  if (state.technical.rows && state.technical.columns && state.technical.rendered_rows && state.technical.rendered_columns) {
    const sy = state.technical.rendered_rows / state.technical.rows;
    const sx = state.technical.rendered_columns / state.technical.columns;
    state.technical.pixel_spacing_mm = [spacing * sy, spacing * sx];
  }
  state.technical.calibration_source = 'manual_fiducial_25mm';
  state.calibrationStart = null; state.activeTool = null;
  guidance.textContent = COPY[state.language].ready;
  updateCalibrationStatus(); updateToolButtons(); renderGeometry();
}

function placeActive(point) {
  const key = state.activeTool;
  if (!key) return;
  if (key === 'calibration_25') {
    if (!state.calibrationStart) {
      state.calibrationStart = point; guidance.textContent = COPY[state.language].calibrationSecond; return;
    }
    completeCalibration(state.calibrationStart, point); return;
  }
  if (CIRCLES.has(key)) {
    state.geometry[key] = { type: 'circle', center: point, radius: Math.max(7, state.width * ({ cabeza: .018, tobillo: .012 }[key] || .01)) };
    state.selectedKey = key; state.activeTool = null;
  } else if (POINTS.has(key)) {
    state.geometry[key] = { type: 'point', position: point }; state.activeTool = null;
  } else if (LINES.has(key)) {
    if (!state.lineStart) { state.lineStart = point; guidance.textContent = COPY[state.language].lineSecond.replace('{label}', LABELS[key]); return; }
    state.geometry[key] = { type: 'line', point_1: state.lineStart, point_2: point };
    state.lineStart = null; state.activeTool = null;
  }
  guidance.textContent = COPY[state.language].ready; renderGeometry();
}

function updateCalibrationStatus() {
  if (!calibrationStatus) return;
  if (state.calibration) {
    calibrationStatus.textContent = COPY[state.language].calibrationReady
      .replace('{px}', state.calibration.px.toFixed(1))
      .replace('{spacing}', state.calibration.spacing.toFixed(4));
    calibrationStatus.classList.add('complete');
    return;
  }
  const spacing = state.technical?.rendered_pixel_spacing_mm;
  if (Array.isArray(spacing) && spacing.length === 2 && state.technical?.calibration_source === 'dicom_pixel_spacing') {
    calibrationStatus.textContent = COPY[state.language].calibrationDicom.replace('{spacing}', Number(spacing[0]).toFixed(4));
    calibrationStatus.classList.add('dicom'); return;
  }
  calibrationStatus.textContent = COPY[state.language].calibrationNone;
  calibrationStatus.classList.remove('complete', 'dicom');
}

function updateRadiusControl() {
  const item = state.selectedKey ? state.geometry[state.selectedKey] : null;
  const visible = item?.type === 'circle'; radiusControl.hidden = !visible;
  if (!visible) return;
  radiusSlider.max = String(Math.max(20, Math.round(Math.min(state.width, state.height) * .20)));
  radiusSlider.value = String(Math.round(item.radius));
  document.getElementById('radius-value').textContent = `${Math.round(item.radius)} px`;
}

function constrainPan() {
  if (!state.width) return;
  const rect = viewer.getBoundingClientRect();
  const displayWidth = state.width * state.scale; const displayHeight = state.height * state.scale;
  state.panX = displayWidth <= rect.width ? (rect.width - displayWidth) / 2 : Math.min(0, Math.max(rect.width - displayWidth, state.panX));
  state.panY = displayHeight <= rect.height ? (rect.height - displayHeight) / 2 : Math.min(0, Math.max(rect.height - displayHeight, state.panY));
}

function applyViewTransform() {
  constrainPan(); stage.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.scale})`;
  document.getElementById('zoom-value').textContent = `${Math.round(state.zoom)}%`;
}

function fitView() {
  if (!state.width) return;
  const rect = viewer.getBoundingClientRect();
  state.fitScale = Math.min(rect.width / state.width, rect.height / state.height) * .985;
  state.zoom = 100; state.scale = state.fitScale;
  state.panX = (rect.width - state.width * state.scale) / 2; state.panY = (rect.height - state.height * state.scale) / 2;
  applyViewTransform();
}

function setZoom(value, clientX = null, clientY = null) {
  if (!state.width) return;
  const rect = viewer.getBoundingClientRect();
  const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value)); const nextScale = state.fitScale * nextZoom / 100;
  const anchorX = clientX === null ? rect.width / 2 : clientX - rect.left;
  const anchorY = clientY === null ? rect.height / 2 : clientY - rect.top;
  const imageX = (anchorX - state.panX) / state.scale; const imageY = (anchorY - state.panY) / state.scale;
  state.zoom = nextZoom; state.scale = nextScale; state.panX = anchorX - imageX * nextScale; state.panY = anchorY - imageY * nextScale;
  applyViewTransform();
}

function beginPan(event) {
  state.drag = { type: 'pan', startX: event.clientX, startY: event.clientY, panX: state.panX, panY: state.panY };
  viewer.classList.add('panning'); svg.setPointerCapture(event.pointerId);
}

svg.addEventListener('pointerdown', (event) => {
  if (!state.width) return;
  const target = event.target.closest?.('.draggable');
  if (target && event.button !== 1) {
    event.preventDefault(); state.selectedKey = target.dataset.key;
    state.drag = { type: 'geometry', key: target.dataset.key, part: target.dataset.part || '' };
    svg.setPointerCapture(event.pointerId); updateRadiusControl(); return;
  }
  if (state.activeTool && event.button !== 1) { event.preventDefault(); placeActive(pointFromEvent(event)); return; }
  if (event.button === 0 || event.button === 1) { event.preventDefault(); beginPan(event); }
});

svg.addEventListener('pointermove', (event) => {
  if (!state.drag) return;
  if (state.drag.type === 'pan') {
    state.panX = state.drag.panX + event.clientX - state.drag.startX; state.panY = state.drag.panY + event.clientY - state.drag.startY;
    applyViewTransform(); return;
  }
  const point = pointFromEvent(event); const item = state.geometry[state.drag.key];
  if (!item) return;
  if (item.type === 'circle') item.center = point;
  else if (item.type === 'point') item.position = point;
  else if (item.type === 'line') item[state.drag.part] = point;
  renderGeometry();
});

function endDrag(event) {
  if (!state.drag) return;
  state.drag = null; viewer.classList.remove('panning');
  try { svg.releasePointerCapture(event.pointerId); } catch (_) {}
}
svg.addEventListener('pointerup', endDrag); svg.addEventListener('pointercancel', endDrag);

viewer.addEventListener('wheel', (event) => {
  if (!state.width) return;
  event.preventDefault();
  const key = event.target?.dataset?.key;
  if (key && state.geometry[key]?.type === 'circle') {
    const item = state.geometry[key];
    const step = Math.max(.6, Math.min(3, state.width / 1400));
    item.radius = Math.max(2, Math.min(Math.min(state.width, state.height) * .2, item.radius + (event.deltaY < 0 ? step : -step)));
    state.selectedKey = key; renderGeometry(); return;
  }
  setZoom(state.zoom * (event.deltaY < 0 ? WHEEL_ZOOM_FACTOR : 1 / WHEEL_ZOOM_FACTOR), event.clientX, event.clientY);
}, { passive: false });

viewer.addEventListener('dblclick', (event) => {
  if (!state.width || state.activeTool || event.target.closest?.('.draggable')) return;
  event.preventDefault(); if (state.zoom > 135) fitView(); else setZoom(180, event.clientX, event.clientY);
});

radiusSlider.addEventListener('input', () => {
  const item = state.geometry[state.selectedKey]; if (!item || item.type !== 'circle') return;
  item.radius = Number(radiusSlider.value); document.getElementById('radius-value').textContent = `${Math.round(item.radius)} px`; renderGeometry();
});

document.querySelectorAll('[data-tool]').forEach((button) => button.addEventListener('click', () => selectTool(button.dataset.tool)));
calibrationButton?.addEventListener('click', selectCalibrationTool);

function genericClipboardName(filename) {
  return /^(image|clipboard|pasted-image|captura|screenshot)([-_ ]?\d+)?\.(png|jpe?g|webp)$/i.test(filename || '');
}
function caseCodeFromFilename(filename, imageHash) {
  if (genericClipboardName(filename)) return `KPAI-${imageHash.slice(0, 12).toUpperCase()}`;
  const lastDot = filename.lastIndexOf('.');
  const base = (lastDot > 0 ? filename.slice(0, lastDot) : filename).normalize('NFC').trim();
  const safe = base.replace(/[\u0000-\u001F<>:"/\\|?*]/g, '-').replace(/-+/g, '-').slice(0, 120).trim();
  return safe || `KPAI-${imageHash.slice(0, 12).toUpperCase()}`;
}

function resetCaseState({ keepCalibration = false } = {}) {
  state.geometry = {}; state.activeTool = null; state.lineStart = null; state.selectedKey = null; state.results = null;
  state.calibrationStart = null;
  if (!keepCalibration) state.calibration = null;
  document.getElementById('review-confirmed').checked = false;
  document.querySelectorAll('[data-qc]').forEach((input) => { input.checked = false; });
}

async function openFile(file, pasted = false) {
  if (!file) return;
  const status = document.getElementById('file-status');
  status.textContent = state.language === 'es' ? 'Procesando localmente…' : 'Processing locally…';
  try {
    const loaded = await loadRadiograph(file, canvas);
    Object.assign(state, loaded, { fileName: file.name || 'clipboard-image.png', openedAt: performance.now() });
    resetCaseState();
    svg.setAttribute('viewBox', `0 0 ${state.width} ${state.height}`);
    stage.style.width = `${state.width}px`; stage.style.height = `${state.height}px`; stage.classList.add('has-image'); viewer.classList.add('has-image');
    document.getElementById('case-code').value = caseCodeFromFilename(state.fileName, state.imageHash);
    status.textContent = `${pasted ? (state.language === 'es' ? 'Portapapeles' : 'Clipboard') : state.fileName} · ${loaded.technical.columns} × ${loaded.technical.rows}`;
    guidance.textContent = COPY[state.language].ready; updateCalibrationStatus(); renderGeometry(); requestAnimationFrame(fitView);
    if (pasted) showMessage(COPY[state.language].pasted);
  } catch (error) {
    const compressed = error.message === 'dicom_compressed_not_supported';
    status.textContent = compressed ? COPY[state.language].compressedDicom : COPY[state.language].loadError; showMessage(status.textContent, 'error');
  }
}

document.getElementById('image-file').addEventListener('change', async (event) => {
  const [file] = event.target.files; if (!file) return; await openFile(file, false);
});

window.addEventListener('paste', async (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable) return;
  const file = [...(event.clipboardData?.files || [])].find((candidate) => candidate.type.startsWith('image/'));
  if (!file) return;
  event.preventDefault();
  const name = file.name && file.name !== 'image.png' ? file.name : 'clipboard.png';
  const clipboardFile = new File([file], name, { type: file.type || 'image/png', lastModified: Date.now() });
  await openFile(clipboardFile, true);
});

document.getElementById('seed-axes').addEventListener('click', () => {
  const needed = ['cabeza', 'femur_proximal', 'femur_distal', 'tibia_proximal', 'tobillo'].filter((key) => !state.geometry[key]);
  if (needed.length) return showMessage(COPY[state.language].axesNeed, 'error');
  state.geometry = seedLocalAxes(state.geometry, state.technical?.rendered_pixel_spacing_mm || null); renderGeometry();
});
document.getElementById('clear-geometry').addEventListener('click', () => { resetCaseState({ keepCalibration: true }); renderGeometry(); });
document.getElementById('zoom-in').addEventListener('click', () => setZoom(state.zoom * BUTTON_ZOOM_FACTOR));
document.getElementById('zoom-out').addEventListener('click', () => setZoom(state.zoom / BUTTON_ZOOM_FACTOR));
document.getElementById('fit-view').addEventListener('click', fitView);
document.getElementById('case-side').addEventListener('change', updateCompletion);
document.getElementById('review-confirmed').addEventListener('change', updateSaveState);
window.addEventListener('resize', () => { if (state.width && state.zoom <= 105) fitView(); else applyViewTransform(); });

window.addEventListener('keydown', (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable) return;
  if (event.key === 'Escape') {
    state.activeTool = null; state.lineStart = null; state.calibrationStart = null; guidance.textContent = state.width ? COPY[state.language].ready : COPY[state.language].statusOpen; updateToolButtons(); return;
  }
  if ((event.key === 'Delete' || event.key === 'Backspace') && state.selectedKey && state.geometry[state.selectedKey]) {
    delete state.geometry[state.selectedKey]; state.selectedKey = null; event.preventDefault(); renderGeometry(); return;
  }
  const selected = state.selectedKey ? state.geometry[state.selectedKey] : null;
  if (selected?.type === 'circle' && ['+', '=', '-', '_'].includes(event.key)) {
    selected.radius = Math.max(2, selected.radius + (['+', '='].includes(event.key) ? 1 : -1)); event.preventDefault(); renderGeometry();
  }
});

function isValidCaseCode(code) { return code.length > 0 && code.length <= 120 && !/[\u0000-\u001F<>:"/\\|?*]/.test(code); }
function updateSaveState() {
  const code = document.getElementById('case-code').value.trim();
  const ready = Boolean(state.imageHash && state.results && isValidCaseCode(code));
  saveButton.disabled = !state.user || !ready || !document.getElementById('review-confirmed').checked;
  downloadResultButton.disabled = !ready; downloadReportButton.disabled = !ready;
}
function qcValues() { return Object.fromEntries([...document.querySelectorAll('[data-qc]')].map((input) => [input.dataset.qc, input.checked])); }

saveButton.addEventListener('click', async () => {
  const caseCode = document.getElementById('case-code').value.trim();
  if (!isValidCaseCode(caseCode)) return showMessage(COPY[state.language].invalidCase, 'error');
  if (!state.results) return showMessage(COPY[state.language].incomplete, 'error');
  if (!document.getElementById('review-confirmed').checked) return showMessage(COPY[state.language].review, 'error');
  const side = document.getElementById('case-side').value;
  const payload = {
    schema_version: 'kpai-web-result/1', app_version: APP_VERSION, case_code: caseCode,
    center_code: document.getElementById('center-code').value.trim(), side, mode: 'manual_cegado', method: 'manual_web',
    session: document.getElementById('case-session').value, image_quality: document.getElementById('image-quality').value,
    image_sha256: state.imageHash, filename_sha256: state.filenameHash, geometry: normalizeGeometry(state.geometry, side),
    measurements: state.results, technical: state.technical,
    timing: { manual_s: Math.round((performance.now() - state.openedAt) / 100) / 10 }, qc: qcValues(), review_confirmed: true,
  };
  saveButton.disabled = true;
  try {
    await api('/api/research/results', { method: 'POST', body: JSON.stringify(payload) });
    showMessage(COPY[state.language].saved); document.getElementById('status-detail').textContent = `${resultSummary(state.results)} · ${COPY[state.language].statusSaved}`;
  } catch (_) { showMessage(COPY[state.language].saveError, 'error'); }
  finally { updateSaveState(); }
});

function drawAnnotatedCanvas(maxDimension = 2400) {
  if (!state.results || !state.width) throw new Error('not_ready');
  const ratio = Math.min(1, maxDimension / Math.max(state.width, state.height));
  const output = document.createElement('canvas'); output.width = Math.max(1, Math.round(state.width * ratio)); output.height = Math.max(1, Math.round(state.height * ratio));
  const ctx = output.getContext('2d'); ctx.drawImage(canvas, 0, 0, output.width, output.height); ctx.save(); ctx.scale(ratio, ratio);
  const lineWidth = Math.max(1.5, Math.min(state.width, state.height) / 320);
  const drawAxis = (a, b, color, dashed = false) => {
    if (!a || !b) return; ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.strokeStyle = color; ctx.lineWidth = lineWidth;
    ctx.setLineDash(dashed ? [8, 7] : []); ctx.stroke(); ctx.setLineDash([]);
  };
  const g = state.geometry;
  drawAxis(center(g.cabeza), center(g.femur_distal), '#22c55e'); drawAxis(center(g.tibia_proximal), center(g.tobillo), '#ef4444');
  drawAxis(center(g.femur_proximal), center(g.femur_distal), '#a855f7'); drawAxis(center(g.femur_f10), center(g.femur_distal), '#06b6d4'); drawAxis(center(g.tibia_t4), center(g.tibia_t10), '#84cc16');
  const guide = tibialGuideIntersection(); if (guide) drawAxis(center(g.tibia_t4), guide, '#84cc16', true);
  if (state.calibration) drawAxis(state.calibration.p1, state.calibration.p2, '#f5c451', true);
  const label = (key, point, item = null) => {
    const pos = labelPosition(key, point, item); const text = LABELS[key];
    ctx.font = `700 ${pos.fontSize}px Inter, Arial, sans-serif`; ctx.textAlign = pos.anchor === 'end' ? 'right' : 'left';
    ctx.lineWidth = Math.max(2, pos.fontSize * .18); ctx.strokeStyle = '#061016'; ctx.strokeText(text, pos.x, pos.y); ctx.fillStyle = '#eef9fa'; ctx.fillText(text, pos.x, pos.y); ctx.textAlign = 'left';
  };
  for (const [key, item] of Object.entries(g)) {
    ctx.strokeStyle = '#2ad5b6'; ctx.fillStyle = 'rgba(38,213,182,.08)'; ctx.lineWidth = lineWidth;
    if (item.type === 'circle') { ctx.beginPath(); ctx.arc(item.center[0], item.center[1], item.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); label(key, item.center, item); }
    else if (item.type === 'point') { ctx.beginPath(); ctx.arc(item.position[0], item.position[1], handleRadius(), 0, Math.PI * 2); ctx.fillStyle = '#f4fbfc'; ctx.fill(); ctx.stroke(); label(key, item.position, item); }
    else { ctx.beginPath(); ctx.moveTo(...item.point_1); ctx.lineTo(...item.point_2); ctx.stroke(); label(key, midpoint(item.point_1, item.point_2), item); }
  }
  if (state.calibration) {
    const mid = midpoint(state.calibration.p1, state.calibration.p2); ctx.font = '700 13px Inter, Arial, sans-serif'; ctx.fillStyle = '#f5c451'; ctx.fillText('25 mm', mid[0] + 7, mid[1] - 7);
  }
  ctx.restore();
  const footerHeight = Math.max(28, output.height * .035); ctx.fillStyle = 'rgba(5,12,16,.84)'; ctx.fillRect(0, output.height - footerHeight, output.width, footerHeight);
  ctx.fillStyle = '#39d5b9'; ctx.font = `700 ${Math.max(11, footerHeight * .34)}px Inter, Arial, sans-serif`; ctx.textBaseline = 'middle';
  const code = document.getElementById('case-code').value.trim(); const side = document.getElementById('case-side').value;
  ctx.fillText(`KneePlanAI Research · ${code} · ${side}`, footerHeight * .45, output.height - footerHeight / 2);
  return output;
}

function canvasBlob(target, type, quality) { return new Promise((resolve, reject) => target.toBlob((blob) => blob ? resolve(blob) : reject(new Error('blob_error')), type, quality)); }
function downloadBlob(blob, filename) { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
function safeDownloadName(value) { return value.replace(/[\u0000-\u001F<>:"/\\|?*]/g, '-').trim() || 'KneePlanAI'; }

downloadResultButton.addEventListener('click', async () => {
  try { const blob = await canvasBlob(drawAnnotatedCanvas(), 'image/png'); downloadBlob(blob, `${safeDownloadName(document.getElementById('case-code').value)}_resultado.png`); showMessage(COPY[state.language].resultSaved); }
  catch (_) { showMessage(COPY[state.language].downloadError, 'error'); }
});

function pdfEscape(value) { return String(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'); }
function latin1(value) { const bytes = new Uint8Array(value.length); for (let i = 0; i < value.length; i += 1) bytes[i] = value.charCodeAt(i) & 255; return bytes; }
function concatBytes(parts) { const length = parts.reduce((sum, part) => sum + part.length, 0); const output = new Uint8Array(length); let offset = 0; for (const part of parts) { output.set(part, offset); offset += part.length; } return output; }
function color(hex) { const value = hex.replace('#', ''); return [0, 2, 4].map((index) => (parseInt(value.slice(index, index + 2), 16) / 255).toFixed(3)).join(' '); }

async function buildReportPdf() {
  const annotated = drawAnnotatedCanvas(1900); const jpegBlob = await canvasBlob(annotated, 'image/jpeg', .9); const jpeg = new Uint8Array(await jpegBlob.arrayBuffer());
  const pageW = 595; const pageH = 842; const commands = [];
  const rect = (x, y, w, h, fill, stroke = null) => { commands.push(`${color(fill)} rg`); if (stroke) commands.push(`${color(stroke)} RG 0.8 w`); commands.push(`${x} ${y} ${w} ${h} re ${stroke ? 'B' : 'f'}`); };
  const text = (x, y, size, value, fill = '#172231', bold = false, align = 'left') => { const font = bold ? 'F2' : 'F1'; const approx = String(value).length * size * .48; const tx = align === 'right' ? x - approx : x; commands.push(`${color(fill)} rg BT /${font} ${size} Tf ${tx} ${y} Td (${pdfEscape(value)}) Tj ET`); };
  rect(0, 0, pageW, pageH, '#F4F7F9'); rect(0, pageH - 74, pageW, 74, '#071017'); rect(0, pageH - 77, pageW, 3, '#16D4C5');
  text(30, pageH - 44, 18, 'K n e e P l a n A I', '#FFFFFF', true); text(pageW - 30, pageH - 42, 9, state.language === 'es' ? 'I N F O R M E' : 'R E P O R T', '#16D4C5', true, 'right');
  const leftX = 28; const leftY = 105; const leftW = 332; const leftH = 620; rect(leftX, leftY, leftW, leftH, '#000000');
  const imageScale = Math.min((leftW - 16) / annotated.width, (leftH - 16) / annotated.height); const imageW = annotated.width * imageScale; const imageH = annotated.height * imageScale;
  const imageX = leftX + (leftW - imageW) / 2; const imageY = leftY + (leftH - imageH) / 2; commands.push(`q ${imageW.toFixed(2)} 0 0 ${imageH.toFixed(2)} ${imageX.toFixed(2)} ${imageY.toFixed(2)} cm /Im1 Do Q`);
  const rightX = 376; const rightW = 191; rect(rightX, 597, rightW, 128, '#FFFFFF', '#D4DEE5');
  text(rightX + 14, 706, 8, state.language === 'es' ? 'E S T U D I O' : 'S T U D Y', '#66788C', true);
  const code = document.getElementById('case-code').value.trim(); const side = document.getElementById('case-side').value; const now = new Date();
  const studyRows = state.language === 'es' ? [['Imagen', code], ['Lado', side === 'derecha' ? 'Derecha' : 'Izquierda'], ['Fecha', now.toLocaleString('es-PE')]] : [['Image', code], ['Side', side === 'derecha' ? 'Right' : 'Left'], ['Date', now.toLocaleString('en-US')]];
  let y = 666; for (const [name, value] of studyRows) { text(rightX + 14, y, 7.5, name, '#66788C', true); text(rightX + 72, y, 7.5, String(value).slice(0, 25)); y -= 19; }
  rect(rightX, 231, rightW, 350, '#FFFFFF', '#D4DEE5'); text(rightX + 14, 562, 8, state.language === 'es' ? 'R E S U L T A D O S' : 'R E S U L T S', '#66788C', true);
  const r = state.results; const rows = [
    ['HKA', `${r.HKA_firmado >= 0 ? '+' : ''}${r.HKA_firmado.toFixed(2)}° ${r.alineacion}`],
    [state.language === 'es' ? 'Alineación' : 'Alignment', r.clasificacion_HKA], ['HKA int.', `${r.HKA_interno.toFixed(2)}°`],
    ['mLDFA', `${r.mLDFA.toFixed(2)}°`], ['MPTA', `${r.MPTA.toFixed(2)}°`], ['JLCA', `${r.JLCA_firmado.toFixed(2)}°`],
    ['aLDFA', `${r.aLDFA.toFixed(2)}°`], [state.language === 'es' ? 'Valgo femoral' : 'Femoral valgus', `${r.Valgo_femoral.toFixed(2)}°`],
    ['aHKA', `${r.aHKA >= 0 ? '+' : ''}${r.aHKA.toFixed(2)}° ${r.CPAK_alineacion}`], ['JLO', `${r.JLO_CPAK.toFixed(2)}° ${r.CPAK_JLO}`],
    ['CPAK', `${state.language === 'es' ? 'Tipo' : 'Type'} ${r.CPAK_tipo}`],
  ];
  y = 532; for (const [name, value] of rows) { text(rightX + 14, y, 7.2, name, '#66788C'); text(rightX + rightW - 13, y, 7.2, value, '#172231', true, 'right'); commands.push(`${color('#E4EBEF')} RG .5 w ${rightX + 14} ${y - 8} m ${rightX + rightW - 13} ${y - 8} l S`); y -= 25; }
  const calibrationText = state.technical?.rendered_pixel_spacing_mm
    ? `${state.language === 'es' ? 'Calibración' : 'Calibration'}: ${state.technical.calibration_source || 'pixel_spacing'} · ${Number(state.technical.rendered_pixel_spacing_mm[0]).toFixed(4)} mm/px`
    : `${state.language === 'es' ? 'Calibración' : 'Calibration'}: —`;
  text(rightX + 14, 244, 6.2, calibrationText.slice(0, 42), '#66788C');
  const notice = state.language === 'es' ? 'Uso profesional y de investigación. Verifique referencias, calibración y resultados; la verificación clínica es obligatoria.' : 'For professional and research use. Verify landmarks, calibration, and results; clinical verification is mandatory.';
  text(29, 80, 6.7, notice, '#66788C'); commands.push(`${color('#D4DEE5')} RG .5 w 28 58 m ${pageW - 28} 58 l S`); text(29, 42, 6.5, 'Yordhanno Xavier Fallaque Ruiz - Founder & Developer', '#66788C'); text(pageW - 29, 42, 7, 'KneePlanAI', '#087D79', true, 'right');
  const content = latin1(commands.join('\n'));
  const objects = [
    latin1('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'),
    latin1('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n'),
    latin1('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> /XObject << /Im1 6 0 R >> >> /Contents 7 0 R >>\nendobj\n'),
    latin1('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n'),
    latin1('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n'),
    concatBytes([latin1(`6 0 obj\n<< /Type /XObject /Subtype /Image /Width ${annotated.width} /Height ${annotated.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`), jpeg, latin1('\nendstream\nendobj\n')]),
    concatBytes([latin1(`7 0 obj\n<< /Length ${content.length} >>\nstream\n`), content, latin1('\nendstream\nendobj\n')]),
  ];
  const header = latin1('%PDF-1.4\n%âãÏÓ\n'); const offsets = [0]; let offset = header.length; for (const object of objects) { offsets.push(offset); offset += object.length; }
  const xrefOffset = offset; let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`; for (let i = 1; i <= objects.length; i += 1) xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  const trailer = latin1(`${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
  return new Blob([concatBytes([header, ...objects, trailer])], { type: 'application/pdf' });
}

downloadReportButton.addEventListener('click', async () => {
  downloadReportButton.disabled = true;
  try { const blob = await buildReportPdf(); downloadBlob(blob, `${safeDownloadName(document.getElementById('case-code').value)}_informe.pdf`); showMessage(COPY[state.language].reportSaved); }
  catch (_) { showMessage(COPY[state.language].downloadError, 'error'); }
  finally { updateSaveState(); }
});

document.querySelectorAll('[data-language]').forEach((button) => button.addEventListener('click', () => setLanguage(button.dataset.language)));
setLanguage(detectLanguage(), false); renderResults(); updateCalibrationStatus(); loadIdentity();

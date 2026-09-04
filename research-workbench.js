import { calculateMeasurements, missingGeometry, normalizeGeometry, roundMeasurements, seedLocalAxes } from './research-math.js';
import { loadRadiograph } from './research-imaging.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const CIRCLES = new Set(['cabeza', 'femur_proximal', 'femur_f10', 'tibia_t4', 'tibia_t10', 'tobillo']);
const POINTS = new Set(['femur_distal', 'tibia_proximal']);
const LINES = new Set(['linea_femoral', 'linea_tibial']);
const LABELS = {
  cabeza: 'FH', femur_proximal: 'FAA-P', femur_distal: 'FN', femur_f10: 'F10',
  linea_femoral: 'FMC–FLC', tibia_proximal: 'TP', tibia_t4: 'T4',
  tibia_t10: 'T10', linea_tibial: 'TMP–TLP', tobillo: 'AC',
};
const RESULT_ROWS = [
  ['HKA', 'HKA_firmado'], ['mLDFA', 'mLDFA'], ['MPTA', 'MPTA'], ['JLCA', 'JLCA_firmado'],
  ['aLDFA', 'aLDFA'], ['AMA', 'AMA'], ['aFTA', 'aFTA'], ['aHKA', 'aHKA'],
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
    saved: 'Resultado sincronizado. El JSON y la fila CSV ya están disponibles para administración.',
    saveError: 'No fue posible sincronizar el resultado.',
    invalidCase: 'El código debe contener entre 2 y 64 letras, números, puntos, guiones o guiones bajos.',
    axesNeed: 'Primero sitúa FH, FAA-P, FN, TP y AC.',
  },
  en: {
    title: 'KneePlanAI Research | Web program',
    ready: 'Radiograph ready. Select a landmark to begin.',
    loadError: 'The image could not be opened.',
    compressedDicom: 'This DICOM uses unsupported compression. Export it as uncompressed DICOM, PNG, or TIFF.',
    tool: 'Place {label} on the radiograph.',
    lineFirst: 'Place the first endpoint of {label}.',
    lineSecond: 'Now place the second endpoint of {label}.',
    incomplete: 'Complete every landmark before finishing.',
    review: 'Confirm landmark review and case de-identification.',
    saved: 'Result synchronized. Its JSON and CSV row are now available to administration.',
    saveError: 'The result could not be synchronized.',
    invalidCase: 'The code must contain 2–64 letters, numbers, dots, hyphens, or underscores.',
    axesNeed: 'Place FH, FAA-P, FN, TP, and AC first.',
  },
};

const state = {
  language: 'es', user: null, geometry: {}, activeTool: null, lineStart: null,
  selectedKey: null, drag: null, width: 0, height: 0, zoom: 100,
  imageHash: '', filenameHash: '', technical: null, openedAt: null, results: null,
};

const canvas = document.getElementById('radiograph-canvas');
const stage = document.getElementById('viewer-stage');
const svg = document.getElementById('landmark-layer');
const referenceLayer = document.getElementById('reference-layer');
const axisLayer = document.getElementById('axis-layer');
const guidance = document.getElementById('tool-guidance');
const radiusControl = document.getElementById('radius-control');
const radiusSlider = document.getElementById('radius-slider');
const saveButton = document.getElementById('save-result');

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
  if (persist) { try { localStorage.setItem('kneeplanai-language', state.language); } catch (_) {} }
}

function showMessage(text, type = 'success') {
  const element = document.getElementById(type === 'error' ? 'workbench-error' : 'workbench-message');
  const other = document.getElementById(type === 'error' ? 'workbench-message' : 'workbench-error');
  other.classList.remove('visible');
  element.textContent = text;
  element.className = `portal-alert ${type} visible`;
  element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
  const rect = svg.getBoundingClientRect();
  return [
    Math.max(0, Math.min(state.width, (event.clientX - rect.left) / rect.width * state.width)),
    Math.max(0, Math.min(state.height, (event.clientY - rect.top) / rect.height * state.height)),
  ];
}

function appendLabel(key, point, suffix = '') {
  const label = svgElement('text', { x: point[0] + 10, y: point[1] - 10, class: 'reference-label' });
  label.textContent = `${LABELS[key]}${suffix}`;
  referenceLayer.append(label);
}

function draggableAttributes(key, part = '') {
  return { class: 'reference-handle draggable', r: Math.max(5, state.width / 520), 'data-key': key, 'data-part': part };
}

function renderGeometry() {
  referenceLayer.replaceChildren();
  axisLayer.replaceChildren();
  const geometry = state.geometry;

  for (const [key, item] of Object.entries(geometry)) {
    if (item.type === 'circle') {
      const circle = svgElement('circle', { cx: item.center[0], cy: item.center[1], r: item.radius, class: 'reference-circle' });
      const center = svgElement('circle', { cx: item.center[0], cy: item.center[1], ...draggableAttributes(key) });
      referenceLayer.append(circle, center);
      appendLabel(key, item.center);
    } else if (item.type === 'point') {
      const point = svgElement('circle', { cx: item.position[0], cy: item.position[1], ...draggableAttributes(key) });
      point.classList.add('reference-point');
      referenceLayer.append(point);
      appendLabel(key, item.position);
    } else if (item.type === 'line') {
      const line = svgElement('line', { x1: item.point_1[0], y1: item.point_1[1], x2: item.point_2[0], y2: item.point_2[1], class: 'reference-line' });
      const first = svgElement('circle', { cx: item.point_1[0], cy: item.point_1[1], ...draggableAttributes(key, 'point_1') });
      const second = svgElement('circle', { cx: item.point_2[0], cy: item.point_2[1], ...draggableAttributes(key, 'point_2') });
      referenceLayer.append(line, first, second);
      appendLabel(key, item.point_1, ' 1');
      appendLabel(key, item.point_2, ' 2');
    }
  }
  drawAxes();
  updateCompletion();
  updateToolButtons();
  updateRadiusControl();
}

function axis(className, a, b) {
  if (!a || !b) return;
  axisLayer.append(svgElement('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: `axis-line ${className}` }));
}

function center(item) { return item?.center || item?.position || null; }

function drawAxes() {
  const g = state.geometry;
  axis('axis-mechanical-femur', center(g.cabeza), center(g.femur_distal));
  axis('axis-mechanical-tibia', center(g.tibia_proximal), center(g.tobillo));
  axis('axis-anatomical', center(g.femur_proximal), center(g.femur_distal));
  axis('axis-local-femur', center(g.femur_f10), center(g.femur_distal));
  axis('axis-local-tibia', center(g.tibia_t4), center(g.tibia_t10));
}

function updateCompletion() {
  const missing = missingGeometry(state.geometry);
  const complete = 10 - missing.length;
  const status = document.getElementById('completion-status');
  status.querySelector('strong').textContent = `${complete} / 10`;
  status.classList.toggle('complete', missing.length === 0);
  state.results = null;
  if (!missing.length) {
    try { state.results = roundMeasurements(calculateMeasurements(normalizeGeometry(state.geometry, document.getElementById('case-side').value), document.getElementById('case-side').value)); } catch (_) {}
  }
  renderResults();
  updateSaveState();
}

function renderResults() {
  const body = document.getElementById('measurement-results');
  body.replaceChildren();
  for (const [label, key] of RESULT_ROWS) {
    const row = document.createElement('tr');
    const heading = document.createElement('th');
    const value = document.createElement('td');
    heading.textContent = label;
    const result = state.results?.[key];
    value.innerHTML = result === undefined ? '—' : `<strong>${typeof result === 'number' ? result.toFixed(2) + '°' : result}</strong>`;
    row.append(heading, value);
    body.append(row);
  }
}

function updateToolButtons() {
  document.querySelectorAll('[data-tool]').forEach((button) => {
    button.classList.toggle('active', button.dataset.tool === state.activeTool);
    button.classList.toggle('complete', Boolean(state.geometry[button.dataset.tool]));
  });
}

function selectTool(tool) {
  state.activeTool = state.activeTool === tool ? null : tool;
  state.lineStart = null;
  state.selectedKey = null;
  updateToolButtons();
  updateRadiusControl();
  if (!state.activeTool) return;
  const template = LINES.has(state.activeTool) ? COPY[state.language].lineFirst : COPY[state.language].tool;
  guidance.textContent = template.replace('{label}', LABELS[state.activeTool]);
}

function placeActive(point) {
  const key = state.activeTool;
  if (!key) return;
  if (CIRCLES.has(key)) {
    state.geometry[key] = { type: 'circle', center: point, radius: Math.max(7, state.width * ({ cabeza: .018, tobillo: .012 }[key] || .01)) };
    state.selectedKey = key;
    state.activeTool = null;
  } else if (POINTS.has(key)) {
    state.geometry[key] = { type: 'point', position: point };
    state.activeTool = null;
  } else if (LINES.has(key)) {
    if (!state.lineStart) {
      state.lineStart = point;
      guidance.textContent = COPY[state.language].lineSecond.replace('{label}', LABELS[key]);
      return;
    }
    state.geometry[key] = { type: 'line', point_1: state.lineStart, point_2: point };
    state.lineStart = null;
    state.activeTool = null;
  }
  guidance.textContent = COPY[state.language].ready;
  renderGeometry();
}

function updateRadiusControl() {
  const item = state.selectedKey ? state.geometry[state.selectedKey] : null;
  const visible = item?.type === 'circle';
  radiusControl.hidden = !visible;
  if (!visible) return;
  radiusSlider.max = String(Math.max(20, Math.round(Math.min(state.width, state.height) * .20)));
  radiusSlider.value = String(Math.round(item.radius));
  document.getElementById('radius-value').textContent = `${Math.round(item.radius)} px`;
}

svg.addEventListener('pointerdown', (event) => {
  if (!state.width) return;
  const target = event.target.closest?.('.draggable');
  if (target) {
    event.preventDefault();
    state.selectedKey = target.dataset.key;
    state.drag = { key: target.dataset.key, part: target.dataset.part || '' };
    svg.setPointerCapture(event.pointerId);
    updateRadiusControl();
    return;
  }
  if (state.activeTool) placeActive(pointFromEvent(event));
});

svg.addEventListener('pointermove', (event) => {
  if (!state.drag) return;
  const point = pointFromEvent(event);
  const item = state.geometry[state.drag.key];
  if (item.type === 'circle') item.center = point;
  else if (item.type === 'point') item.position = point;
  else if (item.type === 'line') item[state.drag.part] = point;
  renderGeometry();
});

function endDrag(event) {
  if (!state.drag) return;
  state.drag = null;
  try { svg.releasePointerCapture(event.pointerId); } catch (_) {}
}
svg.addEventListener('pointerup', endDrag);
svg.addEventListener('pointercancel', endDrag);

radiusSlider.addEventListener('input', () => {
  const item = state.geometry[state.selectedKey];
  if (!item || item.type !== 'circle') return;
  item.radius = Number(radiusSlider.value);
  document.getElementById('radius-value').textContent = `${Math.round(item.radius)} px`;
  renderGeometry();
});

document.querySelectorAll('[data-tool]').forEach((button) => button.addEventListener('click', () => selectTool(button.dataset.tool)));

document.getElementById('image-file').addEventListener('change', async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  const status = document.getElementById('file-status');
  status.textContent = state.language === 'es' ? 'Procesando localmente…' : 'Processing locally…';
  try {
    const loaded = await loadRadiograph(file, canvas);
    Object.assign(state, loaded, { geometry: {}, activeTool: null, lineStart: null, selectedKey: null, results: null, openedAt: performance.now() });
    svg.setAttribute('viewBox', `0 0 ${state.width} ${state.height}`);
    stage.classList.add('has-image');
    stage.style.aspectRatio = `${state.width} / ${state.height}`;
    const generated = `KPAI-${state.imageHash.slice(0, 12).toUpperCase()}`;
    const caseInput = document.getElementById('case-code');
    if (!caseInput.value) caseInput.value = generated;
    status.textContent = `${file.name} · ${loaded.technical.columns} × ${loaded.technical.rows}`;
    guidance.textContent = COPY[state.language].ready;
    renderGeometry();
  } catch (error) {
    const compressed = error.message === 'dicom_compressed_not_supported';
    status.textContent = compressed ? COPY[state.language].compressedDicom : COPY[state.language].loadError;
    showMessage(status.textContent, 'error');
  }
});

document.getElementById('seed-axes').addEventListener('click', () => {
  const needed = ['cabeza', 'femur_proximal', 'femur_distal', 'tibia_proximal', 'tobillo'].filter((key) => !state.geometry[key]);
  if (needed.length) return showMessage(COPY[state.language].axesNeed, 'error');
  state.geometry = seedLocalAxes(state.geometry, state.technical?.rendered_pixel_spacing_mm || null);
  renderGeometry();
});

document.getElementById('clear-geometry').addEventListener('click', () => {
  state.geometry = {};
  state.activeTool = null;
  state.lineStart = null;
  state.selectedKey = null;
  renderGeometry();
});

function setZoom(value) {
  state.zoom = Math.max(50, Math.min(400, value));
  stage.style.width = `${state.zoom}%`;
  document.getElementById('zoom-value').textContent = `${state.zoom}%`;
}
document.getElementById('zoom-in').addEventListener('click', () => setZoom(state.zoom + 25));
document.getElementById('zoom-out').addEventListener('click', () => setZoom(state.zoom - 25));
document.getElementById('case-side').addEventListener('change', updateCompletion);
document.getElementById('review-confirmed').addEventListener('change', updateSaveState);
document.getElementById('case-code').addEventListener('input', updateSaveState);

function updateSaveState() {
  const code = document.getElementById('case-code').value.trim();
  saveButton.disabled = !state.user || !state.imageHash || !state.results || !/^[A-Za-z0-9._-]{2,64}$/.test(code) || !document.getElementById('review-confirmed').checked;
}

function qcValues() {
  return Object.fromEntries([...document.querySelectorAll('[data-qc]')].map((input) => [input.dataset.qc, input.checked]));
}

saveButton.addEventListener('click', async () => {
  const caseCode = document.getElementById('case-code').value.trim();
  if (!/^[A-Za-z0-9._-]{2,64}$/.test(caseCode)) return showMessage(COPY[state.language].invalidCase, 'error');
  if (!state.results) return showMessage(COPY[state.language].incomplete, 'error');
  if (!document.getElementById('review-confirmed').checked) return showMessage(COPY[state.language].review, 'error');
  const side = document.getElementById('case-side').value;
  const payload = {
    schema_version: 'kpai-web-result/1',
    app_version: 'KneePlanAI Web Research 1.0.0',
    case_code: caseCode,
    center_code: document.getElementById('center-code').value.trim(),
    side,
    mode: 'manual_cegado',
    method: 'manual_web',
    session: document.getElementById('case-session').value,
    image_quality: document.getElementById('image-quality').value,
    image_sha256: state.imageHash,
    filename_sha256: state.filenameHash,
    geometry: normalizeGeometry(state.geometry, side),
    measurements: state.results,
    technical: state.technical,
    timing: { manual_s: Math.round((performance.now() - state.openedAt) / 100) / 10 },
    qc: qcValues(),
    review_confirmed: true,
  };
  saveButton.disabled = true;
  try {
    await api('/api/research/results', { method: 'POST', body: JSON.stringify(payload) });
    showMessage(COPY[state.language].saved);
  } catch (_) {
    showMessage(COPY[state.language].saveError, 'error');
  } finally {
    updateSaveState();
  }
});

document.querySelectorAll('[data-language]').forEach((button) => button.addEventListener('click', () => setLanguage(button.dataset.language)));
setLanguage(detectLanguage(), false);
renderResults();
loadIdentity();

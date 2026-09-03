const portalState = { language: 'es', user: null, counts: { validations: 0, reports: 0 } };

const portalCopy = {
  es: {
    title: 'KneePlanAI Research | Portal privado',
    roles: { validator: 'Validador externo', tester: 'Tester', both: 'Validador y tester' },
    savedValidation: 'La validación fue registrada correctamente.',
    savedReport: 'La incidencia fue registrada correctamente.',
    errors: {
      authentication_required: 'No se pudo verificar tu sesión. Vuelve a ingresar mediante tu correo autorizado.',
      access_not_approved: 'Este correo todavía no ha sido aprobado para el programa de investigación.',
      access_suspended: 'El acceso de esta identidad está suspendido. Contacta al investigador principal.',
      device_not_authorized: 'Esta identidad ya está vinculada a otro dispositivo. Solicita al investigador principal un restablecimiento.',
      research_database_unavailable: 'El portal está terminando su configuración. Intenta nuevamente más tarde.',
      validator_role_required: 'Tu rol no permite enviar validaciones.',
      tester_role_required: 'Tu rol no permite enviar incidencias.',
      default: 'No fue posible completar la operación. Intenta nuevamente.'
    }
  },
  en: {
    title: 'KneePlanAI Research | Private portal',
    roles: { validator: 'External validator', tester: 'Tester', both: 'Validator and tester' },
    savedValidation: 'The validation was recorded successfully.',
    savedReport: 'The issue was recorded successfully.',
    errors: {
      authentication_required: 'Your session could not be verified. Sign in again with your authorized email.',
      access_not_approved: 'This email has not yet been approved for the research program.',
      access_suspended: 'Access for this identity is suspended. Contact the principal investigator.',
      device_not_authorized: 'This identity is already linked to another device. Ask the principal investigator for a reset.',
      research_database_unavailable: 'The portal is finishing its setup. Try again later.',
      validator_role_required: 'Your role cannot submit validations.',
      tester_role_required: 'Your role cannot submit issues.',
      default: 'The operation could not be completed. Please try again.'
    }
  }
};

function detectPortalLanguage() {
  try {
    const saved = localStorage.getItem('kneeplanai-language');
    if (saved === 'es' || saved === 'en') return saved;
  } catch (_) {}
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language || 'en'];
  return languages.some((locale) => locale.toLowerCase().startsWith('es')) ? 'es' : 'en';
}

function setPortalLanguage(language, persist = true) {
  const lang = language === 'es' ? 'es' : 'en';
  portalState.language = lang;
  document.documentElement.lang = lang;
  document.title = portalCopy[lang].title;
  document.querySelectorAll('[data-es][data-en]').forEach((element) => {
    element.textContent = element.dataset[lang];
  });
  document.querySelectorAll('[data-language]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.language === lang));
  });
  if (portalState.user) renderProfile();
  if (persist) {
    try { localStorage.setItem('kneeplanai-language', lang); } catch (_) {}
  }
}

document.querySelectorAll('[data-language]').forEach((button) => {
  button.addEventListener('click', () => setPortalLanguage(button.dataset.language));
});

function renderProfile() {
  const user = portalState.user;
  if (!user) return;
  document.getElementById('portal-kneeplan-id').textContent = user.kneeplan_id;
  document.getElementById('portal-profile').textContent = [user.full_name, user.institution, user.country].filter(Boolean).join(' · ');
  document.getElementById('portal-role').textContent = portalCopy[portalState.language].roles[user.role] || user.role;
  document.getElementById('portal-validations').textContent = String(portalState.counts.validations);
  document.getElementById('portal-reports').textContent = String(portalState.counts.reports);
  document.getElementById('validation-section').classList.toggle('portal-hidden', !['validator', 'both'].includes(user.role));
  document.getElementById('report-section').classList.toggle('portal-hidden', !['tester', 'both'].includes(user.role));
}

function showPortalError(code) {
  const element = document.getElementById('portal-error');
  element.textContent = portalCopy[portalState.language].errors[code] || portalCopy[portalState.language].errors.default;
  element.classList.add('visible');
}

function showPortalMessage(text, type = 'success') {
  const element = document.getElementById('portal-message');
  element.textContent = text;
  element.className = `portal-alert visible ${type}`;
  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  window.setTimeout(() => element.classList.remove('visible'), 6000);
}

async function loadPortal() {
  try {
    const response = await fetch('/api/research/me', { headers: { accept: 'application/json' } });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'default');
    portalState.user = payload.user;
    portalState.counts = payload.counts;
    renderProfile();
    document.getElementById('portal-content').classList.remove('portal-hidden');
  } catch (error) {
    showPortalError(error.message || 'default');
  } finally {
    document.getElementById('portal-loading').classList.add('portal-hidden');
  }
}

function formPayload(form) {
  return Object.fromEntries(new FormData(form).entries());
}

async function submitPortalForm(form, endpoint, successKey, countKey) {
  if (!form.reportValidity()) return;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(formPayload(form)),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'default');
    form.reset();
    portalState.counts[countKey] += 1;
    renderProfile();
    showPortalMessage(portalCopy[portalState.language][successKey]);
  } catch (error) {
    showPortalMessage(portalCopy[portalState.language].errors[error.message] || portalCopy[portalState.language].errors.default, 'error');
  } finally {
    button.disabled = false;
  }
}

document.getElementById('validation-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  submitPortalForm(event.currentTarget, '/api/research/validation', 'savedValidation', 'validations');
});

document.getElementById('report-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  submitPortalForm(event.currentTarget, '/api/research/report', 'savedReport', 'reports');
});

setPortalLanguage(detectPortalLanguage(), false);
loadPortal();

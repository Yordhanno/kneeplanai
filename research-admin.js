const adminState = { language: 'es', users: [], resultCount: 0, recentResults: [] };

const adminCopy = {
  es: {
    title: 'KneePlanAI Research | Administración',
    roles: { validator: 'Validador externo', tester: 'Tester', both: 'Validador y tester' },
    approved: 'Activo', suspended: 'Suspendido', device: 'Dispositivo vinculado', noDevice: 'Sin dispositivo',
    suspend: 'Suspender', activate: 'Activar', reset: 'Restablecer dispositivo',
    confirmSuspend: '¿Confirmas que deseas suspender este acceso?',
    confirmActivate: '¿Confirmas que deseas reactivar este acceso?',
    confirmReset: '¿Confirmas el restablecimiento? El investigador podrá vincular una computadora nueva.',
    created: 'La identidad fue aprobada y creada correctamente.', changed: 'El acceso fue actualizado.', resetDone: 'El dispositivo fue restablecido.',
    empty: 'Aún no hay accesos creados.', emptyResults: 'Aún no hay resultados guardados.', updated: 'Actualizado', error: 'No fue posible completar la operación.', forbidden: 'Tu correo no está autorizado para administrar este portal.', duplicate: 'El correo real o la identidad @kneeplanai.com ya existe.'
  },
  en: {
    title: 'KneePlanAI Research | Administration',
    roles: { validator: 'External validator', tester: 'Tester', both: 'Validator and tester' },
    approved: 'Active', suspended: 'Suspended', device: 'Device linked', noDevice: 'No device',
    suspend: 'Suspend', activate: 'Activate', reset: 'Reset device',
    confirmSuspend: 'Do you confirm that you want to suspend this access?',
    confirmActivate: 'Do you confirm that you want to reactivate this access?',
    confirmReset: 'Confirm the reset? The researcher will be able to link a new computer.',
    created: 'The identity was approved and created successfully.', changed: 'Access was updated.', resetDone: 'The device was reset.',
    empty: 'No access has been created yet.', emptyResults: 'No results have been saved yet.', updated: 'Updated', error: 'The operation could not be completed.', forbidden: 'Your email is not authorized to administer this portal.', duplicate: 'The real email or @kneeplanai.com identity already exists.'
  }
};

function detectAdminLanguage() {
  try { const saved = localStorage.getItem('kneeplanai-language'); if (saved === 'es' || saved === 'en') return saved; } catch (_) {}
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language || 'en'];
  return languages.some((locale) => locale.toLowerCase().startsWith('es')) ? 'es' : 'en';
}

function setAdminLanguage(language, persist = true) {
  const lang = language === 'es' ? 'es' : 'en';
  adminState.language = lang;
  document.documentElement.lang = lang;
  document.title = adminCopy[lang].title;
  document.querySelectorAll('[data-es][data-en]').forEach((element) => { element.textContent = element.dataset[lang]; });
  document.querySelectorAll('[data-language]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.language === lang)));
  renderUsers();
  renderResults();
  if (persist) { try { localStorage.setItem('kneeplanai-language', lang); } catch (_) {} }
}

function renderResults() {
  const list = document.getElementById('admin-results-list');
  if (!list) return;
  list.replaceChildren();
  const copy = adminCopy[adminState.language];
  document.getElementById('admin-results').textContent = String(adminState.resultCount);
  if (!adminState.recentResults.length) {
    const empty = document.createElement('p'); empty.className = 'admin-empty'; empty.textContent = copy.emptyResults; list.append(empty); return;
  }
  for (const result of adminState.recentResults) {
    const row = document.createElement('article'); row.className = 'admin-result';
    const identity = document.createElement('div');
    const caseCode = document.createElement('strong'); caseCode.textContent = result.case_code;
    const meta = document.createElement('small'); meta.textContent = [result.kneeplan_id, result.side, result.session, result.method].filter(Boolean).join(' · ');
    identity.append(caseCode, meta);
    const measures = document.createElement('div'); measures.className = 'admin-result-measures';
    measures.textContent = `HKA ${Number(result.hka_signed).toFixed(2)}° · mLDFA ${Number(result.mldfa).toFixed(2)}° · MPTA ${Number(result.mpta).toFixed(2)}° · CPAK ${result.cpak}`;
    const date = document.createElement('small'); date.className = 'admin-result-date'; date.textContent = `${copy.updated}: ${result.updated_at || result.created_at}`;
    row.append(identity, measures, date); list.append(row);
  }
}

document.querySelectorAll('[data-language]').forEach((button) => button.addEventListener('click', () => setAdminLanguage(button.dataset.language)));

function showAdminMessage(text, type = 'success') {
  const element = document.getElementById(type === 'error' ? 'admin-error' : 'admin-message');
  element.textContent = text;
  element.className = `portal-alert visible ${type}`;
  window.setTimeout(() => element.classList.remove('visible'), 6000);
}

function renderUsers() {
  const list = document.getElementById('admin-list');
  if (!list) return;
  list.replaceChildren();
  const copy = adminCopy[adminState.language];
  if (!adminState.users.length) {
    const empty = document.createElement('p'); empty.className = 'admin-empty'; empty.textContent = copy.empty; list.append(empty);
  }
  for (const user of adminState.users) {
    const row = document.createElement('article'); row.className = 'admin-user';
    const details = document.createElement('div');
    const name = document.createElement('strong'); name.textContent = user.full_name;
    const id = document.createElement('small'); id.className = 'admin-id'; id.textContent = user.kneeplan_id;
    const meta = document.createElement('small'); meta.textContent = [user.email, copy.roles[user.role], user.institution, user.country].filter(Boolean).join(' · ');
    const device = document.createElement('small'); device.textContent = user.device_registered_at ? copy.device : copy.noDevice;
    const status = document.createElement('small'); status.className = `admin-status ${user.status === 'suspended' ? 'suspended' : ''}`; status.textContent = user.status === 'suspended' ? copy.suspended : copy.approved;
    details.append(name, id, meta, device, status);

    const actions = document.createElement('div'); actions.className = 'admin-user-actions';
    const statusButton = document.createElement('button'); statusButton.type = 'button'; statusButton.textContent = user.status === 'approved' ? copy.suspend : copy.activate;
    statusButton.addEventListener('click', () => changeStatus(user));
    const resetButton = document.createElement('button'); resetButton.type = 'button'; resetButton.textContent = copy.reset; resetButton.disabled = !user.device_registered_at;
    resetButton.addEventListener('click', () => resetDevice(user));
    actions.append(statusButton, resetButton);
    row.append(details, actions); list.append(row);
  }
  document.getElementById('admin-total').textContent = String(adminState.users.length);
  document.getElementById('admin-active').textContent = String(adminState.users.filter((user) => user.status === 'approved').length);
  document.getElementById('admin-devices').textContent = String(adminState.users.filter((user) => user.device_registered_at).length);
}

async function api(path, options = {}) {
  const response = await fetch(path, { headers: { accept: 'application/json', ...(options.body ? { 'content-type': 'application/json' } : {}) }, ...options });
  const payload = await response.json();
  if (!response.ok) { const error = new Error(payload.error || 'default'); error.status = response.status; throw error; }
  return payload;
}

async function loadUsers() {
  try {
    const payload = await api('/api/research/admin/users');
    adminState.users = payload.users || [];
    renderUsers();
  } catch (error) {
    showAdminMessage(error.status === 403 ? adminCopy[adminState.language].forbidden : adminCopy[adminState.language].error, 'error');
  }
}

async function loadSummary() {
  try {
    const payload = await api('/api/research/admin/summary');
    adminState.resultCount = Number(payload.counts?.results || 0);
    adminState.recentResults = payload.recent || [];
    renderResults();
  } catch (error) {
    showAdminMessage(error.status === 403 ? adminCopy[adminState.language].forbidden : adminCopy[adminState.language].error, 'error');
  }
}

async function changeStatus(user) {
  const copy = adminCopy[adminState.language];
  const next = user.status === 'approved' ? 'suspended' : 'approved';
  if (!window.confirm(next === 'suspended' ? copy.confirmSuspend : copy.confirmActivate)) return;
  try {
    await api(`/api/research/admin/users/${user.id}/status`, { method: 'POST', body: JSON.stringify({ status: next }) });
    user.status = next; renderUsers(); showAdminMessage(copy.changed);
  } catch (_) { showAdminMessage(copy.error, 'error'); }
}

async function resetDevice(user) {
  const copy = adminCopy[adminState.language];
  if (!window.confirm(copy.confirmReset)) return;
  try {
    await api(`/api/research/admin/users/${user.id}/reset-device`, { method: 'POST', body: '{}' });
    user.device_registered_at = null; renderUsers(); showAdminMessage(copy.resetDone);
  } catch (_) { showAdminMessage(copy.error, 'error'); }
}

document.getElementById('admin-user-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const button = form.querySelector('button[type="submit"]'); button.disabled = true;
  try {
    const payload = Object.fromEntries(new FormData(form).entries());
    await api('/api/research/admin/users', { method: 'POST', body: JSON.stringify(payload) });
    form.reset(); await loadUsers(); showAdminMessage(adminCopy[adminState.language].created);
  } catch (error) {
    showAdminMessage(error.message === 'email_or_identity_already_exists' ? adminCopy[adminState.language].duplicate : adminCopy[adminState.language].error, 'error');
  } finally { button.disabled = false; }
});

setAdminLanguage(detectAdminLanguage(), false);
Promise.all([loadUsers(), loadSummary()]);

import './research-workbench-v3021-resizefix.js';

// Restores the dedicated Analysis option documented in KneePlanAI v3.0.21.
// This layer is read-only: it consumes the values already calculated by the
// workbench (aHKA, JLO and CPAK) and never changes measurement geometry,
// formulas, saving, calibration or research payloads.

const resultsPanel = document.querySelector('.results-panel');
const measurementBody = document.getElementById('measurement-results');
const completionStatus = document.getElementById('completion-status');

if (resultsPanel && measurementBody) {
  installAnalysisView();
}

function currentLanguage() {
  return document.documentElement.lang === 'en' ? 'en' : 'es';
}

function installAnalysisView() {
  if (document.getElementById('kpai-analysis-view')) return;

  installStyles();

  const heading = resultsPanel.querySelector('.panel-heading');
  const tabs = document.createElement('div');
  tabs.className = 'kpai-results-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Resultados y análisis');
  tabs.innerHTML = `
    <button id="kpai-tab-results" type="button" role="tab" aria-selected="true" class="active" data-es="Resultados" data-en="Results">Resultados</button>
    <button id="kpai-tab-analysis" type="button" role="tab" aria-selected="false" data-es="Análisis" data-en="Analysis">Análisis</button>
  `;

  const resultsView = document.createElement('div');
  resultsView.id = 'kpai-results-view';
  resultsView.className = 'kpai-results-view';

  const nodesToMove = [...resultsPanel.children].filter((node) => node !== heading);
  for (const node of nodesToMove) resultsView.append(node);

  const analysisView = document.createElement('div');
  analysisView.id = 'kpai-analysis-view';
  analysisView.className = 'kpai-analysis-view';
  analysisView.hidden = true;
  analysisView.setAttribute('role', 'tabpanel');
  analysisView.setAttribute('aria-labelledby', 'kpai-tab-analysis');
  analysisView.innerHTML = analysisMarkup();

  heading.after(tabs, resultsView, analysisView);

  const resultsTab = tabs.querySelector('#kpai-tab-results');
  const analysisTab = tabs.querySelector('#kpai-tab-analysis');

  const switchView = (showAnalysis) => {
    resultsView.hidden = showAnalysis;
    analysisView.hidden = !showAnalysis;
    resultsTab.classList.toggle('active', !showAnalysis);
    analysisTab.classList.toggle('active', showAnalysis);
    resultsTab.setAttribute('aria-selected', String(!showAnalysis));
    analysisTab.setAttribute('aria-selected', String(showAnalysis));
    if (showAnalysis) renderAnalysis();
  };

  resultsTab.addEventListener('click', () => switchView(false));
  analysisTab.addEventListener('click', () => switchView(true));

  new MutationObserver(renderAnalysis).observe(measurementBody, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  if (completionStatus) {
    new MutationObserver(renderAnalysis).observe(completionStatus, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  for (const button of document.querySelectorAll('[data-language]')) {
    button.addEventListener('click', () => requestAnimationFrame(() => {
      localizeAnalysis();
      renderAnalysis();
    }));
  }

  localizeAnalysis();
  renderAnalysis();
}

function analysisMarkup() {
  return `
    <section class="kpai-analysis-intro">
      <span class="kpai-analysis-kicker" data-es="ANÁLISIS CPAK" data-en="CPAK ANALYSIS">ANÁLISIS CPAK</span>
      <h3 data-es="Fenotipo coronal" data-en="Coronal phenotype">Fenotipo coronal</h3>
      <p data-es="aHKA y JLO sitúan el caso dentro de la matriz CPAK." data-en="aHKA and JLO locate the case within the CPAK matrix.">aHKA y JLO sitúan el caso dentro de la matriz CPAK.</p>
    </section>

    <div id="kpai-analysis-pending" class="kpai-analysis-pending">
      <strong data-es="Análisis pendiente" data-en="Analysis pending">Análisis pendiente</strong>
      <span data-es="Complete las 10 referencias para visualizar el análisis CPAK." data-en="Complete all 10 landmarks to display the CPAK analysis.">Complete las 10 referencias para visualizar el análisis CPAK.</span>
    </div>

    <div id="kpai-analysis-content" hidden>
      <div class="kpai-analysis-metrics">
        <article>
          <span>aHKA</span>
          <strong id="kpai-analysis-ahka">—</strong>
          <small id="kpai-analysis-ahka-class">—</small>
        </article>
        <article>
          <span>JLO</span>
          <strong id="kpai-analysis-jlo">—</strong>
          <small id="kpai-analysis-jlo-class">—</small>
        </article>
        <article class="kpai-cpak-card">
          <span>CPAK</span>
          <strong id="kpai-analysis-cpak">—</strong>
          <small data-es="Fenotipo" data-en="Phenotype">Fenotipo</small>
        </article>
      </div>

      <section class="kpai-matrix-section">
        <div class="kpai-analysis-section-title">
          <strong data-es="Matriz CPAK" data-en="CPAK matrix">Matriz CPAK</strong>
          <small data-es="aHKA × JLO" data-en="aHKA × JLO">aHKA × JLO</small>
        </div>
        <div class="kpai-cpak-matrix" role="table" aria-label="Matriz CPAK">
          <div class="kpai-matrix-corner"></div>
          <div class="kpai-matrix-col" data-es="Varo" data-en="Varus">Varo</div>
          <div class="kpai-matrix-col" data-es="Neutro" data-en="Neutral">Neutro</div>
          <div class="kpai-matrix-col" data-es="Valgo" data-en="Valgus">Valgo</div>

          <div class="kpai-matrix-row" data-es="Ápex distal" data-en="Distal apex">Ápex distal</div>
          <button type="button" class="kpai-matrix-cell" data-cpak="I">I</button>
          <button type="button" class="kpai-matrix-cell" data-cpak="II">II</button>
          <button type="button" class="kpai-matrix-cell" data-cpak="III">III</button>

          <div class="kpai-matrix-row" data-es="Neutra" data-en="Neutral">Neutra</div>
          <button type="button" class="kpai-matrix-cell" data-cpak="IV">IV</button>
          <button type="button" class="kpai-matrix-cell" data-cpak="V">V</button>
          <button type="button" class="kpai-matrix-cell" data-cpak="VI">VI</button>

          <div class="kpai-matrix-row" data-es="Ápex proximal" data-en="Proximal apex">Ápex proximal</div>
          <button type="button" class="kpai-matrix-cell" data-cpak="VII">VII</button>
          <button type="button" class="kpai-matrix-cell" data-cpak="VIII">VIII</button>
          <button type="button" class="kpai-matrix-cell" data-cpak="IX">IX</button>
        </div>
        <div class="kpai-matrix-axis kpai-axis-x"><span>aHKA</span><small data-es="alineación constitucional" data-en="constitutional alignment">alineación constitucional</small></div>
        <div class="kpai-matrix-axis"><span>JLO</span><small data-es="orientación de línea articular" data-en="joint-line orientation">orientación de línea articular</small></div>
      </section>

      <section class="kpai-strategy-section">
        <div class="kpai-analysis-section-title">
          <strong data-es="Estrategias de alineamiento" data-en="Alignment strategies">Estrategias de alineamiento</strong>
          <small data-es="Comparación descriptiva" data-en="Descriptive comparison">Comparación descriptiva</small>
        </div>
        <div class="kpai-strategy-list">
          <article>
            <b>MA</b>
            <div><strong data-es="Mecánica" data-en="Mechanical">Mecánica</strong><p data-es="Objetivo sistemático de alineación mecánica neutra." data-en="Systematic target of neutral mechanical alignment.">Objetivo sistemático de alineación mecánica neutra.</p></div>
          </article>
          <article>
            <b>KA</b>
            <div><strong data-es="Cinemática" data-en="Kinematic">Cinemática</strong><p data-es="Busca aproximar la alineación constitucional y la orientación articular del paciente." data-en="Aims to approximate the patient's constitutional alignment and joint-line orientation.">Busca aproximar la alineación constitucional y la orientación articular del paciente.</p></div>
          </article>
          <article>
            <b>rKA</b>
            <div><strong data-es="Cinemática restringida" data-en="Restricted kinematic">Cinemática restringida</strong><p data-es="Personaliza la alineación dentro de límites predefinidos." data-en="Personalizes alignment within predefined boundaries.">Personaliza la alineación dentro de límites predefinidos.</p></div>
          </article>
          <article>
            <b>FA</b>
            <div><strong data-es="Funcional" data-en="Functional">Funcional</strong><p data-es="Integra posición de componentes y balance de espacios de forma individualizada." data-en="Integrates component positioning and gap balance in an individualized manner.">Integra posición de componentes y balance de espacios de forma individualizada.</p></div>
          </article>
        </div>
        <p class="kpai-analysis-disclaimer" data-es="Vista descriptiva. No recomienda una filosofía quirúrgica ni calcula cortes óseos." data-en="Descriptive view. It does not recommend a surgical philosophy or calculate bone cuts.">Vista descriptiva. No recomienda una filosofía quirúrgica ni calcula cortes óseos.</p>
      </section>
    </div>
  `;
}

function tableValues() {
  const values = new Map();
  for (const row of measurementBody.querySelectorAll('tr')) {
    const key = row.querySelector('th')?.textContent?.trim();
    const value = row.querySelector('td')?.textContent?.trim();
    if (key) values.set(key, value || '');
  }
  return values;
}

function numericValue(text) {
  const match = String(text || '').replace(',', '.').match(/[-+]?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : NaN;
}

function cpakValue(text) {
  const match = String(text || '').match(/\b(IX|VIII|VII|VI|IV|V|III|II|I)\b/);
  return match?.[1] || '';
}

function completeCase() {
  const text = completionStatus?.querySelector('strong')?.textContent || '';
  return /^10\s*\/\s*10$/.test(text.trim());
}

function ahkaCategory(value, language) {
  if (!Number.isFinite(value)) return '—';
  if (value < -2) return language === 'es' ? 'Varo' : 'Varus';
  if (value > 2) return language === 'es' ? 'Valgo' : 'Valgus';
  return language === 'es' ? 'Neutro' : 'Neutral';
}

function jloCategory(value, language) {
  if (!Number.isFinite(value)) return '—';
  if (value < 177) return language === 'es' ? 'Ápex distal' : 'Distal apex';
  if (value > 183) return language === 'es' ? 'Ápex proximal' : 'Proximal apex';
  return language === 'es' ? 'Neutra' : 'Neutral';
}

function signedDegrees(value) {
  if (!Number.isFinite(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}°`;
}

function degrees(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)}°` : '—';
}

function renderAnalysis() {
  const pending = document.getElementById('kpai-analysis-pending');
  const content = document.getElementById('kpai-analysis-content');
  if (!pending || !content) return;

  const values = tableValues();
  const ahka = numericValue(values.get('aHKA'));
  const jlo = numericValue(values.get('JLO'));
  const cpak = cpakValue(values.get('CPAK'));
  const ready = completeCase() && Number.isFinite(ahka) && Number.isFinite(jlo) && Boolean(cpak);

  pending.hidden = ready;
  content.hidden = !ready;
  if (!ready) {
    for (const cell of document.querySelectorAll('.kpai-matrix-cell')) cell.classList.remove('current');
    return;
  }

  const language = currentLanguage();
  document.getElementById('kpai-analysis-ahka').textContent = signedDegrees(ahka);
  document.getElementById('kpai-analysis-ahka-class').textContent = ahkaCategory(ahka, language);
  document.getElementById('kpai-analysis-jlo').textContent = degrees(jlo);
  document.getElementById('kpai-analysis-jlo-class').textContent = jloCategory(jlo, language);
  document.getElementById('kpai-analysis-cpak').textContent = `${language === 'es' ? 'Tipo' : 'Type'} ${cpak}`;

  for (const cell of document.querySelectorAll('.kpai-matrix-cell')) {
    const current = cell.dataset.cpak === cpak;
    cell.classList.toggle('current', current);
    cell.setAttribute('aria-current', current ? 'true' : 'false');
  }
}

function localizeAnalysis() {
  const language = currentLanguage();
  const view = document.getElementById('kpai-analysis-view');
  const tabs = document.querySelector('.kpai-results-tabs');
  for (const element of [...(view?.querySelectorAll('[data-es][data-en]') || []), ...(tabs?.querySelectorAll('[data-es][data-en]') || [])]) {
    element.textContent = element.dataset[language];
  }
}

function installStyles() {
  if (document.getElementById('kpai-analysis-styles')) return;
  const style = document.createElement('style');
  style.id = 'kpai-analysis-styles';
  style.textContent = `
    .kpai-results-tabs{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin:0 0 12px;padding:3px;border:1px solid #203039;border-radius:10px;background:#071016}
    .kpai-results-tabs button{appearance:none;border:0;border-radius:7px;background:transparent;color:#78909a;font:700 .65rem/1 Inter,sans-serif;letter-spacing:.02em;padding:9px 8px;cursor:pointer}
    .kpai-results-tabs button.active{background:#12242a;color:#62dfca;box-shadow:inset 0 0 0 1px rgba(42,213,182,.28)}
    .kpai-results-view[hidden],.kpai-analysis-view[hidden],#kpai-analysis-content[hidden],#kpai-analysis-pending[hidden]{display:none!important}
    .kpai-analysis-view{display:flex;flex-direction:column;gap:12px}
    .kpai-analysis-intro{padding:2px 2px 0}
    .kpai-analysis-kicker{display:block;color:#2ad5b6;font-size:.56rem;font-weight:800;letter-spacing:.12em;margin-bottom:5px}
    .kpai-analysis-intro h3{margin:0;color:#eff8f8;font-size:1.04rem;letter-spacing:-.02em}
    .kpai-analysis-intro p{margin:5px 0 0;color:#78909a;font-size:.63rem;line-height:1.45}
    .kpai-analysis-pending{display:flex;flex-direction:column;gap:5px;padding:14px;border:1px dashed #2b3b43;border-radius:10px;background:#081117;color:#82959d}
    .kpai-analysis-pending strong{color:#c7d4d7;font-size:.72rem}.kpai-analysis-pending span{font-size:.61rem;line-height:1.4}
    #kpai-analysis-content{display:flex;flex-direction:column;gap:13px}
    .kpai-analysis-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
    .kpai-analysis-metrics article{min-width:0;padding:10px 7px;border:1px solid #21333b;border-radius:9px;background:#081219;text-align:center}
    .kpai-analysis-metrics article>span{display:block;color:#718790;font-size:.53rem;font-weight:800;letter-spacing:.08em}
    .kpai-analysis-metrics article>strong{display:block;color:#edf7f7;font-size:.8rem;margin:5px 0 3px;white-space:nowrap}
    .kpai-analysis-metrics article>small{display:block;color:#90a3aa;font-size:.52rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .kpai-analysis-metrics .kpai-cpak-card{border-color:rgba(42,213,182,.34);background:rgba(20,92,83,.12)}
    .kpai-analysis-metrics .kpai-cpak-card>strong{color:#55ddc7}
    .kpai-matrix-section,.kpai-strategy-section{padding:11px;border:1px solid #203039;border-radius:10px;background:#071016}
    .kpai-analysis-section-title{display:flex;justify-content:space-between;gap:8px;align-items:baseline;margin-bottom:9px}
    .kpai-analysis-section-title strong{color:#dce9eb;font-size:.67rem}.kpai-analysis-section-title small{color:#657b84;font-size:.5rem}
    .kpai-cpak-matrix{display:grid;grid-template-columns:minmax(54px,1.25fr) repeat(3,minmax(34px,1fr));gap:4px;align-items:stretch}
    .kpai-matrix-col,.kpai-matrix-row{display:flex;align-items:center;justify-content:center;color:#70858e;font-size:.48rem;font-weight:700;text-align:center;line-height:1.15;padding:3px 2px}
    .kpai-matrix-row{justify-content:flex-start;text-align:left}
    .kpai-matrix-cell{position:relative;min-height:39px;border:1px solid #283a42;border-radius:6px;background:#0b171d;color:#9aadb3;font:800 .68rem/1 Inter,sans-serif;pointer-events:none}
    .kpai-matrix-cell.current{border-color:#2ad5b6;background:rgba(42,213,182,.15);color:#6ff0d8;box-shadow:0 0 0 1px rgba(42,213,182,.18),0 0 16px rgba(42,213,182,.08)}
    .kpai-matrix-cell.current:after{content:'';position:absolute;right:4px;top:4px;width:4px;height:4px;border-radius:50%;background:#2ad5b6}
    .kpai-matrix-axis{display:flex;justify-content:space-between;gap:8px;margin-top:7px;color:#5f747c;font-size:.48rem}.kpai-matrix-axis span{color:#87a0a8;font-weight:800}
    .kpai-matrix-axis.kpai-axis-x{margin-top:9px;padding-top:7px;border-top:1px solid #17272e}
    .kpai-strategy-list{display:grid;gap:5px}
    .kpai-strategy-list article{display:grid;grid-template-columns:31px 1fr;gap:8px;align-items:start;padding:7px;border:1px solid #1d2e35;border-radius:7px;background:#09141a}
    .kpai-strategy-list article>b{display:flex;align-items:center;justify-content:center;min-height:28px;border-radius:6px;background:#10242a;color:#4ed9c2;font-size:.57rem}
    .kpai-strategy-list article strong{display:block;color:#cbd9dc;font-size:.58rem;margin-bottom:2px}.kpai-strategy-list article p{margin:0;color:#728890;font-size:.51rem;line-height:1.35}
    .kpai-analysis-disclaimer{margin:8px 0 0;padding-top:8px;border-top:1px solid #17272e;color:#657981;font-size:.5rem;line-height:1.4}
    @media(max-width:1023px){.kpai-analysis-metrics{grid-template-columns:repeat(3,minmax(90px,1fr))}.kpai-results-tabs{max-width:360px}}
  `;
  document.head.append(style);
}

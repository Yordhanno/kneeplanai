const translations = {
  es: {
    nav_features: 'Funciones', nav_screens: 'Capturas', nav_support: 'Soporte',
    hero_eyebrow: 'KneePlanAI Standard para macOS',
    hero_title: 'Planificación coronal de rodilla, clara y precisa.',
    hero_text: 'Mide, revisa y documenta la alineación coronal en radiografías panorámicas de miembros inferiores.',
    store_kicker: 'Descargar en', hero_secondary: 'Ver funciones', hero_meta_manual: 'Medición manual', hero_meta_local: 'Procesamiento local',
    trust_report: 'Informe PDF',
    features_eyebrow: 'Diseñado para un flujo simple', features_title: 'De la radiografía al informe, en un solo lugar.',
    features_text: 'KneePlanAI organiza las referencias anatómicas, los ángulos y el análisis CPAK sin reemplazar la revisión profesional.',
    f1_title: 'Abre tu radiografía', f1_text: 'Compatible con DICOM, HEIC, PNG, JPEG, TIFF, AVIF y WebP.',
    f2_title: 'Marca y corrige', f2_text: 'Coloca las referencias anatómicas y ajusta círculos, centros y líneas directamente sobre la imagen.',
    f3_title: 'Analiza CPAK', f3_text: 'Visualiza aHKA, JLO, fenotipo CPAK y comparaciones descriptivas de estrategias de alineamiento.',
    f4_title: 'Genera tu informe', f4_text: 'Exporta un informe estructurado en PDF con la imagen y los resultados de alineación.',
    screens_eyebrow: 'Interfaz', screens_title: 'Todo lo importante, visible.',
    screen1_title: 'Medición', screen1_text: 'Referencias y resultados en una sola vista.',
    screen2_title: 'Análisis CPAK', screen2_text: 'Comparación descriptiva de estrategias de alineamiento.',
    screen3_title: 'Informe', screen3_text: 'Resultados organizados y listos para documentar.',
    privacy_eyebrow: 'Privacidad primero', privacy_title: 'Tus estudios permanecen en tu Mac.',
    privacy_text: 'KneePlanAI Standard funciona localmente y no requiere crear una cuenta.', privacy_button: 'Política de privacidad',
    support_eyebrow: 'Soporte', support_title: '¿Necesitas ayuda?', support_text: 'Consulta la guía de soporte o escríbenos para resolver dudas sobre instalación y uso.', support_button: 'Centro de soporte',
    footer_sub: 'Herramienta de apoyo para profesionales de la salud.', footer_privacy: 'Privacidad', footer_support: 'Soporte',
    disclaimer: 'KneePlanAI es una herramienta de apoyo para profesionales capacitados. No sustituye la valoración clínica ni el juicio profesional.'
  },
  en: {
    nav_features: 'Features', nav_screens: 'Screenshots', nav_support: 'Support',
    hero_eyebrow: 'KneePlanAI Standard for macOS',
    hero_title: 'Coronal knee planning, clear and precise.',
    hero_text: 'Measure, review and document coronal alignment from full-length lower-limb radiographs.',
    store_kicker: 'Download on the', hero_secondary: 'Explore features', hero_meta_manual: 'Manual measurement', hero_meta_local: 'Local processing',
    trust_report: 'PDF report',
    features_eyebrow: 'Built for a simple workflow', features_title: 'From radiograph to report, in one place.',
    features_text: 'KneePlanAI organizes anatomical references, angles and CPAK analysis while keeping professional review at the center of the workflow.',
    f1_title: 'Open your radiograph', f1_text: 'Supports DICOM, HEIC, PNG, JPEG, TIFF, AVIF and WebP.',
    f2_title: 'Place and refine', f2_text: 'Place anatomical references and adjust circles, centers and lines directly on the image.',
    f3_title: 'Analyze CPAK', f3_text: 'Review aHKA, JLO, CPAK phenotype and descriptive alignment-strategy comparisons.',
    f4_title: 'Generate your report', f4_text: 'Export a structured PDF report with the image and coronal alignment results.',
    screens_eyebrow: 'Interface', screens_title: 'Everything important, visible.',
    screen1_title: 'Measurement', screen1_text: 'References and results in one view.',
    screen2_title: 'CPAK analysis', screen2_text: 'Descriptive comparison of alignment strategies.',
    screen3_title: 'Report', screen3_text: 'Organized results ready for documentation.',
    privacy_eyebrow: 'Privacy first', privacy_title: 'Your studies stay on your Mac.',
    privacy_text: 'KneePlanAI Standard works locally and does not require an account.', privacy_button: 'Privacy policy',
    support_eyebrow: 'Support', support_title: 'Need help?', support_text: 'Visit the support guide or contact us with questions about installation and use.', support_button: 'Support center',
    footer_sub: 'Decision-support tool for healthcare professionals.', footer_privacy: 'Privacy', footer_support: 'Support',
    disclaimer: 'KneePlanAI is a support tool for trained professionals. It does not replace clinical assessment or professional judgment.'
  }
};

const screenshots = {
  es: ['assets/app-es-main.png', 'assets/app-es-analysis.png', 'assets/app-es-report.png'],
  en: ['assets/app-en-main.png', 'assets/app-en-analysis.png', 'assets/app-en-report.png']
};

function setLanguage(lang) {
  const dict = translations[lang] || translations.es;
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (dict[key]) el.textContent = dict[key];
  });

  const hero = document.getElementById('heroScreenshot');
  const main = document.getElementById('screenMain');
  const analysis = document.getElementById('screenAnalysis');
  const report = document.getElementById('screenReport');
  if (hero) hero.src = screenshots[lang][0];
  if (main) main.src = screenshots[lang][0];
  if (analysis) analysis.src = screenshots[lang][1];
  if (report) report.src = screenshots[lang][2];

  const toggle = document.getElementById('langToggle');
  if (toggle) toggle.textContent = lang === 'es' ? 'EN' : 'ES';
  localStorage.setItem('kneeplanai-language', lang);
}

const saved = localStorage.getItem('kneeplanai-language');
const initial = saved || (navigator.language.toLowerCase().startsWith('es') ? 'es' : 'en');
setLanguage(initial);

document.getElementById('langToggle')?.addEventListener('click', () => {
  setLanguage(document.documentElement.lang === 'es' ? 'en' : 'es');
});

const translations = {
  es: {
    title: 'KneePlanAI | Análisis inteligente de la alineación de rodilla',
    description: 'KneePlanAI — análisis asistido por inteligencia artificial de la alineación coronal para la planificación de artroplastia total de rodilla.',
    privacyTitle: 'KneePlanAI | Política de privacidad',
    privacyDescription: 'Política de privacidad de KneePlanAI Standard: procesamiento local y sin recopilación de datos.',
    researchersTitle: 'KneePlanAI | Únete como investigador',
    researchersDescription: 'Solicita participar como validador externo o tester en la red privada de investigación de KneePlanAI.',
    menuOpen: 'Abrir menú',
    menuClose: 'Cerrar menú',
    navigation: 'Navegación principal'
  },
  en: {
    title: 'KneePlanAI | AI-assisted knee alignment analysis',
    description: 'KneePlanAI — AI-assisted coronal alignment analysis for total knee arthroplasty planning and research.',
    privacyTitle: 'KneePlanAI | Privacy Policy',
    privacyDescription: 'KneePlanAI Standard privacy policy: local processing and no data collection.',
    researchersTitle: 'KneePlanAI | Join as a researcher',
    researchersDescription: 'Apply as an external validator or tester in the private KneePlanAI research network.',
    menuOpen: 'Open menu',
    menuClose: 'Close menu',
    navigation: 'Primary navigation'
  }
};

const languageButtons = document.querySelectorAll('[data-language]');
const menuButton = document.querySelector('.menu-button');
const nav = document.querySelector('.nav');

function detectLanguage() {
  let saved = null;
  try {
    saved = localStorage.getItem('kneeplanai-language');
  } catch (_) {
    saved = null;
  }
  if (saved === 'es' || saved === 'en') return saved;
  const browserLanguages = navigator.languages?.length ? navigator.languages : [navigator.language || 'en'];
  return browserLanguages.some((locale) => locale.toLowerCase().startsWith('es')) ? 'es' : 'en';
}

function setLanguage(language, persist = true) {
  const lang = language === 'es' ? 'es' : 'en';
  document.documentElement.lang = lang;

  document.querySelectorAll('[data-es][data-en]').forEach((element) => {
    element.textContent = element.dataset[lang];
  });

  const copy = translations[lang];
  const page = document.body.dataset.page;
  const pageTitle = page === 'privacy' ? copy.privacyTitle : page === 'researchers' ? copy.researchersTitle : copy.title;
  const pageDescription = page === 'privacy' ? copy.privacyDescription : page === 'researchers' ? copy.researchersDescription : copy.description;
  document.title = pageTitle;
  document.querySelector('meta[name="description"]')?.setAttribute('content', pageDescription);
  document.querySelector('meta[property="og:title"]')?.setAttribute('content', pageTitle);
  document.querySelector('meta[property="og:description"]')?.setAttribute('content', pageDescription);
  nav?.setAttribute('aria-label', copy.navigation);
  menuButton?.setAttribute('aria-label', nav?.classList.contains('open') ? copy.menuClose : copy.menuOpen);

  languageButtons.forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.language === lang));
  });

  if (persist) {
    try {
      localStorage.setItem('kneeplanai-language', lang);
    } catch (_) {
      // The language switch still works when storage is unavailable.
    }
  }
}

languageButtons.forEach((button) => {
  button.addEventListener('click', () => setLanguage(button.dataset.language));
});

menuButton?.addEventListener('click', () => {
  const isOpen = nav.classList.toggle('open');
  menuButton.setAttribute('aria-expanded', String(isOpen));
  menuButton.setAttribute('aria-label', translations[document.documentElement.lang].menuClose);
  if (!isOpen) menuButton.setAttribute('aria-label', translations[document.documentElement.lang].menuOpen);
});

nav?.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    nav.classList.remove('open');
    menuButton?.setAttribute('aria-expanded', 'false');
    menuButton?.setAttribute('aria-label', translations[document.documentElement.lang].menuOpen);
  });
});

const year = document.getElementById('year');
if (year) year.textContent = new Date().getFullYear();
setLanguage(detectLanguage(), false);

if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  document.querySelectorAll('.reveal').forEach((element) => observer.observe(element));
} else {
  document.querySelectorAll('.reveal').forEach((element) => element.classList.add('visible'));
}

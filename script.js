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

function installResearchAccessButton() {
  const headerActions = document.querySelector('.header-actions');
  if (!headerActions || document.querySelector('.research-login-cta')) return;

  const login = document.createElement('a');
  login.className = 'research-login-cta';
  login.href = 'https://research.kneeplanai.com/';
  login.setAttribute('aria-label', 'Acceder al portal KneePlanAI Research');
  login.innerHTML = `
    <span class="research-login-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24"><path d="M12 12a4.25 4.25 0 1 0 0-8.5 4.25 4.25 0 0 0 0 8.5Zm0 2c-4.42 0-8 2.32-8 5.18 0 .73.59 1.32 1.32 1.32h13.36c.73 0 1.32-.59 1.32-1.32C20 16.32 16.42 14 12 14Z"/></svg>
    </span>
    <span data-es="Acceder" data-en="Sign in">Acceder</span>
    <span class="research-login-arrow" aria-hidden="true">↗</span>
  `;

  const languageSwitch = headerActions.querySelector('.language-switch');
  headerActions.insertBefore(login, languageSwitch || headerActions.firstChild);

  if (nav && !nav.querySelector('.research-login-mobile')) {
    const mobileLogin = document.createElement('a');
    mobileLogin.className = 'research-login-mobile';
    mobileLogin.href = 'https://research.kneeplanai.com/';
    mobileLogin.dataset.es = 'Acceder al portal Research';
    mobileLogin.dataset.en = 'Sign in to Research portal';
    mobileLogin.textContent = 'Acceder al portal Research';
    nav.append(mobileLogin);
  }

  if (!document.getElementById('research-login-style')) {
    const style = document.createElement('style');
    style.id = 'research-login-style';
    style.textContent = `
      .research-login-cta{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:8px 12px;border:1px solid rgba(68,227,194,.28);border-radius:11px;background:rgba(68,227,194,.075);color:#eafffa;text-decoration:none;font-size:.86rem;font-weight:750;white-space:nowrap;transition:background .2s ease,border-color .2s ease,transform .2s ease,box-shadow .2s ease}
      .research-login-cta:hover{transform:translateY(-1px);background:rgba(68,227,194,.12);border-color:rgba(68,227,194,.5);box-shadow:0 8px 24px rgba(0,0,0,.18)}
      .research-login-icon{display:grid;place-items:center;width:20px;height:20px;border-radius:50%;background:rgba(68,227,194,.13);color:#44e3c2}
      .research-login-icon svg{width:12px;height:12px;fill:currentColor}
      .research-login-arrow{color:#44e3c2;font-size:.78rem}
      .research-login-mobile{display:none!important}
      @media(max-width:1100px){.research-login-cta{padding:8px 11px}}
      @media(max-width:900px){.research-login-cta{display:none}.nav .research-login-mobile{display:block!important;color:#44e3c2!important;font-weight:750}.nav .research-login-mobile:hover{color:#7aefd8!important}}
    `;
    document.head.append(style);
  }
}

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

installResearchAccessButton();

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

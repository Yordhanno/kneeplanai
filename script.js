document.getElementById('year').textContent = new Date().getFullYear();

// Brand assets
const favicon = document.createElement('link');
favicon.rel = 'icon';
favicon.type = 'image/svg+xml';
favicon.href = '/favicon.svg';
document.head.appendChild(favicon);

const canonical = document.createElement('link');
canonical.rel = 'canonical';
canonical.href = 'https://kneeplanai.com/';
document.head.appendChild(canonical);

document.querySelectorAll('.brand-mark').forEach((mark) => {
  mark.innerHTML = '<img src="/logo-mark.svg" alt="" width="28" height="28" style="display:block;width:28px;height:28px" />';
});

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));

const menuButton = document.querySelector('.menu-button');
const nav = document.querySelector('.nav');

if (menuButton && nav) {
  menuButton.addEventListener('click', () => {
    const isOpen = menuButton.getAttribute('aria-expanded') === 'true';
    menuButton.setAttribute('aria-expanded', String(!isOpen));
    nav.style.display = isOpen ? '' : 'flex';
    if (!isOpen) {
      nav.style.position = 'absolute';
      nav.style.top = '68px';
      nav.style.left = '4vw';
      nav.style.right = '4vw';
      nav.style.flexDirection = 'column';
      nav.style.padding = '18px';
      nav.style.border = '1px solid rgba(255,255,255,.08)';
      nav.style.borderRadius = '14px';
      nav.style.background = 'rgba(7,9,13,.98)';
    }
  });
}

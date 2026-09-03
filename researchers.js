const researcherForm = document.getElementById('researcher-form');

researcherForm?.addEventListener('submit', (event) => {
  event.preventDefault();

  if (!researcherForm.reportValidity()) return;

  const data = new FormData(researcherForm);
  const language = document.documentElement.lang === 'es' ? 'es' : 'en';
  const subject = language === 'es'
    ? 'Solicitud para participar en KneePlanAI Research Network'
    : 'Application to join the KneePlanAI Research Network';
  const labels = language === 'es'
    ? { name: 'Nombre', email: 'Correo', institution: 'Institución', country: 'País', role: 'Participación', motivation: 'Motivo de interés' }
    : { name: 'Name', email: 'Email', institution: 'Institution', country: 'Country', role: 'Participation', motivation: 'Reason for interest' };
  const body = [
    'KneePlanAI Research Network',
    '',
    `${labels.name}: ${data.get('name')}`,
    `${labels.email}: ${data.get('email')}`,
    `${labels.institution}: ${data.get('institution')}`,
    `${labels.country}: ${data.get('country')}`,
    `${labels.role}: ${data.get('role')}`,
    '',
    `${labels.motivation}:`,
    data.get('motivation')
  ].join('\n');

  window.location.href = `mailto:yordhanno.fallaque@icloud.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
});

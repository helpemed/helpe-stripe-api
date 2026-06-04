(function () {
  var form = document.getElementById('blueprint-intake-form');
  if (!form) return;

  var API_BASE =
    (typeof window !== 'undefined' && window.HELPE_STRIPE_API_BASE) ||
    'https://helpe-stripe-api.onrender.com';
  var intakeEndpoint = API_BASE.replace(/\/$/, '') + '/api/blueprint-intake';

  var steps = Array.prototype.slice.call(form.querySelectorAll('.blueprint-form-step'));
  var totalSteps = steps.length;
  var current = 0;

  var labelEl = document.getElementById('bp-step-label');
  var fillEl = document.getElementById('bp-progress-fill');
  var btnNext = document.getElementById('bp-btn-next');
  var btnPrev = document.getElementById('bp-btn-prev');
  var btnSubmit = document.getElementById('bp-btn-submit');
  var cardTitle = document.getElementById('bp-form-step-title');
  var successPanel = document.getElementById('bp-success-panel');
  var orderCard = form.closest('.blueprint-order-card');

  var stepTitles = [
    'Votre identité et cabinet',
    'Votre situation actuelle',
    'Vos objectifs et contraintes',
    'Finalisation et envoi',
  ];

  function showStep(index) {
    current = index;
    steps.forEach(function (step, i) {
      step.hidden = i !== index;
    });
    if (labelEl) labelEl.textContent = 'Étape ' + (index + 1) + ' sur ' + totalSteps;
    if (fillEl) fillEl.style.width = ((index + 1) / totalSteps) * 100 + '%';
    var progressBar = form.querySelector('[role="progressbar"]');
    if (progressBar) progressBar.setAttribute('aria-valuenow', String(index + 1));
    if (cardTitle) cardTitle.textContent = stepTitles[index] || '';
    if (btnPrev) btnPrev.classList.toggle('bp-form-btn-hidden', index === 0);
    if (btnNext) btnNext.classList.toggle('bp-form-btn-hidden', index === totalSteps - 1);
    if (btnSubmit) btnSubmit.classList.toggle('bp-form-btn-hidden', index !== totalSteps - 1);
    if (orderCard) orderCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  var socialNetworks = ['facebook', 'instagram'];

  function syncSocialField(network) {
    var select = document.getElementById('bp-' + network + '-publie');
    var detail = document.getElementById('bp-' + network + '-detail');
    var page = document.getElementById('bp-' + network + '-page');
    if (!select || !detail || !page) return;

    var active = select.value === 'oui';
    detail.hidden = !active;
    page.required = active;
    if (!active) {
      page.value = '';
      page.classList.remove('bp-field-error');
    }
  }

  socialNetworks.forEach(function (network) {
    var select = document.getElementById('bp-' + network + '-publie');
    if (select) {
      select.addEventListener('change', function () {
        syncSocialField(network);
      });
      syncSocialField(network);
    }
  });

  function getVisibleFields() {
    return steps[current].querySelectorAll('input, select, textarea');
  }

  function validateStep() {
    var valid = true;
    getVisibleFields().forEach(function (field) {
      field.classList.remove('bp-field-error');
      if (field.type === 'checkbox') {
        if (field.required && !field.checked) {
          valid = false;
          field.classList.add('bp-field-error');
        }
        return;
      }
      if (field.id && (field.id === 'bp-facebook-page' || field.id === 'bp-instagram-page')) {
        if (!field.required) return;
      }
      if (!field.required) return;
      if (!String(field.value || '').trim()) {
        valid = false;
        field.classList.add('bp-field-error');
      }
    });

    socialNetworks.forEach(function (network) {
      var select = document.getElementById('bp-' + network + '-publie');
      var page = document.getElementById('bp-' + network + '-page');
      if (!select || !steps[current].contains(select)) return;
      if (!String(select.value || '').trim()) {
        valid = false;
        select.classList.add('bp-field-error');
      }
      if (select.value === 'oui' && page && !String(page.value || '').trim()) {
        valid = false;
        page.classList.add('bp-field-error');
      }
    });

    if (!valid) {
      var first = steps[current].querySelector('.bp-field-error');
      if (first) first.focus();
    }
    return valid;
  }

  function collectPayload() {
    var rgpd = document.getElementById('bp-rgpd');
    return {
      prenom: document.getElementById('bp-prenom')?.value?.trim() || '',
      nom: document.getElementById('bp-nom')?.value?.trim() || '',
      metier: document.getElementById('bp-metier')?.value?.trim() || '',
      ville: document.getElementById('bp-ville')?.value?.trim() || '',
      cabinet: document.getElementById('bp-cabinet')?.value?.trim() || '',
      structure: document.getElementById('bp-structure')?.value?.trim() || '',
      site: document.getElementById('bp-site')?.value?.trim() || '',
      agenda: document.getElementById('bp-agenda')?.value?.trim() || '',
      gbp: document.getElementById('bp-gbp')?.value?.trim() || '',
      avis: document.getElementById('bp-avis')?.value?.trim() || '',
      contenu: document.getElementById('bp-contenu')?.value?.trim() || '',
      facebook_publie: document.getElementById('bp-facebook-publie')?.value?.trim() || '',
      facebook_page:
        document.getElementById('bp-facebook-publie')?.value === 'oui'
          ? document.getElementById('bp-facebook-page')?.value?.trim() || ''
          : '',
      instagram_publie: document.getElementById('bp-instagram-publie')?.value?.trim() || '',
      instagram_page:
        document.getElementById('bp-instagram-publie')?.value === 'oui'
          ? document.getElementById('bp-instagram-page')?.value?.trim() || ''
          : '',
      budget: document.getElementById('bp-budget')?.value?.trim() || '',
      objectif: document.getElementById('bp-objectif')?.value?.trim() || '',
      deontologie: document.getElementById('bp-deontologie')?.value?.trim() || '',
      concurrence: document.getElementById('bp-concurrence')?.value?.trim() || '',
      preference: document.getElementById('bp-preference')?.value?.trim() || '',
      specialite: document.getElementById('bp-specialite')?.value?.trim() || '',
      email: document.getElementById('bp-email')?.value?.trim() || '',
      creneaux: document.getElementById('bp-creneaux')?.value?.trim() || '',
      rgpd_accepted: Boolean(rgpd && rgpd.checked),
    };
  }

  function showSuccess(data) {
    form.hidden = true;
    var progress = form.previousElementSibling;
    if (progress && progress.classList.contains('blueprint-form-progress')) progress.hidden = true;
    if (cardTitle) cardTitle.hidden = true;
    var notice = document.getElementById('bp-form-notice');
    if (notice) notice.hidden = true;

    if (successPanel) {
      successPanel.hidden = false;
      var idEl = document.getElementById('bp-success-blueprint-id');
      var msgEl = document.getElementById('bp-success-message');
      if (idEl && data.blueprint_id) {
        idEl.textContent = data.blueprint_id;
      }
      if (msgEl && data.message) {
        msgEl.textContent = data.message;
      }
    }
  }

  if (btnNext) {
    btnNext.addEventListener('click', function () {
      if (!validateStep()) return;
      if (current < totalSteps - 1) showStep(current + 1);
    });
  }

  if (btnPrev) {
    btnPrev.addEventListener('click', function () {
      if (current > 0) showStep(current - 1);
    });
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!validateStep()) return;

    var payload = collectPayload();
    var submitBtn = btnSubmit;
    var prevLabel = submitBtn ? submitBtn.textContent : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Envoi en cours…';
    }

    try {
      var res = await fetch(intakeEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      var data = await res.json().catch(function () {
        return {};
      });

      if (!res.ok) {
        var errMsg = data.error || data.message || 'Erreur ' + res.status;
        if (data.hint) errMsg += '\n\n' + data.hint;
        throw new Error(errMsg);
      }

      if (data.checkout_url) {
        window.location.href = data.checkout_url;
        return;
      }

      showSuccess(data);
    } catch (err) {
      var msg = err && err.message ? err.message : 'Une erreur est survenue.';
      if (err instanceof TypeError && /fetch/i.test(msg)) {
        msg =
          'Connexion au serveur impossible. Réessayez dans un instant (le serveur peut mettre ~30 s à se réveiller).';
      }
      alert(msg + '\n\nBesoin d\u2019aide : contact@helpe-med.com');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = prevLabel;
      }
    }
  });

  showStep(0);
})();

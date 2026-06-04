(function () {
  var API_BASE =
    (typeof window !== 'undefined' && window.HELPE_STRIPE_API_BASE) ||
    'https://helpe-stripe-api.onrender.com';
  var endpoint = API_BASE.replace(/\/$/, '') + '/api/create-checkout-session';
  var emailInput = document.getElementById('helpe-checkout-email');

  function getEmail() {
    if (!emailInput) return null;
    var email = String(emailInput.value || '').trim();
    emailInput.classList.remove('helpe-checkout-email--error');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      emailInput.classList.add('helpe-checkout-email--error');
      emailInput.focus();
      emailInput.reportValidity && emailInput.reportValidity();
      return null;
    }
    return email;
  }

  document.querySelectorAll('.helpe-btn-stripe-checkout').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      if (btn.dataset.loading === '1') return;

      var email = getEmail();
      if (!email) {
        if (emailInput) {
          emailInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
      }

      btn.dataset.loading = '1';
      var label = btn.querySelector('.helpe-checkout-label');
      var prevText = label ? label.textContent : '';
      btn.disabled = true;
      if (label) label.textContent = 'Connexion à Stripe…';

      try {
        var res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email }),
        });
        var data = await res.json().catch(function () { return {}; });
        if (!res.ok) {
          var errMsg = data.error || data.message || 'Erreur ' + res.status + '. Impossible de démarrer le paiement.';
          if (data.detail) errMsg += '\n\nDétail : ' + data.detail;
          throw new Error(errMsg);
        }
        if (!data.url) throw new Error('Réponse invalide du serveur.');
        window.location.href = data.url;
      } catch (e) {
        var msg = e && e.message ? e.message : 'Une erreur est survenue.';
        if (e instanceof TypeError && /fetch/i.test(msg)) {
          msg =
            'Connexion au serveur impossible. Vérifiez votre connexion ou réessayez dans un instant (le serveur peut mettre ~30 s à se réveiller).';
        }
        alert(msg + '\n\nBesoin d\u2019aide : contact@helpe-med.com');
        btn.disabled = false;
        btn.dataset.loading = '0';
        if (label) label.textContent = prevText;
      }
    });
  });
})();

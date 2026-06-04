(function () {
  var params = new URLSearchParams(window.location.search);
  var sessionId = params.get('session_id');
  if (!sessionId || !/^cs_/.test(sessionId)) return;

  var storageKey = 'helpe_confirm_' + sessionId;
  try {
    if (sessionStorage.getItem(storageKey)) return;
    sessionStorage.setItem(storageKey, '1');
  } catch (e) {}

  var API_BASE =
    (typeof window !== 'undefined' && window.HELPE_STRIPE_API_BASE) ||
    'https://helpe-stripe-api.onrender.com';
  var endpoint = API_BASE.replace(/\/$/, '') + '/api/confirm-checkout-session';

  fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  })
    .then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          console.warn('[HelpE] Confirmation session:', data.error || res.status);
          return;
        }
        if (data.ok && data.email) {
          console.log('[HelpE] Accès formation confirmé pour', data.email);
        }
      });
    })
    .catch(function (err) {
      console.warn('[HelpE] Confirmation session impossible:', err);
    });
})();

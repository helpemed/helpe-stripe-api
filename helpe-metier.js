(function (global) {
  'use strict';

  var STORAGE_KEY = 'helpe_metier';

  var PATH_RULES = [
    { re: /\/kinesitherapeute(?:\/|$)/i, metier: 'kine' },
    { re: /\/osteopathe(?:\/|$)/i, metier: 'osteo' },
    { re: /\/podologue(?:\/|$)/i, metier: 'podo' },
    { re: /\/ressources\/[^/]*kinesitherapeute/i, metier: 'kine' },
    { re: /\/ressources\/[^/]*-kine[^/]*(?:\/|$)/i, metier: 'kine' },
    { re: /\/ressources\/[^/]*osteopathe/i, metier: 'osteo' },
    { re: /\/ressources\/[^/]*podologue/i, metier: 'podo' }
  ];

  var PARAM_ALIASES = {
    kine: 'kine',
    kiné: 'kine',
    kinesitherapeute: 'kine',
    'kinésithérapeute': 'kine',
    osteo: 'osteo',
    ostéo: 'osteo',
    osteopathe: 'osteo',
    'ostéopathe': 'osteo',
    podo: 'podo',
    podologue: 'podo',
    podologues: 'podo',
    'pédicure-podologue': 'podo',
    'pedicure-podologue': 'podo',
    pedicure_podologue: 'podo'
  };

  var METIER_KEYS = ['kine', 'osteo', 'podo'];

  function normalizeMetier(value) {
    if (!value) return null;
    var key = String(value).trim().toLowerCase();
    if (PARAM_ALIASES[key]) return PARAM_ALIASES[key];
    return METIER_KEYS.indexOf(key) !== -1 ? key : null;
  }

  function metierFromPath(path) {
    var p = path || '';
    for (var i = 0; i < PATH_RULES.length; i++) {
      if (PATH_RULES[i].re.test(p)) return PATH_RULES[i].metier;
    }
    return null;
  }

  function metierFromReferrer() {
    try {
      if (!document.referrer) return null;
      var ref = new URL(document.referrer);
      if (ref.origin !== location.origin) return null;
      return metierFromPath(ref.pathname);
    } catch (e) {
      return null;
    }
  }

  function readStoredMetier() {
    try {
      return normalizeMetier(localStorage.getItem(STORAGE_KEY));
    } catch (e) {
      return null;
    }
  }

  function persistMetier(metier) {
    var normalized = normalizeMetier(metier);
    if (!normalized) return null;
    try {
      localStorage.setItem(STORAGE_KEY, normalized);
    } catch (e) {}
    cachedDisplayMetier = normalized;
    return normalized;
  }

  function detectMetier(options) {
    options = options || {};
    var params;
    try {
      params = new URLSearchParams(location.search);
    } catch (e) {
      params = null;
    }

    if (params) {
      var fromParam = normalizeMetier(params.get('metier') || params.get('profession'));
      if (fromParam) {
        persistMetier(fromParam);
        return fromParam;
      }
    }

    if (!options.skipReferrer) {
      var fromRef = metierFromReferrer();
      if (fromRef) {
        persistMetier(fromRef);
        return fromRef;
      }
    }

    var stored = readStoredMetier();
    if (stored) return stored;

    return null;
  }

  function persistFromCurrentPage() {
    return persistMetier(metierFromPath(location.pathname));
  }

  var METIER_TOGGLE_KEY = 'helpe_featured_metier_toggle';
  var cachedDisplayMetier = null;

  var SOLUTION_SLUGS = {
    google: {
      kine: 'fiche-google-my-business-kinesitherapeute',
      osteo: 'fiche-google-my-business-osteopathe',
      podo: 'fiche-google-my-business-podologue'
    },
    content: {
      kine: 'communication-kine-regles-deontologie',
      osteo: 'communication-osteopathe-cadre-legal',
      podo: 'communication-podologue-cadre-deontologique'
    },
    patientele: {
      kine: 'comment-developper-patientele-kinesitherapeute',
      osteo: 'comment-developper-patientele-osteopathe',
      podo: 'comment-developper-patientele-podologue'
    }
  };

  function resolveMetierKey(metier) {
    if (metier === 'osteo' || metier === 'podo') return metier;
    return 'kine';
  }

  function resolveDisplayMetier() {
    if (cachedDisplayMetier) return cachedDisplayMetier;

    var detected = detectMetier();
    if (detected) {
      cachedDisplayMetier = detected;
      return detected;
    }

    try {
      var toggle = sessionStorage.getItem(METIER_TOGGLE_KEY);
      var idx = METIER_KEYS.indexOf(toggle);
      var next = METIER_KEYS[(idx + 1) % METIER_KEYS.length];
      sessionStorage.setItem(METIER_TOGGLE_KEY, next);
      cachedDisplayMetier = next;
      return next;
    } catch (e) {
      cachedDisplayMetier = 'kine';
      return 'kine';
    }
  }

  function buildArticleUrl(slug, utm) {
    utm = utm || {};
    var params = new URLSearchParams({
      utm_source: utm.source || 'home',
      utm_medium: utm.medium || 'link',
      utm_campaign: utm.campaign || 'article'
    });
    return 'ressources/' + slug + '/?' + params.toString();
  }

  function solutionArticleUrl(topic, metier, utmMedium) {
    var key = resolveMetierKey(metier);
    var slugs = SOLUTION_SLUGS[topic];
    if (!slugs) return buildArticleUrl(SOLUTION_SLUGS.patientele[key], { medium: utmMedium, campaign: topic });
    return buildArticleUrl(slugs[key], { medium: utmMedium, campaign: topic });
  }

  function notifyMetierChange(metier) {
    document.dispatchEvent(
      new CustomEvent('helpe:metier-change', { detail: { metier: metier } })
    );
  }

  function bindMetierPills() {
    document.querySelectorAll('[data-helpe-metier]').forEach(function (pill) {
      pill.addEventListener('click', function () {
        var metier = normalizeMetier(pill.getAttribute('data-helpe-metier'));
        if (!metier) return;
        persistMetier(metier);
        notifyMetierChange(metier);
      });
    });
  }

  global.HelpeMetier = {
    detect: detectMetier,
    persist: persistMetier,
    fromPath: metierFromPath,
    normalize: normalizeMetier,
    persistFromCurrentPage: persistFromCurrentPage,
    resolveDisplayMetier: resolveDisplayMetier,
    buildArticleUrl: buildArticleUrl,
    solutionArticleUrl: solutionArticleUrl,
    bindMetierPills: bindMetierPills
  };
})(window);

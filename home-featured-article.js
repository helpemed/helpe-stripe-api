(function () {
  'use strict';

  if (!window.HelpeMetier) return;

  var ARTICLES = {
    kine: [
      {
        slug: 'comment-developper-patientele-kinesitherapeute',
        title: 'Comment développer sa patientèle de kiné en libéral',
        excerpt: 'Pourquoi l\u2019agenda reste vide, ce que l\u2019ONMK autorise, les 4 leviers qui fonctionnent et par où commencer.',
        label: 'Kinésithérapeute'
      },
      {
        slug: 'fiche-google-my-business-kinesitherapeute',
        title: 'Fiche Google My Business pour kinésithérapeute',
        excerpt: 'Catégorie, description, photos, avis, posts et maintenance mensuelle, sans publicité interdite.',
        label: 'Kinésithérapeute'
      },
      {
        slug: 'communication-kine-regles-deontologie',
        title: 'Communication kiné et règles de déontologie',
        excerpt: 'Ce que l\u2019ONMK autorise sur le site, Google et les réseaux, et ce qui expose à un rappel à l\u2019ordre.',
        label: 'Kinésithérapeute'
      }
    ],
    osteo: [
      {
        slug: 'comment-developper-patientele-osteopathe',
        title: 'Comment développer sa patientèle d\u2019ostéopathe en libéral',
        excerpt: 'Cadre légal, 4 leviers, délais réalistes et plan d\u2019action semaine 1, guide 2026.',
        label: 'Ostéopathe'
      },
      {
        slug: 'fiche-google-my-business-osteopathe',
        title: 'Fiche Google My Business pour ostéopathe',
        excerpt: 'Catégorie Ostéopathe, description, services, Q&R, avis, posts et maintenance mensuelle.',
        label: 'Ostéopathe'
      },
      {
        slug: 'communication-osteopathe-cadre-legal',
        title: 'Communication ostéopathe et cadre légal',
        excerpt: 'Ce que le droit autorise sur le site, Google et les réseaux, et ce qui expose à un signalement.',
        label: 'Ostéopathe'
      }
    ],
    podo: [
      {
        slug: 'comment-developper-patientele-podologue',
        title: 'Comment développer sa patientèle de podologue en libéral',
        excerpt: 'Cadre ONPP, 4 leviers (GMB, contenu, prescripteurs, site), délais réalistes et plan semaine 1.',
        label: 'Podologue'
      },
      {
        slug: 'fiche-google-my-business-podologue',
        title: 'Fiche Google My Business pour podologue',
        excerpt: 'Catégorie Pédicure-podologue, description, services, Q&R, avis, posts et maintenance mensuelle.',
        label: 'Podologue'
      },
      {
        slug: 'communication-podologue-cadre-deontologique',
        title: 'Communication podologue et cadre déontologique',
        excerpt: 'Ce que l\u2019ONPP autorise sur le site, Google et les réseaux, et ce qui expose à un rappel à l\u2019ordre.',
        label: 'Podologue'
      }
    ]
  };

  var ROTATE_KEY = 'helpe_featured_article_idx';

  function pickArticle(metier) {
    var pool = ARTICLES[metier] || ARTICLES.kine;
    var storageKey = ROTATE_KEY + '_' + metier;
    var index = 0;

    try {
      index = parseInt(sessionStorage.getItem(storageKey) || '0', 10);
      if (isNaN(index) || index < 0) index = 0;
      sessionStorage.setItem(storageKey, String((index + 1) % pool.length));
    } catch (e) {
      index = Math.floor(Math.random() * pool.length);
    }

    return pool[index % pool.length];
  }

  function articleUrl(slug, metier) {
    return HelpeMetier.buildArticleUrl(slug, {
      medium: 'hero_featured',
      campaign: metier + '_article'
    });
  }

  function renderFeatured(root, metier, article) {
    var url = articleUrl(article.slug, metier);

    root.innerHTML =
      '<p class="hero-featured-label">' +
      '<span class="hero-featured-badge">Article du moment</span>' +
      '<span class="hero-featured-metier">' + article.label + '</span>' +
      '</p>' +
      '<h2 class="hero-featured-title">' +
      '<a href="' + url + '">' + article.title + '</a>' +
      '</h2>' +
      '<p class="hero-featured-excerpt">' + article.excerpt + '</p>' +
      '<p class="hero-featured-footer">' +
      '<a href="' + url + '" class="hero-featured-cta">Lire l\u2019article \u2192</a>' +
      '<span class="hero-featured-sep" aria-hidden="true">·</span>' +
      '<a href="ressources/?utm_source=home&utm_medium=hero_featured&utm_campaign=hub" class="hero-featured-all">Tous les articles</a>' +
      '</p>';
  }

  function bindFeaturedOnMetierChange() {
    document.addEventListener('helpe:metier-change', function (event) {
      var metier = event.detail && event.detail.metier;
      var root = document.getElementById('hero-featured-article');
      if (!metier || !root) return;
      renderFeatured(root, metier, pickArticle(metier));
    });
  }

  function init() {
    var root = document.getElementById('hero-featured-article');
    if (!root) return;

    HelpeMetier.bindMetierPills();

    var metier = HelpeMetier.resolveDisplayMetier();
    var article = pickArticle(metier);
    renderFeatured(root, metier, article);
    bindFeaturedOnMetierChange();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

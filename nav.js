(function () {
  'use strict';

  var hamburger = document.getElementById('hamburger');
  var mobileMenu = document.getElementById('mobile-menu');

  function closeMobileMenu() {
    if (!mobileMenu) return;
    mobileMenu.classList.remove('open');
    if (hamburger) hamburger.setAttribute('aria-expanded', 'false');
  }

  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', function () {
      var open = mobileMenu.classList.toggle('open');
      hamburger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    mobileMenu.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', closeMobileMenu);
    });
  }

  document.querySelectorAll('[data-mobile-nav-group]').forEach(function (group) {
    var toggle = group.querySelector('.mobile-nav-group-toggle');
    if (!toggle) return;
    toggle.addEventListener('click', function () {
      var open = group.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  });

  document.querySelectorAll('[data-nav-dropdown]').forEach(function (dropdown) {
    var btn = dropdown.querySelector('.nav-dropdown-toggle');
    var panel = dropdown.querySelector('.nav-dropdown-panel');
    if (!btn || !panel) return;

    btn.addEventListener('click', function (event) {
      event.stopPropagation();
      var isOpen = dropdown.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    panel.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        dropdown.classList.remove('is-open');
        btn.setAttribute('aria-expanded', 'false');
      });
    });
  });

  document.addEventListener('click', function (event) {
    if (event.target.closest('[data-nav-dropdown]')) return;
    document.querySelectorAll('[data-nav-dropdown].is-open').forEach(function (dropdown) {
      dropdown.classList.remove('is-open');
      var btn = dropdown.querySelector('.nav-dropdown-toggle');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    });
  });

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    document.querySelectorAll('[data-nav-dropdown].is-open').forEach(function (dropdown) {
      dropdown.classList.remove('is-open');
      var btn = dropdown.querySelector('.nav-dropdown-toggle');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    });
    closeMobileMenu();
  });

  window.addEventListener('scroll', function () {
    var nav = document.querySelector('nav');
    if (!nav) return;
    nav.style.boxShadow = window.scrollY > 20 ? '0 2px 20px rgba(0,0,0,.08)' : 'none';
  });
})();

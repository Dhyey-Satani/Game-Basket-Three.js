/* ============================================================
   BASKETBALL ARENA — BLOG
   Shared vanilla JS: mobile nav, article search, TOC generation.
   Loaded on /blog and article pages.
   ============================================================ */
(function () {
  'use strict';

  /* Mobile navigation toggle */
  var toggle = document.getElementById('nav-toggle');
  var nav = document.getElementById('site-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  /* Client-side article search (listing page only) */
  var input = document.getElementById('search-input');
  var grid = document.getElementById('articles-grid');
  var noResults = document.getElementById('no-results');
  if (input && grid) {
    var cards = grid.querySelectorAll('.article-card');
    input.addEventListener('input', function () {
      var q = input.value.trim().toLowerCase();
      var visible = 0;
      cards.forEach(function (card) {
        var hay = (card.getAttribute('data-search') || '').toLowerCase();
        var match = q === '' || hay.indexOf(q) !== -1;
        card.hidden = !match;
        if (match) {
          visible += 1;
        }
      });
      if (noResults) {
        noResults.hidden = visible !== 0;
      }
    });
  }

  /* Table of contents from H2 headings (article pages only) */
  var toc = document.getElementById('toc');
  var body = document.getElementById('article-body');
  if (toc && body) {
    var headings = body.querySelectorAll('h2[id]');
    if (headings.length) {
      var list = document.createElement('ol');
      headings.forEach(function (h, i) {
        if (!h.id) {
          h.id = 'section-' + (i + 1);
        }
        var item = document.createElement('li');
        var link = document.createElement('a');
        link.href = '#' + h.id;
        link.textContent = h.textContent.replace(/^\d+[.)]?\s*/, '');
        item.appendChild(link);
        list.appendChild(item);
      });
      toc.appendChild(list);
    }
  }
})();

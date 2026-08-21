// blog-automation/src/article.js
'use strict';

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function wordCount(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

function readingMinutes(text, wpm = 200) {
  return Math.max(1, Math.round(wordCount(text) / wpm));
}

function formatDate(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' });
}

function blockToHtml(block) {
  if (block.type === 'ul') {
    return `<ul>\n${block.items.map((i) => `              <li>${escapeHtml(i)}</li>`).join('\n')}\n            </ul>`;
  }
  if (block.type === 'ol') {
    return `<ol>\n${block.items.map((i) => `              <li>${escapeHtml(i)}</li>`).join('\n')}\n            </ol>`;
  }
  if (block.type === 'quote') {
    return `            <blockquote>\n              <p>${escapeHtml(block.text)}</p>\n            </blockquote>`;
  }
  return `            <p>${escapeHtml(block.text)}</p>`;
}

function sectionHtml(section) {
  const id = slugify(section.heading) || 'section';
  const blocks = (section.blocks || []).map(blockToHtml).join('\n\n');
  return `            <h2 id="${id}">${escapeHtml(section.heading)}</h2>\n${blocks}`;
}

function heroHtml(post) {
  const img = post.image || { href: 'images/placeholder.svg', alt: post.badge, photographer: '', photographerUrl: '', credit: '' };
  const credit = img.photographer
    ? `\n              <figcaption>Photo by <a href="${escapeHtml(img.photographerUrl)}" rel="nofollow">${escapeHtml(img.photographer)}</a></figcaption>`
    : '';
  return `<figure class="hero-image">
              <img src="../${escapeHtml(img.href)}" alt="${escapeHtml(img.alt)}" width="1200" height="630">${credit}
            </figure>`;
}

function relatedHtml(post, cfg) {
  const r = post.related;
  if (!r) return '';
  return `
            <h2 id="see-also">See Also</h2>
            <p>If you enjoyed this ${escapeHtml(post.badge)} article, check out <a href="../${escapeHtml(r.slug)}/">${escapeHtml(r.title)}</a> for more useful reading.</p>`;
}

function renderArticleHtml(post, cfg) {
  const canonical = `${cfg.SITE_URL}${cfg.BLOG_PATH}${post.slug}/`;
  const ogImage = `${cfg.SITE_URL}${cfg.BLOG_PATH}${post.image ? post.image.href : 'images/placeholder.svg'}`;
  const keywordsMeta = (post.keywords || []).join(', ');
  const sections = post.sections.map(sectionHtml).join('\n\n');
  const related = relatedHtml(post, cfg);
  return `<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${escapeHtml(post.metaDescription)}">
  <meta name="keywords" content="${escapeHtml(keywordsMeta)}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <meta name="theme-color" content="#0a0d16">
  <meta name="application-name" content="Basketball Arena Blog">

  <title>${escapeHtml(post.title)} | Basketball Arena</title>

  <link rel="canonical" href="${canonical}">

  <!-- Favicon / Icons -->
  <link rel="icon" type="image/svg+xml" href="../../assets/favicon.svg">
  <link rel="icon" type="image/png" sizes="32x32" href="../../assets/favicon-32x32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="../../assets/favicon-16x16.png">

  <!-- Open Graph -->
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Basketball Arena">
  <meta property="og:title" content="${escapeHtml(post.title)}">
  <meta property="og:description" content="${escapeHtml(post.metaDescription)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${ogImage}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${escapeHtml(post.badge)}">
  <meta property="og:locale" content="en_US">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(post.title)}">
  <meta name="twitter:description" content="${escapeHtml(post.metaDescription)}">
  <meta name="twitter:image" content="${ogImage}">
  <meta name="twitter:image:alt" content="${escapeHtml(post.badge)}">

  <!-- Structured Data: Article -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "${escapeHtml(post.title).replace(/"/g, '\\"')}",
    "description": "${escapeHtml(post.metaDescription).replace(/"/g, '\\"')}",
    "image": ["${ogImage}"],
    "datePublished": "${post.datePublished}",
    "dateModified": "${post.dateModified}",
    "author": {
      "@type": "Person",
      "name": "Dhyey Satani"
    },
    "publisher": {
      "@type": "Organization",
      "name": "Basketball Arena",
      "logo": {
        "@type": "ImageObject",
        "url": "https://dhyey.bond/assets/og-image.png"
      }
    },
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": "${canonical}"
    }
  }
  </script>

  <!-- Structured Data: Breadcrumbs -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "${cfg.SITE_URL}/" },
      { "@type": "ListItem", "position": 2, "name": "Blog", "item": "${cfg.SITE_URL}${cfg.BLOG_PATH}" },
      { "@type": "ListItem", "position": 3, "name": "${escapeHtml(post.badge).replace(/"/g, '\\"')}", "item": "${canonical}" }
    ]
  }
  </script>

  <link rel="stylesheet" href="../css/blog.css">
</head>

<body>

  <header class="site-header">
    <div class="container header-inner">
      <a class="site-logo" href="/" aria-label="Basketball Arena - back to game">
        <span class="logo-t1">BASKETBALL</span>
        <span class="logo-t2">ARENA</span>
      </a>
      <nav class="site-nav" id="site-nav" aria-label="Main navigation">
        <ul>
          <li><a href="/">PLAY NOW</a></li>
          <li><a href="/blog/">BLOG</a></li>
          <li><a href="/">LEADERBOARD</a></li>
        </ul>
      </nav>
      <button type="button" class="nav-toggle" id="nav-toggle" aria-expanded="false" aria-controls="site-nav" aria-label="Toggle navigation menu">
        <span class="bar"></span>
        <span class="bar"></span>
        <span class="bar"></span>
        <span class="visually-hidden">Toggle navigation</span>
      </button>
    </div>
  </header>

  <main id="main">

    <nav class="breadcrumb" aria-label="Breadcrumb">
      <div class="container">
        <ol>
          <li><a href="/">Home</a></li>
          <li><a href="/blog/">Blog</a></li>
          <li aria-current="page">${escapeHtml(post.badge)}</li>
        </ol>
      </div>
    </nav>

    <article>

      <header class="article-header">
        <div class="container">
          <span class="badge">${escapeHtml(post.badge)}</span>
          <h1 class="article-title">${escapeHtml(post.title)}</h1>
          <p class="article-intro">${escapeHtml(post.intro)}</p>
          <div class="article-meta">
            <span>Category: ${escapeHtml(post.badge)}</span>
            <span class="dot" aria-hidden="true"></span>
            <span>Published: <time datetime="${post.datePublished}">${formatDate(post.datePublished)}</time></span>
            <span class="dot" aria-hidden="true"></span>
            <span>Updated: <time datetime="${post.dateModified}">${formatDate(post.dateModified)}</time></span>
            <span class="dot" aria-hidden="true"></span>
            <span>${post.readingMinutes} min read</span>
          </div>
        </div>
      </header>

      <div class="container">
        <div class="article-layout">

          <div id="article-body" class="article-body">

${heroHtml(post)}

${sections}
${related}

            <aside class="article-cta">
              <h2>READY TO TEST YOUR SKILLS?</h2>
              <p>${escapeHtml(post.ctaText)}</p>
              <a class="btn" href="/">PLAY NOW</a>
            </aside>

          </div>

          <aside class="toc" id="toc" aria-labelledby="toc-title">
            <h2 id="toc-title">TABLE OF CONTENTS</h2>
          </aside>

        </div>
      </div>

    </article>

  </main>

  <footer class="site-footer">
    <div class="container">
      <div class="footer-grid">
        <div class="footer-brand">
          <a class="site-logo" href="/" aria-label="Basketball Arena - back to game">
            <span class="logo-t1">BASKETBALL</span>
            <span class="logo-t2">ARENA</span>
          </a>
          <p>Free 3D arcade basketball game with realistic physics, combos, Fire Mode and global leaderboards. Play instantly in your browser - no download needed.</p>
        </div>
        <div class="footer-col">
          <h2>Site</h2>
          <ul>
            <li><a href="/">Play Now</a></li>
            <li><a href="/blog/">Blog</a></li>
          </ul>
        </div>
      </div>
      <p class="footer-copy">&copy; 2026 Dhyey Satani &middot; Basketball Arena</p>
    </div>
  </footer>

  <script src="../js/blog.js" defer></script>

</body>

</html>
`;
}

function renderCardHtml(post) {
  const search = [post.title, ...(post.keywords || []), post.badge].join(' ');
  const imageHref = post.imageHref || 'images/placeholder.svg';
  const alt = post.image ? post.image.alt : post.title;
  return `<article class="article-card" data-search="${escapeHtml(search)}">
            <a class="card-media" href="${post.slug}/">
              <img src="${escapeHtml(imageHref)}" alt="${escapeHtml(alt)}" loading="lazy" width="1200" height="630">
            </a>
            <div class="card-body">
              <span class="badge">${escapeHtml(post.badge)}</span>
              <h3 class="card-title"><a href="${post.slug}/">${escapeHtml(post.title)}</a></h3>
              <p class="card-excerpt">${escapeHtml(post.excerpt)}</p>
              <div class="card-meta">
                <time datetime="${post.datePublished}">${formatDate(post.datePublished)}</time>
                <span class="dot" aria-hidden="true"></span>
                <span>${post.readingMinutes} min read</span>
              </div>
              <a class="btn btn-sm" href="${post.slug}/">READ ARTICLE</a>
            </div>
          </article>`;
}

module.exports = {
  escapeHtml,
  slugify,
  readingMinutes,
  formatDate,
  blockToHtml,
  sectionHtml,
  renderArticleHtml,
  renderCardHtml,
};

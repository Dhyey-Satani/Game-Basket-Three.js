// blog-automation/src/images.js
'use strict';
const fs = require('node:fs');
const path = require('node:path');

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function imagesDir(cfg) {
  return path.join(cfg.BLOG_DIR, 'images');
}

function escapeXml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildSvgFallback({ slug, badge, cfg }) {
  const dir = imagesDir(cfg);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filename = `${slug}.svg`;
  const absPath = path.join(dir, filename);
  const label = String(badge || 'Blog').toUpperCase().slice(0, 24);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" role="img" aria-label="${escapeXml(badge)} article">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0d1322"/>
      <stop offset="1" stop-color="#0a0d16"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.42" r="0.62">
      <stop offset="0" stop-color="#ff7a18" stop-opacity="0.55"/>
      <stop offset="0.55" stop-color="#ff7a18" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#ff7a18" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <circle cx="600" cy="250" r="170" fill="none" stroke="#00e5ff" stroke-opacity="0.35" stroke-width="4"/>
  <circle cx="600" cy="250" r="110" fill="none" stroke="#ff7a18" stroke-opacity="0.55" stroke-width="6"/>
  <circle cx="600" cy="250" r="50" fill="none" stroke="#ffffff" stroke-opacity="0.25" stroke-width="3"/>
  <g fill="#00e5ff" opacity="0.8">
    <circle cx="180" cy="150" r="7"/><circle cx="990" cy="120" r="5"/><circle cx="1050" cy="470" r="8"/>
    <circle cx="150" cy="470" r="5"/><circle cx="900" cy="90" r="4"/><circle cx="240" cy="260" r="4"/>
  </g>
  <g fill="#ff7a18" opacity="0.7">
    <circle cx="760" cy="140" r="5"/><circle cx="60" cy="300" r="6"/><circle cx="1140" cy="300" r="6"/>
    <circle cx="340" cy="90" r="4"/><circle cx="980" cy="560" r="5"/>
  </g>
  <rect x="300" y="500" width="600" height="70" rx="35" fill="rgba(10,13,22,0.72)" stroke="rgba(255,255,255,0.16)"/>
  <text x="600" y="546" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="800" letter-spacing="5" fill="#ffffff">${label}</text>
</svg>
`;
  fs.writeFileSync(absPath, svg);
  return {
    href: `images/${filename}`,
    absPath,
    alt: `${badge || 'Blog'} article`,
    photographer: '',
    photographerUrl: '',
    credit: '',
    kind: 'svg',
  };
}

async function searchPexels(pexelsKey, query, cfg) {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=landscape&per_page=5`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), cfg.FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { Authorization: pexelsKey }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`Pexels HTTP ${res.status}`);
    const data = await res.json();
    return (data.photos || []).filter((p) => p && p.src && p.src.large2x);
  } finally {
    clearTimeout(t);
  }
}

async function downloadFile(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${url} -> HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buf);
}

async function findHeroImage({ query, slug, badge, cfg, pexelsKey }) {
  const dir = imagesDir(cfg);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (pexelsKey) {
    try {
      const photos = await searchPexels(pexelsKey, query, cfg);
      const photo = photos[0];
      if (photo) {
        const filename = `${slug}.jpg`;
        const absPath = path.join(dir, filename);
        await downloadFile(photo.src.large2x, absPath);
        return {
          href: `images/${filename}`,
          absPath,
          alt: String(photo.alt || '').slice(0, 120),
          photographer: photo.photographer || '',
          photographerUrl: photo.photographer_url || '',
          credit: photo.photographer ? `Photo by ${photo.photographer}` : '',
          kind: 'photo',
        };
      }
    } catch (err) {
      // fall through to SVG fallback
    }
  }
  return buildSvgFallback({ slug, badge, cfg });
}

module.exports = { slugify, buildSvgFallback, searchPexels, downloadFile, findHeroImage };

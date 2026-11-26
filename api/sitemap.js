// =====================================================================
//  منصة Weekend — خريطة الموقع التلقائية (Vercel Serverless Function) [البند 27]
//  /sitemap.xml  →  /api/sitemap   (عبر rewrite في vercel.json)
//  • بدون أي حزم خارجية: fetch المدمج في Node 18+
//  • تقرأ المنشآت النشطة فقط من public_facilities (نفس ما يراه أي زائر)
//  • عند تعذر الاتصال بـ Supabase: تُرجع خريطة صالحة فيها الصفحة الرئيسية فقط
// =====================================================================
'use strict';

const SITE_ORIGIN = (process.env.SITE_ORIGIN || 'https://weekend-three-xi.vercel.app').replace(/\/+$/, '');
const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://yeysruiowtjpwyicsukf.supabase.co').replace(/\/+$/, '');
// مفتاح عام (Publishable) — نفس المفتاح الموجود في صفحات الموقع، وليس مفتاحاً سرياً
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_--ZBMiy0SK8D-IQ4_Ab0hw_XneXxcCJ';
const PAGE_SIZE = 1000;      // الحد الافتراضي لعدد الصفوف في كل طلب لـ Supabase
const MAX_URLS = 45000;      // أقل من حد Google (50,000 رابط لكل خريطة)
const TIMEOUT_MS = 4000;

const CACHE_OK = 'public, s-maxage=3600, stale-while-revalidate=86400';
const CACHE_FALLBACK = 'public, s-maxage=300, stale-while-revalidate=600';

function xmlEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function urlEntry(loc, lastmod, changefreq, priority) {
  return '  <url>\n' +
    `    <loc>${xmlEscape(loc)}</loc>\n` +
    (lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : '') +
    `    <changefreq>${changefreq}</changefreq>\n` +
    `    <priority>${priority}</priority>\n` +
    '  </url>\n';
}

function buildXml(facilities) {
  let body = urlEntry(SITE_ORIGIN + '/', null, 'daily', '1.0');
  for (const f of facilities) {
    body += urlEntry(`${SITE_ORIGIN}/?venue=${f.id}`, f.lastmod, 'weekly', '0.8');
  }
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + body + '</urlset>\n';
}

async function fetchPage(offset) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const url = `${SUPABASE_URL}/rest/v1/public_facilities?select=id,created_at&order=id.asc&limit=${PAGE_SIZE}&offset=${offset}`;
    const res = await fetch(url, {
      headers: { apikey: SUPABASE_KEY, Accept: 'application/json' },
      signal: ctrl.signal
    });
    if (!res.ok) throw new Error('supabase http ' + res.status);
    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error('unexpected response');
    return rows;
  } finally {
    clearTimeout(timer);
  }
}

async function loadFacilities() {
  const out = [];
  const seen = new Set();
  for (let offset = 0; offset < MAX_URLS; offset += PAGE_SIZE) {
    const rows = await fetchPage(offset);
    for (const r of rows) {
      const id = Number(r && r.id);
      if (!Number.isSafeInteger(id) || id <= 0 || seen.has(id)) continue;
      seen.add(id);
      const d = r.created_at ? new Date(r.created_at) : null;
      out.push({ id, lastmod: d && !isNaN(d) ? d.toISOString().slice(0, 10) : null });
    }
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD');
    return res.end();
  }
  let xml, cache;
  try {
    xml = buildXml(await loadFacilities());
    cache = CACHE_OK;
  } catch (e) {
    xml = buildXml([]);           // Fallback آمن: الصفحة الرئيسية فقط
    cache = CACHE_FALLBACK;       // لا نُبقي النسخة الاحتياطية في الكاش لساعة كاملة
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', cache);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(req.method === 'HEAD' ? undefined : xml);
};

// للاختبار المحلي فقط
module.exports._internal = { buildXml, xmlEscape, loadFacilities };

// Probe: Shopify login via raw HTTP (no browser).
// Tests if credentials are valid independent of Cloudflare/hCaptcha browser detection.
//
// Usage: node tests/probe_shopify_api_login.js

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const https = require('https');
const { URL } = require('url');

const USERNAME = process.env.SHOPIFY_USERNAME;
const PASSWORD = process.env.SHOPIFY_PASSWORD;

function request(url, opts = {}, body = null) {
  return new Promise((resolve, reject) => {
    const u    = new URL(url);
    const data = body ? Buffer.from(body) : null;
    const req  = https.request({
      hostname: u.hostname,
      path:     u.pathname + u.search,
      method:   opts.method || 'GET',
      headers: {
        'User-Agent':      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection':      'keep-alive',
        ...(opts.headers || {}),
        ...(data ? { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': data.length } : {}),
      },
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: raw }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function extractField(html, name) {
  // Extract hidden input value by name
  const m = html.match(new RegExp(`name="${name}"[^>]*value="([^"]*)"`) )
         || html.match(new RegExp(`name='${name}'[^>]*value='([^']*)'`));
  return m ? m[1] : null;
}

function cookieJar(existing = '') {
  const jar = {};
  function add(setCookie) {
    if (!setCookie) return;
    const arr = Array.isArray(setCookie) ? setCookie : [setCookie];
    for (const c of arr) {
      const [kv] = c.split(';');
      const [k, v] = kv.split('=');
      if (k && v !== undefined) jar[k.trim()] = v.trim();
    }
  }
  function header() { return Object.entries(jar).map(([k,v]) => `${k}=${v}`).join('; '); }
  return { add, header, jar };
}

async function main() {
  console.log('=== Shopify API Login Probe ===');
  console.log('Username:', USERNAME, '\n');

  const jar = cookieJar();

  // ── Step 1: GET login page ─────────────────────────────────────────────────
  console.log('[1] GET accounts.shopify.com/login ...');
  const r1 = await request('https://accounts.shopify.com/login', {
    headers: { Cookie: jar.header() },
  });
  jar.add(r1.headers['set-cookie']);
  console.log('  status:', r1.status);
  console.log('  location:', r1.headers['location'] || '(none)');
  console.log('  cookies set:', Object.keys(jar.jar).join(', ') || '(none)');

  // Follow redirect if needed
  let loginUrl = 'https://accounts.shopify.com/login';
  let loginHtml = r1.body;
  if (r1.status >= 300 && r1.headers['location']) {
    const loc = r1.headers['location'].startsWith('http')
      ? r1.headers['location']
      : 'https://accounts.shopify.com' + r1.headers['location'];
    console.log('  Following redirect →', loc);
    const r1b = await request(loc, { headers: { Cookie: jar.header() } });
    jar.add(r1b.headers['set-cookie']);
    loginUrl = loc;
    loginHtml = r1b.body;
    console.log('  status after redirect:', r1b.status);
  }

  // Extract rid from URL
  const ridMatch = loginUrl.match(/rid=([^&]+)/);
  const rid = ridMatch ? ridMatch[1] : null;
  console.log('  rid:', rid);

  // Extract authenticity_token
  const csrfToken = extractField(loginHtml, 'authenticity_token');
  console.log('  authenticity_token:', csrfToken ? csrfToken.substring(0, 30) + '...' : 'NOT FOUND');

  if (!rid || !csrfToken) {
    console.log('\n  Cannot proceed without rid + CSRF token (Cloudflare likely blocking raw HTTP)');
    console.log('  Body snippet:\n', loginHtml.substring(0, 500));
    return;
  }

  // ── Step 2: POST email lookup ─────────────────────────────────────────────
  console.log('\n[2] POST lookup (email)...');
  const lookupUrl  = `https://accounts.shopify.com/lookup?rid=${rid}`;
  const lookupBody = new URLSearchParams({
    authenticity_token: csrfToken,
    'account[email]':   USERNAME,
    'account[uid]':     '',
  }).toString();

  const r2 = await request(lookupUrl, {
    method: 'POST',
    headers: {
      Cookie:   jar.header(),
      Referer:  loginUrl,
      Origin:   'https://accounts.shopify.com',
    },
  }, lookupBody);
  jar.add(r2.headers['set-cookie']);
  console.log('  status:', r2.status);
  console.log('  location:', r2.headers['location'] || '(none)');

  // ── Step 3: GET password page (follow redirect from lookup) ───────────────
  let passwordHtml = r2.body;
  let passwordUrl  = lookupUrl;
  if (r2.status >= 300 && r2.headers['location']) {
    const loc = r2.headers['location'].startsWith('http')
      ? r2.headers['location']
      : 'https://accounts.shopify.com' + r2.headers['location'];
    console.log('\n[3] GET password page →', loc);
    const r3 = await request(loc, { headers: { Cookie: jar.header() } });
    jar.add(r3.headers['set-cookie']);
    passwordUrl  = loc;
    passwordHtml = r3.body;
    console.log('  status:', r3.status);
    console.log('  location:', r3.headers['location'] || '(none)');
  }

  const csrfToken2       = extractField(passwordHtml, 'authenticity_token');
  const transferredInput = extractField(passwordHtml, 'transferred-input');
  const hcaptchaResp     = extractField(passwordHtml, 'h-captcha-response') || '';
  console.log('  CSRF token 2:', csrfToken2 ? csrfToken2.substring(0, 30) + '...' : 'NOT FOUND');
  console.log('  h-captcha-response:', hcaptchaResp ? 'PRESENT (len=' + hcaptchaResp.length + ')' : 'EMPTY (captcha required)');
  console.log('  transferred-input:', transferredInput !== null ? 'present' : 'not found');

  // ── Step 4: POST password ──────────────────────────────────────────────────
  console.log('\n[4] POST login (password)...');
  const loginPostUrl = `https://accounts.shopify.com/login?rid=${rid}`;
  const loginBody    = new URLSearchParams({
    authenticity_token:  csrfToken2 || csrfToken,
    'account[email]':    USERNAME,
    'account[password]': PASSWORD,
    'transferred-input': transferredInput || '',
    'h-captcha-response': hcaptchaResp,
  }).toString();

  const r4 = await request(loginPostUrl, {
    method: 'POST',
    headers: {
      Cookie:  jar.header(),
      Referer: passwordUrl,
      Origin:  'https://accounts.shopify.com',
    },
  }, loginBody);
  jar.add(r4.headers['set-cookie']);
  console.log('  status:', r4.status);
  console.log('  location:', r4.headers['location'] || '(none)');
  console.log('  cookies after login:', Object.keys(jar.jar).join(', '));

  // ── Result ─────────────────────────────────────────────────────────────────
  const loc = r4.headers['location'] || '';
  if (r4.status === 302 && !loc.includes('/login') && !loc.includes('/lookup')) {
    console.log('\n✓ LOGIN SUCCESS — redirect to:', loc);
  } else if (r4.status === 302 && loc.includes('/login')) {
    console.log('\n✗ LOGIN FAILED — redirected back to login (wrong password or captcha required)');
    console.log('  Body snippet:\n', r4.body.substring(0, 300));
  } else {
    console.log('\n? Unexpected result — status:', r4.status);
    console.log('  Body snippet:\n', r4.body.substring(0, 500));
  }
}

main().catch(console.error);

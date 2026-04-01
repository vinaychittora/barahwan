const MAX_BODY_SIZE = 8_000;
const ALLOWED_ORIGIN_PROTOCOLS = new Set(['https:']);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

function clean(value, max = 600) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

async function verifyTurnstile(token, ip, secret) {
  const form = new URLSearchParams();
  form.set('secret', secret);
  form.set('response', token);
  if (ip) form.set('remoteip', ip);

  const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: form
  });

  if (!result.ok) return false;
  const data = await result.json();
  return Boolean(data.success);
}

async function sendEmail(env, fields) {
  const recipient = env.CONTACT_EMAIL || 'hello@caneandcamera.com';
  const payload = {
    personalizations: [{ to: [{ email: recipient }] }],
    from: {
      email: env.FROM_EMAIL || 'barahwan-form@pages.dev',
      name: 'Barahwan Website'
    },
    reply_to: { email: fields.email, name: fields.name },
    subject: `New Barahwan form entry from ${fields.name}`,
    content: [
      {
        type: 'text/plain',
        value: [
          'New expression of interest',
          `Name: ${fields.name}`,
          `Email: ${fields.email}`,
          `Contribution type: ${fields.type}`,
          `Message: ${fields.message}`,
          `Submitted at: ${new Date().toISOString()}`
        ].join('\n')
      }
    ]
  };

  const response = await fetch('https://api.mailchannels.net/tx/v1/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });

  return response.ok;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const contentLength = Number(request.headers.get('content-length') || '0');
  if (contentLength > MAX_BODY_SIZE) {
    return jsonResponse(413, { ok: false, error: 'Payload too large.' });
  }

  const origin = request.headers.get('origin');
  if (!origin) {
    return jsonResponse(403, { ok: false, error: 'Missing origin.' });
  }

  const originUrl = new URL(origin);
  if (!ALLOWED_ORIGIN_PROTOCOLS.has(originUrl.protocol)) {
    return jsonResponse(403, { ok: false, error: 'Invalid origin protocol.' });
  }

  const referer = request.headers.get('referer') || '';
  if (!referer.startsWith(origin)) {
    return jsonResponse(403, { ok: false, error: 'Invalid referer.' });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { ok: false, error: 'Invalid JSON body.' });
  }

  if (clean(body.website)) {
    return jsonResponse(200, { ok: true });
  }

  const name = clean(body.name, 100);
  const email = clean(body.email, 180);
  const type = clean(body.type, 140);
  const message = clean(body.message, 1500);
  const token = clean(body.turnstileToken, 1200);

  if (!name || !email || !type || !message || !token) {
    return jsonResponse(400, { ok: false, error: 'Missing required fields.' });
  }

  if (!EMAIL_REGEX.test(email)) {
    return jsonResponse(400, { ok: false, error: 'Invalid email address.' });
  }

  const secret = env.TURNSTILE_SECRET;
  if (!secret) {
    return jsonResponse(500, { ok: false, error: 'Server not configured.' });
  }

  const ip = request.headers.get('CF-Connecting-IP');
  const isHuman = await verifyTurnstile(token, ip, secret);
  if (!isHuman) {
    return jsonResponse(403, { ok: false, error: 'Bot validation failed.' });
  }

  const sent = await sendEmail(env, { name, email, type, message });
  if (!sent) {
    return jsonResponse(502, { ok: false, error: 'Unable to deliver message.' });
  }

  return jsonResponse(200, { ok: true });
}

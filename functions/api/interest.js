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

function cleanToken(value, max = 4096) {
  return String(value || '').trim().slice(0, max);
}

async function verifyTurnstile(token, ip, secret) {
  try {
    const form = new URLSearchParams();
    form.set('secret', secret);
    form.set('response', token);
    if (ip) form.set('remoteip', ip);

    const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form
    });

    if (!result.ok) {
      return { success: false, reason: 'turnstile_api_unreachable' };
    }

    const data = await result.json();
    return {
      success: Boolean(data.success),
      reason: Array.isArray(data['error-codes']) ? data['error-codes'].join(',') : ''
    };
  } catch {
    return { success: false, reason: 'turnstile_request_failed' };
  }
}

async function sendEmail(env, fields) {
  const recipient = env.CONTACT_EMAIL || 'hello@caneandcamera.com';
  const sender = env.FROM_EMAIL || 'no-reply@barahwan.org';
  const payload = {
    personalizations: [{ to: [{ email: recipient }] }],
    from: {
      email: sender,
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

  try {
    const response = await fetch('https://api.mailchannels.net/tx/v1/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      return { ok: true, status: response.status, detail: '' };
    }

    const detail = (await response.text()).slice(0, 300);
    return { ok: false, status: response.status, detail };
  } catch {
    return { ok: false, status: 0, detail: 'mailchannels_request_failed' };
  }
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    const contentLength = Number(request.headers.get('content-length') || '0');
    if (contentLength > MAX_BODY_SIZE) {
      return jsonResponse(413, { ok: false, error: 'Payload too large.' });
    }

    const origin = request.headers.get('origin');
    if (!origin) {
      return jsonResponse(403, { ok: false, error: 'Missing origin.' });
    }

    let originUrl;
    try {
      originUrl = new URL(origin);
    } catch {
      return jsonResponse(403, { ok: false, error: 'Invalid origin.' });
    }
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
    const token = cleanToken(body.turnstileToken, 4096);

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
    const verification = await verifyTurnstile(token, ip, secret);
    if (!verification.success) {
      return jsonResponse(403, { ok: false, error: 'Bot validation failed.', reason: verification.reason || 'turnstile_failed' });
    }

    const delivery = await sendEmail(env, { name, email, type, message });
    if (!delivery.ok) {
      return jsonResponse(502, {
        ok: false,
        error: 'Unable to deliver message.',
        reason: delivery.detail || `mailchannels_${delivery.status}`
      });
    }

    return jsonResponse(200, { ok: true });
  } catch {
    return jsonResponse(500, { ok: false, error: 'Unexpected server error.', reason: 'interest_handler_unexpected' });
  }
}

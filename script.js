const sections = document.querySelectorAll('.section');
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
      }
    });
  },
  { threshold: 0.15 }
);
sections.forEach((section) => observer.observe(section));

const toggle = document.querySelector('.nav-toggle');
const nav = document.querySelector('nav');
if (toggle && nav) {
  toggle.addEventListener('click', () => nav.classList.toggle('open'));
  nav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => nav.classList.remove('open'));
  });
}

const form = document.querySelector('#interest');
const statusText = document.querySelector('.form-status');

if (form) {
  const sendDirectForm = async (payload) => {
    const endpoint = window.BARAHWAN_DIRECT_FORM_ENDPOINT;
    if (!endpoint) {
      return { attempted: false, ok: false, reason: 'direct_endpoint_missing' };
    }

    const formData = new FormData();
    formData.append('name', payload.name);
    formData.append('email', payload.email);
    formData.append('type', payload.type);
    formData.append('message', payload.message);
    formData.append('_subject', `Barahwan interest: ${payload.type}`);
    formData.append('_template', 'table');
    formData.append('_captcha', 'true');
    formData.append('_honey', payload.website || '');

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: formData
    });

    if (response.ok) {
      return { attempted: true, ok: true, reason: '' };
    }

    return { attempted: true, ok: false, reason: `direct_form_${response.status}` };
  };

  const sendInterest = async (payload) => {
    const directResult = await sendDirectForm(payload);
    if (directResult.ok) {
      return { ok: true };
    }

    statusText.textContent = 'Direct route failed, retrying through API endpoint...';
    const primaryResponse = await fetch('/api/interest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (primaryResponse.ok) {
      return { ok: true };
    }

    const failure = await readErrorResponse(primaryResponse);
    if (failure.reason === 'timeout-or-duplicate') {
      throw new Error('Verification expired. Please complete Turnstile again and resubmit.');
    }

    const fallbackUrl = window.BARAHWAN_API_FALLBACK;
    const shouldTryFallback = failure.reason === 'cloudflare_upstream_502' && fallbackUrl;
    if (!shouldTryFallback) {
      const directReason = directResult.attempted ? ` [direct:${directResult.reason}]` : '';
      const detail = failure.reason ? ` (${failure.reason})` : '';
      throw new Error((failure.error || 'Submission failed.') + detail + directReason);
    }

    statusText.textContent = 'Primary route failed, retrying through fallback endpoint...';
    const fallbackResponse = await fetch(fallbackUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (fallbackResponse.ok) {
      return { ok: true };
    }

    const fallbackFailure = await readErrorResponse(fallbackResponse);
    if (fallbackFailure.reason === 'timeout-or-duplicate') {
      throw new Error('Verification expired. Please complete Turnstile again and resubmit.');
    }
    const detail = fallbackFailure.reason ? ` (${fallbackFailure.reason})` : '';
    throw new Error((fallbackFailure.error || 'Submission failed.') + detail);
  };

  const readErrorResponse = async (response) => {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await response.json();
      return {
        error: data.error || 'Submission failed.',
        reason: data.reason || ''
      };
    }

    const text = await response.text();
    const cloudflare502 = text.includes('<title>') && text.includes('502');
    if (cloudflare502) {
      return {
        error: 'Submission route is returning an upstream 502 before JSON response.',
        reason: 'cloudflare_upstream_502'
      };
    }

    return {
      error: `Submission failed with status ${response.status}.`,
      reason: 'non_json_error_response'
    };
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;

    const turnstileToken =
      window.turnstile && window.turnstile.getResponse ? window.turnstile.getResponse() : '';

    if (!turnstileToken) {
      statusText.textContent = 'Please complete bot verification and try again.';
      submit.disabled = false;
      return;
    }

    statusText.textContent = 'Sending...';

    const payload = {
      name: form.name.value,
      email: form.email.value,
      type: form.type.value,
      message: form.message.value,
      website: form.website.value,
      turnstileToken
    };

    try {
      await sendInterest(payload);

      statusText.textContent = 'Proposal received. We will reach out shortly.';
      submit.textContent = 'Sent';
      form.reset();
      if (window.turnstile && window.turnstile.reset) {
        window.turnstile.reset();
      }
    } catch (error) {
      statusText.textContent = error.message || 'Something went wrong. Please try again.';
      submit.disabled = false;
      submit.textContent = 'Send proposal';
      if (window.turnstile && window.turnstile.reset) {
        window.turnstile.reset();
      }
    }
  });
}

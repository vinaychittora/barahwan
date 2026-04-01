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
      const response = await fetch('/api/interest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const failure = await readErrorResponse(response);
        if (failure.reason === 'timeout-or-duplicate') {
          throw new Error('Verification expired. Please complete Turnstile again and resubmit.');
        }
        const detail = failure.reason ? ` (${failure.reason})` : '';
        throw new Error((failure.error || 'Submission failed.') + detail);
      }

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

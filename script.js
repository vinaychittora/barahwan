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
        const data = await response.json();
        if (data.reason === 'timeout-or-duplicate') {
          throw new Error('Verification expired. Please complete Turnstile again and resubmit.');
        }
        const detail = data.reason ? ` (${data.reason})` : '';
        throw new Error((data.error || 'Submission failed.') + detail);
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

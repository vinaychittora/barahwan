# The Living Field — Barahwan

## An idea project in progress

**The Living Field — Barahwan** is a long-term concept project I have been developing over many years.

Barahwan refers to a landscape identity shaped by twelve surrounding villages in Rajasthan. This project is an evolving attempt to imagine and build a grounded model for low-impact living, ecological learning, habitat-sensitive stays, and collaborative rural stewardship.

This is **not** a resort pitch and **not** a luxury eco-tourism brand. It is a practical, field-led vision for how people can stay, learn, work, and contribute while reducing resource pressure and respecting land realities.

---

## Project intent

The website in this repository presents the concept clearly so people can understand it and decide whether to participate through:

- land collaboration
- design and technical support
- ecological and hydrology expertise
- workshops and educational programs
- volunteering and skill exchange
- aligned funding and long-term backing

The core idea is to remain:

- **financially modest**
- **operationally resilient**
- **ecologically responsible**
- **socially dignified**

---

## Status

This is an **idea-stage communication website** for the Barahwan concept.

It is being refined continuously as the project grows, partnerships evolve, and implementation pathways become clearer.

---

## Local preview

This is a static site.

Open `index.html` directly in a browser, or run a local server:

```bash
python -m http.server 8765
```

Then visit:

`http://localhost:8765`

---

## Repository contents

- `index.html` — single-page concept narrative and diagrams
- `styles.css` — visual system and responsive styling
- `script.js` — lightweight interactions and animations

---

## Note

If you are reading this, thank you for your interest.

Barahwan is a serious idea project I care about deeply and have been shaping for a long time. Every collaboration that is ethical, practical, and field-honest is welcome.

---

## Form delivery and abuse protection

The interest form now posts to a Cloudflare Pages Function endpoint:

- `POST /api/interest`

It sends entries to email using MailChannels and includes abuse controls:

- Cloudflare Turnstile validation
- honeypot field trap (`website`)
- strict field validation and payload-size check
- origin + referer checks

### Required Cloudflare Pages environment variables

Set these in **Cloudflare Pages → Settings → Environment variables**:

- `TURNSTILE_SECRET` — your Turnstile secret key
- `CONTACT_EMAIL` — destination inbox (example: `hello@caneandcamera.com`)
- `FROM_EMAIL` — sender identity for MailChannels (example: `barahwan-form@pages.dev`)
- `RESEND_API_KEY` *(optional, recommended fallback)* — if present, the API sends mail through Resend instead of MailChannels

### Turnstile site key in the frontend

`index.html` should use your production Turnstile site key in the form widget.
Current value is set for `barahwan.org`; update it if your widget changes.

### Optional custom-domain fallback for API route

`index.html` also exposes `window.BARAHWAN_API_FALLBACK` (defaults to `https://barahwan.pages.dev/api/interest`).
If the custom domain route returns an upstream HTML 502, frontend retries once against this fallback URL.

### Common failure reason

If `/api/interest` returns bot-validation errors, confirm that:

- your frontend Turnstile **site key** and backend `TURNSTILE_SECRET` are from the same Turnstile widget
- the domain (`barahwan.org`) is allowed in Turnstile settings
- you are not mixing test keys with production keys

### Why you may see `502` first, then `403 timeout-or-duplicate`

This sequence usually means:

1. Turnstile token was valid and consumed on first submit.
2. Email delivery failed upstream (MailChannels) causing `502`.
3. Retrying with the same token triggers Turnstile duplicate rejection (`403 timeout-or-duplicate`).

The frontend now resets Turnstile after failed submissions so users can solve a fresh challenge before retrying.

### If you see an HTML 502 page instead of JSON

If the browser/devtools shows `Unexpected token '<'`, `/api/interest` returned HTML (usually Cloudflare 502) rather than JSON.

The frontend now detects this and reports `cloudflare_upstream_502` so you can distinguish routing/upstream failures from normal validation errors.

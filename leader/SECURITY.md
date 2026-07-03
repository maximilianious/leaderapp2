# Security Policy

## Design principles

Leader is deliberately built so that the most damaging classes of web vulnerability have no surface to attack:

**No third-party code, no network calls.** Every byte of HTML, CSS, and JS is first-party and served from the same origin. There are no CDNs, fonts, analytics, trackers, or API calls — so there is no supply chain to compromise and nothing to exfiltrate to.

**Strict Content Security Policy.** Served as an HTTP header (`netlify.toml`) and mirrored as a `<meta>` tag for defense-in-depth:
- `script-src 'self'` — no inline or remote script can execute, which neutralizes reflected/stored XSS payloads
- `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`, `frame-ancestors 'none'`
- `connect-src 'self'` — even if code were injected, it could not phone home

**No dynamic HTML from strings.** All UI is built with `createElement` / `textContent` / `replaceChildren`. The codebase contains no `innerHTML`, `eval`, `Function`, or `document.write`.

**Media never leaves the device.** Captures live as in-memory `blob:` objects; nothing is persisted (no localStorage/IndexedDB of media), uploaded, or logged. Closing the tab destroys the session roll. Object URLs are revoked on delete.

**Least-privilege permissions.** `Permissions-Policy` grants only camera, microphone, motion, and fullscreen to the app's own origin and explicitly denies geolocation, payment, USB, MIDI, display-capture, and ad-topics APIs. The microphone is only requested when video recording starts, and iOS motion access is only requested when the user enables the level.

**Hardened transport and embedding.** HSTS with preload, `X-Frame-Options: DENY` + `frame-ancestors 'none'` (no clickjacking), COOP/CORP same-origin, `nosniff`, `Referrer-Policy: no-referrer`.

**Scoped service worker.** Caches only same-origin GET responses of the app shell; it never intercepts cross-origin requests or non-GET methods.

## Reporting a vulnerability

Please open a private security advisory on the GitHub repository (Security → Advisories → Report a vulnerability) rather than a public issue. Include reproduction steps and the browser/OS affected. You should receive a response within 7 days.

## Scope notes for self-hosters

- The HTTP headers in `netlify.toml` are part of the security posture. If you deploy elsewhere (GitHub Pages, S3, nginx), replicate them — the meta CSP covers most, but `frame-ancestors`, HSTS, COOP/CORP only work as headers.
- Serve over HTTPS. Browsers refuse camera access on insecure origins anyway.

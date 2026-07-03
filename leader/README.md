# LEADER.

A precision camera app for the web. Pure HTML/CSS/JS — no build step, no dependencies, no backend. Everything you shoot stays on your device.

Built for iPhone Safari first (safe-area aware, `playsinline`, pinch zoom, Share Sheet export, Add-to-Home-Screen PWA), works in any modern browser.

## Features

**Shooting**
- Photo and video modes, front/back camera switching
- Tap to focus with drag-to-adjust exposure (iOS-style sun slider)
- Pinch-to-zoom (uses native optical/sensor zoom when the device exposes it, digital otherwise)
- Self-timer (3s / 10s), torch on supported rear cameras, screen-flash for selfies
- Aspect ratios: 4:3, 16:9, 1:1, full-frame
- Rule-of-thirds grid, motion-based level indicator, live luminance histogram
- Shutter sound + haptics, spacebar shutter on desktop

**Filters**
- 12 digital filters: Original, Vivid, Vivid Warm/Cool, Dramatic, Dramatic Warm, Mono, Silver, Noir, Sepia, Fade, Chrome
- 12 pro film emulations: P·400, V·50, TX·400, C·800T, K·64, F·Pro, Bleach, X·Pro, Lomo, Cine Teal & Orange, Golden, IR·Mono — with baked-in grain, vignette, and color casts
- Live filter previews rendered from your actual camera feed

**Manual controls (the drum)**
- Exposure, contrast, saturation, temperature, tint, vignette, grain, zoom — each on a machined ruler dial
- All adjustments stack on top of the selected filter and bake into captures

**Output**
- Filters and adjustments are rendered into saved photos (JPEG, quality selectable)
- Video records with filters baked in on browsers that support canvas filters (falls back to the clean feed elsewhere), MP4 on Safari
- Session roll gallery: preview, save, delete, share via the native iOS Share Sheet, or save all

## Deploy (GitHub → Netlify)

The camera API requires HTTPS, which Netlify provides automatically.

1. **Create a GitHub repo** and push these files (they must sit at the repo root):
   ```bash
   git init
   git add .
   git commit -m "Leader camera app"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/leader.git
   git push -u origin main
   ```
2. **Netlify** → *Add new site* → *Import an existing project* → pick the repo.
   - Build command: *(leave empty)*
   - Publish directory: `.`
3. Deploy. Open the `https://….netlify.app` URL on your iPhone.

No-git alternative: drag this folder onto https://app.netlify.com/drop.

## iPhone tips

- On first launch tap **Open Camera** and allow camera access (Safari will prompt).
- **Add to Home Screen** (Share → Add to Home Screen) for a full-screen, app-like experience with the Leader icon.
- The level indicator asks for motion access the first time you enable it in Settings — that's an iOS requirement.
- Saved photos land in Files/Downloads; use **Share** in the viewer to send them straight to your Photos library.

## Security

Built for open-source scrutiny — see [SECURITY.md](SECURITY.md) for the full policy. Highlights:

- **Zero third-party code or requests** — no CDNs, fonts, analytics, or APIs; nothing to supply-chain-attack, nowhere to exfiltrate
- **Strict CSP** served as an HTTP header (`netlify.toml`) and mirrored as a meta tag: `script-src 'self'`, `connect-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`
- **No dynamic HTML from strings** — the codebase contains no `innerHTML`/`eval`; all UI is built with DOM APIs
- **Least-privilege Permissions-Policy** — camera/mic/motion for self only; geolocation, payment, USB, etc. explicitly denied
- **HSTS, COOP/CORP, nosniff, no-referrer, clickjacking denial**; the service worker caches same-origin GETs only
- MIT licensed (`LICENSE`)

## Performance

- No render-blocking external resources — system fonts (SF Pro / SF Mono on iPhone), one deferred script
- The render loop fully stops when the tab is hidden or before the camera starts
- Filter thumbnails repaint only when actually on screen (IntersectionObserver) and only every 600 ms
- Histogram sampling is gated behind its toggle and throttled to 4 Hz on an 80×60 downsample with a reusable typed-array
- Recording pipeline caps at 1280 px with a desynchronized canvas; chunk buffers are released after each clip
- Grain/vignette are single pre-built tiles and gradients, reused everywhere; object URLs are revoked on delete

## Privacy

No analytics, no uploads, no storage beyond your session. The camera stream is processed entirely in your browser.

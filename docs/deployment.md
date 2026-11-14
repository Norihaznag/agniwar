# Deployment

This is a deployment starting point, not a production-readiness certification. Complete physical-device, load, security, storage, and multi-GB tests before launch. Configure a real hostname, operator contact, legal disclosures, and monitoring.

## Signaling service

Run Node 20+ behind a TLS reverse proxy that supports WebSocket upgrades and `/signal`. Set:

- `PORT` (default `8787`).
- `ALLOWED_ORIGINS` to exact comma-separated frontend origins, e.g. `https://your-domain.example` (no trailing slash). The production default permits local Vite on localhost/127.0.0.1 port 5173. Local development (`--lan`) also permits HTTP on port 5173 for this server machine’s own private IPv4 addresses; another hostname or port requires an exact configured origin.
- `MAX_CONNECTIONS` (default 1000); choose a lower limit based on tested resources.
- `TRUST_PROXY=true` **only** if the trusted ingress strips incoming X-Forwarded-For and replaces it with the actual client IP, and the Node port cannot be reached directly. Otherwise clients can spoof discovery scopes and the rate-limit key. If false behind a proxy, all users may be grouped under the proxy IP. Account for platform-specific forwarding chain behavior.

```sh
npm ci
npm run build
PORT=8787 ALLOWED_ORIGINS=https://your-domain.example npm --workspace server start
```

Terminate TLS at the proxy and use `wss://` publicly. `/health` provides a simple health check. Configure proxy idle timeouts to allow 30-second pings; enforce additional ingress connection and rate limits. Do not log full signaling messages. A single instance is required for one shared presence map. Public deployment runs without `--lan`; do not expose the local subnet-discovery development mode to the public internet.

## Cloudflare Pages frontend

Set build command `npm ci && npm run build` and output directory `apps/web/dist`. Build-time variables:

- `VITE_SIGNAL_URL=wss://signal.your-domain.example/signal` (required for public deployment).
- `PUBLIC_SITE_URL=https://your-domain.example` (an HTTPS origin with no path): generates canonicals, sitemap, and Article structured data. The development build deliberately omits canonicals and has an empty sitemap rather than inventing a public URL.
- `PUBLIC_CONTACT_EMAIL=help@your-domain.example`: publishes the real support address on the contact page.
- Optional `VITE_TURN_URL`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL`: configure a TURN service. **All Vite variables are public in the browser bundle. Do not embed permanent privileged credentials.** Time-limited TURN credentials need an additional trusted credential-issuance design not provided here.

The `_redirects` file serves the app at `/transfer`; static guide and legal pages are generated into directory indexes. Review CSP, security headers, cache behavior and routes for the actual host. The service worker caches the app shell/assets; its presence does not permit offline discovery or transfers. Test installability on target browsers, especially iOS.

Do not add AdSense to `/transfer`. This package contains no ad code; implement and review any future ads only on suitable educational pages and against current Google policies. Approval is not guaranteed.

## Physical-device test plan

Test Android→Windows, Windows→Android, Android→Android, iPhone→Windows and Windows→Windows. Measure discovery/connection time, speed, CPU and memory on real devices, then test 10 MB, 100 MB, 1 GB and several GB where supported; multiple files, videos and APKs; weak/isolated Wi-Fi; denial; cancellation; disconnects; refresh; insufficient storage; SHA-256 integrity; direct and TURN paths. Record browser/OS versions and actual results. These tests have **not** been performed in this environment.

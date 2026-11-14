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

## Frontend (Vercel or Cloudflare Pages)

On Vercel, keep the repository root as the project root, use `npm run build` and output `apps/web/dist`. Keep the existing production `VITE_SIGNAL_URL`; set `PUBLIC_SITE_URL=https://www.agniwar.com` for canonical metadata. The build generates the content pages before Vite builds the app. Confirm the deployment and routes after publishing.

Set build command `npm ci && npm run build` and output directory `apps/web/dist`. Build-time variables:

- `VITE_SIGNAL_URL=wss://signal.your-domain.example/signal` (required for public deployment).
- `PUBLIC_SITE_URL=https://your-domain.example` (an HTTPS origin with no path): generates canonicals, sitemap, and Article structured data. The static site defaults to https://www.agniwar.com; set this variable for a different deployment and to add the transfer page canonical.
- `PUBLIC_CONTACT_EMAIL=support@agniwar.com`: publishes the support address; this is the default unless overridden.
- Optional `VITE_TURN_URL`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL`: configure a TURN service. **All Vite variables are public in the browser bundle. Do not embed permanent privileged credentials.** Time-limited TURN credentials need an additional trusted credential-issuance design not provided here.

The `_redirects` file serves the app at `/transfer`; static guide and legal pages are generated into directory indexes. Review CSP, security headers, cache behavior and routes for the actual host. The service worker caches the app shell/assets; its presence does not permit offline discovery or transfers. Test installability on target browsers, especially iOS.

## AdSense

The public publisher ID is configured in the ownership verification meta tag and `apps/web/public/ads.txt`. Deploy first, select **Meta tag** in AdSense and request review. Never place ad code on `/transfer`. Actual approval is Google's decision.

By default no advertising script loads. Before enabling ads, configure and test a Google-certified consent management platform appropriate to your visitors, complete and independently review the operator's privacy, retention, contact and legal disclosures, and check Google publisher policies. Disclose any other ad vendors enabled in the account. Set `PUBLIC_CONTACT_EMAIL` and `PUBLIC_SITE_URL` to the real public contact and site origin at build time. After approval and those checks, setting both `PUBLIC_ENABLE_ADS=true` and `PUBLIC_ADSENSE_SLOT` to your genuine numeric ad-unit ID adds an optional responsive placement only to individual guide articles, and adds an advertising disclosure to the privacy page. Rebuild and redeploy. Confirm ad placements and disable any formats that could interfere with navigation; do not enable ads elsewhere. This flag does not itself configure or supply a consent mechanism.

## Physical-device test plan

Test Android→Windows, Windows→Android, Android→Android, iPhone→Windows and Windows→Windows. Measure discovery/connection time, speed, CPU and memory on real devices, then test 10 MB, 100 MB, 1 GB and several GB where supported; multiple files, videos and APKs; weak/isolated Wi-Fi; denial; cancellation; disconnects; refresh; insufficient storage; SHA-256 integrity; direct and TURN paths. Record browser/OS versions and actual results. These tests have **not** been performed in this environment.

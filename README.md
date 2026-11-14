# AGNIWAR

**Send. Connect. Done.** A lightweight browser-to-browser file transfer prototype. The signaling service coordinates presence and WebRTC; file data is sent over a data channel, not to that server. See [architecture](docs/architecture.md), [deployment](docs/deployment.md), and [privacy](docs/privacy.md), and [AdSense preparation](docs/adsense.md).

## Status: working prototype, not production-ready

The implementation has been exercised with two isolated headless Chromium browser contexts on one host, including automatic discovery and transfers via localhost and the host’s LAN address, and a 100 MiB + 13 byte file and a second file in one transfer, SHA-256 verification, and receiver rejection. That is not a physical-device test, and it does not establish Android, iOS, Safari, Firefox, different-network or production readiness. Large-file limits, performance, memory use, accessibility, relay behavior and security need real-world testing. There is no resume, persistent transfer metadata, adaptive chunk sizing, connection restart, multi-gigabyte qualification, or configured AdSense integration. Read the limitations below before deploying.

## Requirements

Node.js 20 or later and npm. HTTPS/WSS are required for real remote devices; localhost HTTP is for local development only. A publicly reachable WSS signaling host is required for a public deployment. Files do not use that host as a storage backend.

## Install and run

```sh
npm ci
# Terminal 1
npm run dev:server
# Terminal 2
npm run dev:web
```

Open http://localhost:5173/transfer in two browser windows. This verifies two local browser contexts, **not** two physical devices. Localhost addresses refer to each device itself; to use actual devices, set up HTTPS/WSS and an origin-accessible signaling service as described in `docs/deployment.md`.

## Build and test

```sh
npm run build
npm test
# With the two development servers running; install a Chromium binary if needed
# (npx playwright install chromium), or set CHROMIUM_PATH to an existing binary:
npm run test:e2e
npm run test:storage
# 129 MiB HTTP-LAN test including SHA-256, refresh and removal:
npm run test:lan-large
# Optional local throughput sample, not a real-device benchmark:
npm run bench
# LAN integration test, with LAN_TEST_IP set to this computer’s private IPv4:
# LAN_TEST_IP=192.168.1.76 npm run test:lan
# Optional larger local test (allocates test data in the test process):
TEST_MIB=100 npm run test:e2e
npm run test:storage
# 129 MiB HTTP-LAN test including SHA-256, refresh and removal:
npm run test:lan-large
# Optional local throughput sample, not a real-device benchmark:
npm run bench
```

The production frontend is `apps/web/dist`. The compiled backend starts with `npm --workspace server start` after a build. `npm ci` uses the committed lockfile. The frontend's configured URL is embedded at build time; changing it requires rebuilding.

## Connect a phone and computer on the local network

Start the signaling server on the computer using `npm run dev:server`, and run `npm run dev:web` separately. The development server groups connections on each private IPv4 subnet directly attached to the computer and includes the computer's localhost connection. In LAN mode it automatically permits Vite on port 5173 using the server host's own private IPv4 addresses, in addition to the configured `ALLOWED_ORIGINS`. Both devices must connect to this same computer and signaling server. For another port or hostname, configure exact allowed origins as described in deployment.

On the PC open `http://localhost:5173/transfer`; on the phone open `http://192.168.1.76:5173/transfer`. Both must say Connected. Check `http://192.168.1.76:8787/health` on the phone if they do not. Windows Firewall must allow the signaling port 8787 on the private network. Once detected, select the recipient, choose files, and send. The receiver approves. When available, the browser asks the receiver to select a destination folder; otherwise AGNIWAR requests a download automatically after verification. Browsers may block or prompt for downloads. No QR or code is used.

The grouping uses the server host’s actual IPv4 subnet mask, not proof that devices share Wi-Fi. If there are multiple interfaces (including VPN or virtual adapters), localhost can see devices on each matching private subnet. Other people on those networks can appear: verify the recipient, and use only a trusted network. Guest/client isolation, IPv6-only networks, VPNs, proxy setups, firewalls and differing subnets can still prevent discovery or WebRTC. The app cannot scan networks. HTTP LAN development is insecure for signaling and is not a production configuration; browsers may restrict APIs; the IndexedDB segment fallback is used when private file storage is unavailable. Use HTTPS/WSS for deployment.

## Important limitations

- Local dev uses directly attached private IPv4 subnets for discovery; the normal production server groups by the exact public IP seen by signaling. Neither proves devices share a Wi-Fi network. Shared NAT can expose names to unrelated users, and VPNs, IPv6 and network segmentation may prevent discovery. There is no manual pairing fallback. A TURN relay, if configured, can carry encrypted transfer traffic; direct connectivity is not guaranteed.
- Explicit receiver approval is required; file metadata is sent over the data channel before approval. Signaling is not independently authenticated end-to-end against a malicious signaling service. High-sensitivity exchanges require additional recipient verification and trusted infrastructure.
- Chunk size is selected from the negotiated DataChannel message limit (up to 256 KiB including framing); a bounded 4 MiB in-flight window, cumulative acknowledgments, event-driven backpressure, 1 MiB I/O batches and worker-based incremental hashing reduce overhead. Hashing can overlap with network or storage operations. This does not dynamically benchmark chunk sizes or guarantee maximum speed. Incoming packets have not had a comprehensive adversarial memory/CPU audit.
- A supported secure-context browser can ask for a destination folder on acceptance and write verified files there. A random suffix avoids overwriting existing names. Otherwise the receiver uses OPFS when available or stores 1 MiB Blob segments in IndexedDB, including on plain HTTP LAN. The previous 128 MiB application cap has been removed, but browser quotas, disk space and implementation limits still apply. Joining or downloading a large file may require extra browser/OS memory or storage and can fail; no unlimited size guarantee is made. It asks the browser to download automatically; browser settings can block downloads or require confirmation. Use Received files to download again. Copies in browser storage may be evicted or deleted if site data is cleared. Folder picker behavior and physical devices must be tested for the deployment: an automated test substituting an OPFS directory for the real picker crashed the headless Chromium process here, so that path is unverified (run `TEST_DIRECTORY=1 npm run test:storage` to retry).
- Transfers must restart after interruption or page refresh; WebRTC reconnects are not explicitly resumed. Leaving a page, backgrounding a phone, browser crashes or low storage can interrupt work. An interrupted page can leave temporary OPFS files; clear the site's browser storage to remove them.
- A single transfer per page at a time. Completed files remain in Received files until removed or browser storage is cleared or evicted; native folder copies are not deleted when removing history. If history persistence fails, the UI warns the user to download before closing the tab. If IndexedDB cannot open, receiving is rejected rather than pretending files are retained. Offline PWA startup cannot perform discovery or transfers without the signaling service.
- The public site, terms, privacy disclosures and contact information must be reviewed and configured for the real operator. No ad code is supplied or implied. Ad approval is not guaranteed.

## Throughput

Transfer speed depends on both devices, Wi-Fi, browser WebRTC, SHA-256 hashing, storage and any relay. A 1 GB/s target is not guaranteed: it requires over 8 Gbit/s of usable network capacity before overhead, plus sufficiently fast hardware. Benchmark on the actual devices and keep them awake. Large-file streaming to browser storage does not guarantee that the browser download implementation uses constant memory.

## Local large-file test note

In this environment, a 129 MiB transfer over an HTTP LAN origin completed, survived refresh, re-downloaded with matching SHA-256, and was removed cleanly. A 1 GiB HTTP-LAN test failed because the headless browser exceeded its storage quota; it is not a verified success. Quotas differ on real devices. Test target browsers, free space, and the secure-context OPFS/folder paths before relying on large transfers.

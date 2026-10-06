# Dashboard native synthetic preview (isolated fixture)

`NativeVisionPreview` is a reusable client component in
`src/components/vision/native-vision-preview.tsx`. `/vision` mounts it separately
from the existing illustrative SVG/model controls. Its preview grant is independent
of status/edit grants, so an unavailable model/status pipeline does not grant or
block media access. Existing demo SVG behavior is unchanged.

On mount or explicit manual recheck, the client reads the same-origin
`GET /api/vision/v1/access`. Media start is enabled only when BOTH
`capabilities.preview === true` and top-level `native_preview_available === true`.
An absent flag is false. Production/default/demo do not activate a peer. This flag
is an availability hint, not authorization: the BFF revalidates every operation.

The browser sends only session cookies and a Dashboard-owned opaque lease:

| Endpoint | Browser request |
| --- | --- |
| POST `/api/vision/v1/media/offer` | `{type: "offer", sdp}` |
| POST `/api/vision/v1/media/heartbeat` | `{session_id: lease, visible: true}` |
| POST `/api/vision/v1/media/stop` | `{session_id: lease}` |

There is no native URL, camera account, Bearer token or device identifier in the
component. It uses same-origin requests, no redirects, no automatic retry, a
6-second request timeout, and one peer at a time. Stop uses bounded keepalive so
an unmount/pagehide can notify the BFF. Native/BFF TTL remains the fallback when a
stop or cancelled in-flight offer cannot be acknowledged.

The video is a real received MediaStream from the native synthetic source. An
internal 192×24 canvas reads the received frame's binary marker at native 640×360
geometry; it never generates or sends media. Only a strictly increasing native
pixel ID refreshes the 1.5-second freshness clock. A repeated frozen image cannot
become fresh merely because its RTP timestamp or callback counter advances.
Bboxes, timestamp and ID are burned into the same native frame. There is no
asynchronous browser bbox overlay or completed ROI editor.

Cancellation, stop, TTL, hidden/pagehide, component unmount, expired-session events
and cross-tab logout abort requests, close the peer, stop tracks and detach the
video. `/vision` keys the component by the existing user identity so a user change
cannot reuse the prior component's stream. Authorization failure clears
availability; a new connection requires an explicit action.

## Actual-component test entry

`scripts/vision-native-fixture.tsx` mounts the same component with its default real
same-origin transport. Bundle it with the existing esbuild dependency, including
the emitted CSS companion. It does not mock fetch, signaling or media. The root
integration harness serves the bundle behind real BFF route handlers with an
isolated fake authenticated session and native loopback fixture. It must launch
Chromium/native processes under the reviewed child-only localhost sandbox and
software-video flags used by the native WebRTC spike.

Stable UI selectors are the `原生合成預覽` region, `開始原生合成串流`,
`取消連線`, `停止原生預覽`, `重新檢查原生預覽`, and the video label
`原生合成串流影像`. The region exposes only bounded diagnostic attributes:
`data-native-frame-id`, `data-native-advances`, `data-native-fresh`, and
`data-native-active`. They contain no SDP, address, token, lease or identity.

`tests/vision-native-client.test.ts` checks pixel decoding, stale repeated IDs,
preview-only availability, BFF-only requests, abort/timeout behavior and malformed
responses. Browser/native integration evidence is produced separately by the
root harness. Mobile viewport/touch emulation is not real iPhone/Safari validation;
no real camera, YOLO or production connection is enabled by this work.

## Reproduce locally

Use the existing isolated Python environment containing aiortc/PyAV and the cached
Chromium headless shell. From this Dashboard checkout:

```sh
NODE_BINARY=/absolute/path/to/node \
PLAYWRIGHT_BROWSERS_PATH=/absolute/path/to/cached/browsers \
FLOOR_CHECKOUT=/absolute/path/to/isolated/floor-presence \
/absolute/path/to/phase3-venv/bin/python3 scripts/test-native-dashboard.py
```

The bounded runner creates temporary fake sessions and ephemeral loopback ports,
then closes its own processes. Evidence is written under
`artifacts/native-dashboard/`; no SDP, credential or private image is exported.
The original runner exercises React and route handlers in one Node HTTP harness.
`test-native-next.py` instead starts the actual built Next application and proxy;
use the same environment and Python command above with that filename after
`npm run build -- --webpack`. It checks production runtime rejection first, then
runs the same production build in explicitly isolated test runtime for streaming.
This does not enable production media or establish multi-worker support. The global lease
store is process-local; production activation is deliberately unavailable.

Existing Dashboard JWT logout removes the browser cookie, but does not revoke
already issued JWTs server-side. Client logout events stop the preview; grant
checks, original JWT expiry, native idle timeout and bounded TTL are backstops.
This does not claim immediate global session revocation.

For the existing application UI regressions use a webpack build followed by
Playwright's configured `next start` on loopback. Do not start `next dev` in this
nested isolated checkout; see the earlier integration checkpoint. Real iPhone
backgrounding, Safari/WebKit, external relay and camera/model integration remain
unverified and disabled.


## Deployment constraints and proposed next boundary

The process-global lease is shared only within one Node process. Multiple workers,
serverless invocations, replicas and rolling replacements cannot use it as a
shared ownership authority. A process restart loses lease IDs and quarantine;
the native sender's single-viewer guard and finite TTL remain the safety boundary,
but cannot restore the original caller's lease. Sticky routing alone does not
solve crash/restart or revocation. Do not activate this fixture in production.

A future remote design should put the authoritative media lease, ownership,
expiry, cancellation and generation/fencing checks in the dedicated HB/media
coordinator, with Dashboard acting as an authenticated stateless BFF. Durable
revocation and atomic ownership are prerequisites for multiple coordinator
workers. This is a design proposal, not a new external service or deployment.
The current single-process test does not change site-wide authentication.

The separate HB proposal at commit `5798112` remains unapproved. Candidate control
recipients are `wss://home-butler.onrender.com/api/vision/v1/device` and
`https://home-butler.onrender.com/api/vision/v1/command`; the owner must confirm
this host. Start with device `floor-mini-01` and status-only permissions. An
approved deployment operator would generate independent random device/service
tokens: device token into mini login Keychain service
`com.floorpresence.vision-control`, account `floor-mini-01`; service token into
Dashboard hosting server secrets; HB stores only digests and scope/expiry/revoked
metadata. Initial expiry is 24 hours. Never transmit these through chat or logs.
Keychain item/ACL, installation, grants and each deployment need explicit approval.
Status-only must minimize payload to approved status fields; settings names/ROI
and edit require separate declared scope, because free-text names can be private.

External preview is a separate optional approval: Cloudflare Realtime TURN at
`turn.cloudflare.com` UDP3478 or TLS443, credential API
`https://rtc.live.cloudflare.com/v1/turn/keys/{TURN_KEY_ID}/credentials/generate-ice-servers`.
The account owner would authorize billing and create a TURN key; the authorized
operator places its long-lived secret in HB hosting secrets, never the browser.
The server mints short-lived viewer credentials (proposed 10 minutes), while the
application enforces one viewer, five-minute viewing and 30-second idle cutoff.
Cloudflare relays encrypted media and sees IP/timing/traffic metadata; authorized
browsers receive decrypted images. HB receives signaling/session metadata; control
hosting receives approved status/config data, not camera passwords or media.
Synthetic relay testing and later private-camera relay are distinct approvals.

Official pricing rechecked 2026-10-06: SFU/TURN share 1,000 GB monthly free egress;
excess is USD0.05/GB. At 1Mbps for 30 minutes daily, one-way payload is about
6.75GB/month before overhead (about USD0.34 without the free allowance). Proposed
USD5/month budget and 10GB application cap are not implemented and are not billing
guarantees; existing hosting charges are additional. No subscription or resource
has been created. Sources: [pricing](https://developers.cloudflare.com/realtime/sfu/platform/pricing/),
[credential lifecycle](https://developers.cloudflare.com/realtime/turn/generate-credentials/).

Without new external authorization, isolated synthetic concurrency/restart tests,
mock credential-provider/enrollment code, protocol validation, local documentation
and code review can continue. Actual credentials, persistent Keychain changes,
provider enrollment/billing, push/deployment, camera access, public transport,
launchd and HA/MQTT publishing remain outside the authorized boundary.

The real Next runner uses `http://localhost:<ephemeral port>` for browser/API
Origin, while binding the server to `127.0.0.1`. NextURL canonicalizes loopback
hostnames to localhost; using numeric Origin against that canonical URL is
correctly rejected by the existing strict origin check. No Origin allowlist or
production security rule was relaxed. The native signaling endpoint remains
fixed to numeric loopback. The embedded native region supplies its own dark
background so its light text stays readable inside Dashboard's light cards.


## HB authority path (subsequent isolated milestone)

The direct-native runner above remains historical fixture coverage. The new
`DASHBOARD_VISION_MEDIA_HUB_FIXTURE_MODE=1` path uses a stateless BFF with a fixed
loopback HB port and public-only mock service credential; no Dashboard-owned lease
or native address is used. HB forwards bounded signaling over the mini's dedicated
outbound WS; WebRTC video remains native-to-browser. See
[deployment review](vision-deployment-review.md) for topology evidence, quarantine,
revocation responsibilities and the explicit list of unfinished production work.
A 503/unknown cleanup state stays unknown and never becomes confirmed stopped.

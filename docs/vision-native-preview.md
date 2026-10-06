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
It exercises the actual React component and route handlers in one Node process,
not a deployed Next route-bundle or multi-worker installation. The global lease
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

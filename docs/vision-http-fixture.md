# Vision synthetic HTTP fixture integration

This is an opt-in **loopback test transport**, not an activated production connection.
No credentials, service installation, camera connection, public proxy, or automatic
retry is provided. Importing the module makes no network request.

`src/lib/vision-http.ts` exports:

```ts
createVisionHTTPTransport({ port, token, deviceId, timeoutMs: 8000 })
```

The factory pins the endpoint to `http://127.0.0.1:<port>/api/vision/v1/command`.
It accepts no URL, host override, browser header forwarding, or redirect. Call
`status(capabilities, signal?)`, `config(signal?)`, or `save(config, signal?)`.
Each call sends one `vision.v1` command with a new UUID and bounded Unix deadline,
with the fixture Bearer token added only by this server module. Keep machine clocks
synchronized when evaluating protocol deadlines.

Dashboard configuration here means **detector model and precision**. GET config
uses `status.get` and `detector_revision`; it must never substitute the independent
floor `config_revision`. PUT translates browser `revision` to
`detector.configure.payload.expected_revision`. No ROI mutation or preview/image
transfer is added. The preview route remains unavailable.

For testing actual BFF route handlers, additionally set only fake local values:

- `DASHBOARD_VISION_FIXTURE_MODE=1`
- `DASHBOARD_VISION_FIXTURE_PORT=<isolated HB fixture port>`
- `DASHBOARD_VISION_FIXTURE_TOKEN=fixture-<known fake token>`
- `DASHBOARD_VISION_FIXTURE_DEVICE_ID=synthetic-mini`

All values are server-only. Neither browser URL parameters nor request headers can
activate this transport. The route gate refuses it in `NODE_ENV=production` or
`VERCEL_ENV=production`, and stays disabled without explicit valid configuration.
Verified session and independent vision grants still run first; PUT additionally
checks Origin, JSON content type, bounded body and schema before any network call.
Existing unconfigured authorized routes still return 503, while unauthorized
requests retain their 401/403 behavior.

Responses are bounded to 32 KiB and checked for protocol, request identity, device,
session nonce syntax and action-specific shape. Only explicit revision conflicts
become 409. Timeouts, cancellation, connection failure, redirect, or unknown
execution never become success or automatic retransmission. Responses redact all
remote text, nonce, token, network address and raw error details.

`tests/vision-http.test.ts` uses real HTTP sockets on an ephemeral loopback port,
with a synthetic in-process protocol responder. It checks envelope/authentication,
detector revision mapping, wrong identities/action shape, oversized/malformed
responses, redirects, timeouts, cancellation, conflict/unknown handling and BFF
authorization before egress. This is distinct from the separately orchestrated
Dashboard → real HB fixture → outbound synthetic mini end-to-end test.

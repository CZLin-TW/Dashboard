# Vision activation review — isolated work, not deployment ready

## Verified topology and gap

On 2026-10-06 the authorized read-only GitHub deployments API for CZLin-TW/Dashboard
returned recent Production deployments created by `vercel[bot]`, latest source
`755f5f8d94008f4777576159abb04fdbc215e6de`. The repository README also describes
Vercel CDN/Functions. No hosting secret or private account setting was read.
There is no evidence guaranteeing worker affinity, so a Next singleton cannot be
a production ownership authority. HB's checked-in `render.yaml` starts one uvicorn
process without `--workers`; platform replica count was not inspected or assumed.

The former native-preview runner connected Dashboard directly to native loopback.
It did **not** implement the remote signaling topology. The new isolated route is:

`browser → stateless Dashboard BFF → HB media authority HTTP → mini-initiated WS → local native sender`

WebRTC media travels separately from the native sender to the browser; the WS
carries bounded signaling only. The new path does not use the legacy local
Dashboard lease store. The old direct fixture remains a test aid, never a
production activation path. Both transports remain production-disabled.

## Responsibility and failure boundaries

HB owns opaque leases, actor binding, one pending/active viewer, expiry, mock
credential/grant revocation and unknown-result quarantine. Dashboard checks each
JWT/preview grant/Origin but holds no authoritative viewer state. Two independent
Dashboard processes may call the same HB lease. Native retains final single-viewer
and finite TTL enforcement, including connector/HB failure. The mini connector
cleans sessions it created on outbound WS disconnect and rejects stale epochs.

HB itself is still single-authority/single-process. Restart forgets state and
therefore defaults to a 67-second refusal window covering maximum native TTL and
in-flight work. It cannot silently admit a replacement viewer after forgetting an
unknown offer. Only a brand-new native fixture permits the test-only fresh-start
shortcut. No multi-HB replica, rolling overlap, durable grant enrollment or
persistent revocation guarantee has been established. Production requires either
an enforced singleton coordinator with fail-closed restart and durable credentials,
or a durable fenced authority before adding replicas. Vercel can remain stateless;
it must not be given per-worker ownership responsibility again.

## Deployable versus unfinished

The deliverable is runnable isolated source and tests. **No repository is approved
or ready for production activation as-is.** Defaults refuse real credentials and
external URLs, and the new HB media routes are not installed in the live app.

Completed building blocks: same-origin BFF authorization, stateless hub adapter,
dedicated media signaling protocol, mock credential provider, actor-owned central
lease, outbound connector, native synthetic sender, bounded cleanup and tests.

For the media path, still required before production: explicit HTTPS/WSS endpoint
configuration and TLS adapter review; real media credential enrollment, persistence,
rotation and revocation; enforced HB singleton/replica policy or durable fencing; approved
installation and route registration; monitoring/rollback; approved network relay
and real browser/network interoperability. Camera/media privacy, real detector and
HA validation are separate. There is no real iPhone/WebKit, TURN, camera, formal
credential or deployed transport proof in this milestone.

## Smallest future authorization and order

Do not create 24-hour credentials now. First approve a change set and a time window
when the owner can supervise; mint short-lived credentials just before the actual
activation and acceptance test. The next minimal batch should be **control only**:
confirm the intended HB host, `floor-mini-01`, approved status fields and authorized
operator; approve reviewed production adapter/provider changes and explicit
HB/Dashboard/mini rollout plus rollback SHAs. Keychain item/ACL and manual connector
installation must be included explicitly, without launchd or camera access.

Then, separately, approve synthetic external media signaling/TURN provider,
recipient endpoints and spending cap. Only after that verification approve private
C110 media and its recipients; HA/MQTT publishing remains a later separate batch.
The detailed credential locations, proposed endpoints and cost assumptions are
in [native preview proposal](vision-native-preview.md#deployment-constraints-and-proposed-next-boundary).

No formal tokens, accounts, persistent Keychain changes, relay resources, public
listener, push, deployment or live service modifications were made by this review.


## Current status-only pilot implementation

The pilot now reuses existing LINE pairing/JWT and the Dashboard-to-HB server
API key. HB checks trusted actor/role/expiry headers against enabled members and
explicit grants in a shared Sheets snapshot. Refresh is 30 seconds with a
60-second monotonic hard limit; failure denies access, revocation invalidates
sessions and late results. No second Dashboard service credential, SQLite DB or
paid persistent Disk is required. Existing media fixtures are not enabled by this
change; formal dispatch remains status.get only.

The mini keeps its independent native Keychain broker boundary. Its source/mock
checks do not prove signing, installation, real ACLs or native TLS. Actual Sheet
grants, device enrollment, restricted sharing review, singleton hosting, external
TLS and approved release/rollback remain unconfigured or unverified. See
[status pilot operations](vision-status-pilot-operations.md) for the concentrated
activation boundary. No real Sheet, key, hosting setting or live service was changed.

# Status-only pilot: existing login and Sheets authorization

This is source and an operator proposal, not an executed deployment. The pilot
returns strictly whitelisted local HTTP service health only. Current TLS/UI
evidence uses simulated health payloads; the native HTTP adapter has not been
executed against the live service. It does not read cameras, determine real
occupancy, edit ROI, stream media, publish MQTT or invoke HA.

## Current implementation

Users keep the existing six-digit LINE approval flow and Dashboard JWT cookie.
Dashboard uses the existing server-only `HOME_BUTLER_API_KEY`; no second vision
service token or `DASHBOARD_VISION_GRANTS` is required for this pilot. The BFF
constructs user, member role and session-expiry headers from the verified JWT,
never from browser-supplied identity headers. Kid sessions remain denied even
when their LINE ID belongs to the approving parent.

The fixed destination is
`https://home-butler.onrender.com/api/vision/v1/access` or `/command`.
HB validates the existing API key, explicit VISION_STATUS_OWNER_USER_ID pin,
current enabled membership and explicit status grant. Missing pin or another
member is denied even with grants. The server page checks HB before rendering;
page denial is404 and API denial is403. Dashboard remains stateless and checks JWT/grants again before releasing
results. The pilot masks preview/edit and HB dispatches only `status.get`, even
when future capabilities appear in the grants table. Global pairing/login code
has not changed; known global login limitations are not repaired by this change.

HB reads members, vision grants and device digests into one shared snapshot.
Refresh runs every 30 seconds; freshness starts when the read begins and has a
60-second monotonic maximum. Read errors, invalid data and timeout immediately
invalidate authorization. Startup requires a successful read. Heartbeats and
requests inspect memory, not Sheets on every call. Revoked/changed device records
close their sessions; revoked actors cannot receive pending or late results.
Shutdown cannot publish a late successful read. This is bounded revocation,
not immediate propagation of every manual Sheet edit.

The source adapter is read-only. `Vision Grants` and `Vision Devices` are proposed
worksheet names, not worksheets created by this work. HB documents exact schemas
in `docs/vision-sheets-pilot.md`. Raw tokens never belong in either worksheet.
SQLite and the old separate service-token registry remain historical fixtures;
neither is a current deployment dependency. No paid Render Disk is needed for
this registry design.

Mini authentication remains separate: the native broker owns its dedicated
Keychain credential and authenticates to
`wss://home-butler.onrender.com/api/vision/v1/device`. Never give the mini the
household API key. The broker has not been signed using an approved identity or installed, and
activation is disabled with an empty signing requirement. Its mock
checks are not real Keychain ACL or native TLS acceptance. The Python file
provider is restricted to temporary fake loopback fixtures, not production.

## Work remaining before an approved activation window

1. Review the exact three-repository release/rollback commits and confirm the
   existing HB host, mini identity and exact HTTP health whitelist.
2. Confirm the actual operator/member IDs and status-only grants, and authorize
   creation/population of the two registry worksheets in the existing approved
   spreadsheet. Verify its editors are trusted authorization administrators;
   do not broaden sharing. No new storage subscription is proposed.
3. Approve native broker signing identity, restricted Keychain ACL, installation
   and enrollment of a separate device credential. Mint it shortly before the
   supervised window. Enter it directly into the approved native store; enroll
   only its digest, identity, scope, expiry and revocation metadata on HB.
4. Execute the approved release and actual TLS/hosting acceptance. The status-only
   pilot tolerates overlapping containers: a request routed away from its local
   device socket returns unavailable. It does not provide cross-instance routing
   or media authority. Retain one worker per container; no exclusive lock or
   single-authority ACK is required for this status-only path.

Candidate gates remain default-off: Dashboard `DASHBOARD_VISION_STATUS_PILOT=1`;
HB `VISION_STATUS_PILOT_ENABLED=1`, `VISION_STATUS_TLS_PROXY_ACK=1`,
`WEB_CONCURRENCY=1`, plus verified `VISION_STATUS_OWNER_USER_ID`.
If `UVICORN_WORKERS` is present it must be 1. Do not add
`VISION_STATUS_SINGLE_AUTHORITY_ACK` or `VISION_STATUS_AUTHORITY_LOCK` for this pilot.
HB uses its existing Google/server-key configuration. No fixture CA/port variable
belongs in production. ACK flags are operator assertions, not platform proof.

Native enrollment and continuous manual connection source, packaging and exact
install/rollback/uninstall commands are prepared in the isolated Floor repository
`docs/native-status-packaging.md`. The unsigned review package cannot be installed.
Actual signing, native Keychain acceptance and installation still require the
approved activation window. There is no 120-second process cutoff: bounded
reconnect continues until stop, expiry, rejection or retry exhaustion. launchd, media/TURN, real camera,
HA/MQTT, tunnels and public mini listeners remain outside this pilot.

## Acceptance and rollback

Accept only owner-authorized HTTP health metadata, reject other members/kid users and all
config/edit/media calls, verify grant/device revocation, reader failure, expiry,
restart and clean shutdown on the approved services. After restart, fresh Sheets
authorization and an explicit new mini session are required; unknown work is not
replayed. Do not equate fixture success with real-host or Keychain acceptance.

To stop, disable the new Dashboard/HB pilot gates and stop the new mini process.
Revoke the vision device/grants using the approved Sheet process; preserve that
state when rolling back code. A lost Sheets connection already denies access.
Do not rotate the family's existing API key merely to stop vision, restore old
grants inadvertently, or touch other services/camera credentials.

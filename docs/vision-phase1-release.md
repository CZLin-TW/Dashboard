# Phase 1 release review: owner-only local service health

This document prepares a reviewable release. It does not authorize push, merge,
production configuration, Sheet changes, credentials, signing, installation or
service restart. The accepted scope is one owner-only Dashboard page showing the
mini connection and local vision HTTP service health. No image, ROI names, tracks,
occupancy, model-health claim, configuration editing or HA/MQTT operation belongs
in this release. The local 8768/8771 interfaces remain independent and untouched.

## Identity must be verified, not inferred

Existing LINE approval issues a Dashboard JWT containing `lineUserId` and role.
There is no trustworthy owner mapping in the inspected source. Neither a name,
`SIRI_USER_ID`, first member row nor the account performing a GitHub operation is
evidence of the owner's LINE identity. The new owner pin must stay unset and deny
access until verification is authorized.

The proposed narrow verification is: from the owner's already authenticated
production Dashboard session (never demo/fixture mode), inspect only `lineUserId` and role from `GET /api/auth/me`, then
match that exact ID to `Line User ID` and enabled status in the existing family
membership source. Do not transmit the cookie, JWT, API key, LINE secret or other
members' data. No such authenticated request or actual Sheet read was made here. The production
Sheets adapter fetches the whole family-members worksheet before projecting the
identity/enabled fields; its read scope must not be described as a server-side
two-column restriction. Confirm the existing spreadsheet by its nonsecret
SPREADSHEET_ID and owner-confirmed URL/name, without reading GOOGLE_CREDENTIALS.
Kid sessions may contain a parent's ID, so verified role must also be member.

## Exact future configuration targets

All values below are proposals requiring action-time confirmation, not executed
instructions. Unknown values are intentionally not guessed.

| Target | Data to approve | Purpose |
| --- | --- | --- |
| HB server configuration | `VISION_STATUS_OWNER_USER_ID` = the verified exact LINE ID | One owner even if another member has a status grant |
| Existing approved spreadsheet, `Vision Grants` | One row: verified `user_id`, status TRUE, preview FALSE, edit FALSE | Explicit status-only authority |
| Same spreadsheet, `Vision Devices` | New unique record ID, digest of the separate device token, device ID `floor-mini-01`, scope status, approved Unix expiry, revoked FALSE | Authenticate only this mini; no raw token in Sheets |
| Mini dedicated login Keychain | Service `org.floorpresence.dev.status.v1`, account `approved-hub-status-only`; native-only token/device_id/expires_at | Keep device secret inside the native broker |
| Native broker packaging | Approved fixed signing requirement, restricted ACL, exact binary/source hash, manual execution scope | Enable the currently unprovisioned helper only after review |
| Existing Dashboard/HB deployments | Exact candidate and rollback SHAs, default-off gates, status-only per-instance routing and worker count | Bounded release and supervised acceptance |

Use existing Dashboard-to-HB API key and Google authorization; do not create a
second service credential or expose the family key to the mini. No Sheet editor
or sharing permission is expanded. Secrets must be entered directly into approved
stores using a safe input flow, never into chat, argv, source, logs or artifacts.
The native source is not an installed/signed/enrolled release. The implemented native
packaging and enrollment workflow must be reviewed with its exact staging
manifest, signing requirement and dry-run plan before action-time activation.
The broker runs manually until stopped or its credential authorization expires;
there is no scheduled launch or login item in this scope. Transient network
failures use bounded backoff, while rejected or revoked credentials stop.

## Health semantics and test boundary

The previous pilot returned synthetic adapter metadata. That is not evidence of
real local health. The new native adapter is restricted to the exact loopback
`/api/v1/health` endpoint, with a small fixed response schema and no redirect or
arbitrary URL option. Its result establishes only whether the local HTTP service
responded and passed validation. It does not establish camera freshness, detector
correctness, occupancy or HA availability.

Offline verification uses isolated fake HTTP health data and fake Sheets/TLS
fixtures. It must label those tests as fixtures. No test request is sent to the
live 8768/8771 services. Actual native Keychain/TLS and live health acceptance
remain unperformed until specifically approved. An inaccessible or malformed
health endpoint must be unavailable, never simulated healthy.

## Release and rollback baselines

Read-only GitHub main checks on 2026-10-06 returned:

- Dashboard: `755f5f8d94008f4777576159abb04fdbc215e6de`.
- HomeButler: `cd5da6365041fdd9f7b543a550b997c46643ace7`.
- Published Floor repository main: `9772b555b04cbe206bea2b37582a837471a0c7fe`.

The original local `task-4` checkout separately remains at
`837f54409d7da56c4e2f88dbce2febab669bc917`, has no remote, and has no common
ancestor with the sanitized published Floor history. It is **not** the rollback
commit for the published repository. The isolated Floor checkout tracks
`https://github.com/CZLin-TW/floor-presence.git`; its native connector candidates
descend from published main `9772b55`. Never merge the unrelated histories or
overwrite the original live checkout. Read-only process inspection found the
8768/8771 listeners working from original `task-4`; it did not establish their
exact loaded revision. Install the new broker separately, leaving both listeners
and their code/configuration unchanged.

Those are source baselines, not proof of every running process's exact binary.
Before an approved deployment, reconfirm the actual deployed revision and retain
its rollback artifact. The three isolated candidate HEADs and this stage's exact
test results are recorded in the delivery report and local
`artifacts/phase1-release/manifest.json`; no candidate has been pushed.

The pre-stage isolated engineering baselines were Dashboard `70cc890`, HB
`8c8948a`, Floor `fc274de`. These are suitable for reverting this code experiment;
they are not substitutes for the production baselines above.

## Push is operationally consequential

Dashboard's GitHub CI runs on main push. Recent authorized deployment metadata
shows Production deployments created by `vercel[bot]`, latest at the Dashboard
main SHA above. Treat a main push as potentially deploying; do not assume it only
publishes source. No Vercel account secret/settings were inspected.

HB's GitHub CI also runs on main push; `render.yaml` describes its web service.
The actual Render auto-deploy setting was not inspected, and absence of GitHub
Deployment records does not prove auto-deploy is off. Confirm the release window
and platform behavior before any push.

Critically, HB `agent/agent.py::check_for_updates()` compares the whole repository
HEAD with origin/main. With its default AUTO_UPDATE setting, it pulls and restarts
on any new main SHA, not only an agent-file change. Default cadence is five ticks
(about five minutes with the documented 60-second tick). This stage does not edit
agent code, but publishing HB can still restart existing PC agents. Which agents
currently run and their overrides were not inspected. Do not silently disable
updates, stop agents or restart their services as part of this preparation.

## Approved-window sequence and stopping conditions

Reconfirm candidate/baseline SHAs, owner mapping, grant/device records, native
provisioning readiness and hosting/PC-agent impact together. Apply only the
specifically approved Sheet and server configuration changes. Deploy HB before
Dashboard while preserving default-off behavior until supervised acceptance;
activate the separate manual native connector only when explicitly approved.
Verify owner access, other member/kid/direct-URL denial, service failure/recovery,
revocation and expiry without image/edit routes. No localhost service restart is
necessary merely to add the outbound health reader.

To stop, disable the new pilot gates and stop only the newly approved connector;
rollback Dashboard before HB if needed. Preserve device revocation and current
grants when rolling back code. Do not restore old secrets/grants automatically,
rotate the shared household key just to stop vision, or affect local vision/HA.


## Native preparation evidence (2026-10-06)

The isolated Floor repository now provides native secure enrollment (or native
256-bit generation on explicit Save), hash-only enrollment receipt, restricted
ACL validation, continuous manual connect/stop/forget, and a default-dry-run
package/install/rollback/uninstall tool. Exact commands and fixed per-user paths
are in Floor `docs/native-status-packaging.md`; the unsigned inactive review
package is `artifacts/native-status/package-review/`. It was compiled but never
executed. Actual unsigned installation is rejected without creating targets.

Floor full regression passed 200 tests including 12 packaging fixture tests.
A 60.008-second same-process mock soak completed 4,406 cycles / 9,694 attempts,
maximum one simulated transport and zero at exit; peak RSS was 6,864,896 bytes.
The final enrollment-helper source additionally passed 10,000 cycles and a
1-second smoke; the original 60-second source hash is preserved separately.
These tests use the production supervisor with fake transport, not actual TLS,
Keychain, OS sockets or signal-handler acceptance. No signing, real token,
installation, live endpoint request or persistent process occurred.


## Activation preflight: status-only rollout and native signing

The user approved the bounded activation batch, with seven days from actual
native Save. The user confirmed unique enabled membership; production
SPREADSHEET_ID still needs a safe single-value comparison. Do not copy identity
into source or fixtures. Browser Sheet scripting remains unavailable; exact
nonsecret rows can be entered manually without sending any raw token.

Render starts a new container before stopping the old one. The Sheets status-only
pilot now tolerates this: each instance owns its local snapshot and device socket.
An HTTP request reaching an instance without that socket returns 503
`device_unavailable`; it cannot invent health or forward to another instance.
Old session nonces/results cannot satisfy new-instance work. Owner/grants/expiry
and snapshot revocation are rechecked before result release; snapshot revocation
remains bounded by the documented refresh window, not globally instantaneous.
This safely tolerates rollout but does not provide cross-container status routing
or uninterrupted availability. Prefer a single steady-state replica and retain
one worker per container for existing HB behavior. The status-only setup no longer
requires SINGLE_AUTHORITY_ACK or AUTHORITY_LOCK. Media remains disabled and its
separate authority design is not changed.
Source: https://render.com/docs/deploys#zero-downtime-deploys

No Render connector/CLI or existing Safari Render tab was available. The remaining
minimal platform handoff is nonsecret SPREADSHEET_ID match, service/repo identity,
current worker start command and deployment settings. The operator does not need
to disable ordinary Render rollout, buy a disk or suspend the household service.

A `find-identity -v` zero-valid result does not prove no certificate/key pair exists.
Read-only lookup without the valid-only filter found the original camera installer's
self-signed identity, marked CSSMERR_TP_NOT_TRUSTED. Its public certificate and
installer receipt agree; the existing signed camera app passed an explicit
bundle-ID plus leaf-fingerprint requirement without trust changes. The dev-prefixed
isolated installer uses a different label, which must not be mistaken for absence
of the original identity. No private key bytes or secrets were read, no identity
was created, and no trust/ACL/unlock changes were made.

The status activation candidate pins the existing public certificate fingerprint
with its own distinct bundle ID. It remains unsigned and unexecuted. Actual
signing may require the user's native OS prompt; do not pre-authorize codesign
permanently or broaden the camera credential ACL. Enrollment remains a separate
user-confirmed native Save. Public identity metadata belongs in local ignored
activation artifacts, not source or test fixtures.

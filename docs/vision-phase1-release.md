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
members' data. No such authenticated request or actual Sheet read was made here.
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
| Existing Dashboard/HB deployments | Exact candidate and rollback SHAs, default-off gates, single-authority topology and ephemeral lock location | Bounded release and supervised acceptance |

Use existing Dashboard-to-HB API key and Google authorization; do not create a
second service credential or expose the family key to the mini. No Sheet editor
or sharing permission is expanded. Secrets must be entered directly into approved
stores using a safe input flow, never into chat, argv, source, logs or artifacts.
The native source is not an installed/signed/enrolled release. If its provisioning
workflow needs additional implementation, finish and review it before activation.

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
- The unchanged original Floor checkout: `837f54409d7da56c4e2f88dbce2febab669bc917`.

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

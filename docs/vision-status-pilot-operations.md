# Status-only pilot: review, activation and rollback

This is a proposed operator runbook, **not an instruction already executed or an
approval to deploy**. The pilot transmits synthetic adapter health/revision/model
metadata only. It does not read cameras, report real occupancy, edit ROI, stream
media, enroll TURN, publish MQTT or invoke HA. Do not mint 24-hour credentials
until the owner approves an activation window and can supervise acceptance.

## Reviewable implementation

Dashboard `vision-pilot.ts` has a server credential-provider interface backed by
hosting environment secrets. Every request reads the provider, emits only
`status.get`, verifies response identity/schema and rechecks credentials, deadline
and user JWT/grant before returning. The production destination is fixed to:
`https://home-butler.onrender.com/api/vision/v1/command`.
Config, edit and media are refused while the pilot flag is active, even if older
Dashboard grants contain those capabilities. No client URL/token is accepted.

The proposed mini credential default is a **dedicated native Keychain broker**,
following the established signed-broker boundary. The native helper owns Keychain
access and WSS authentication; Python must never receive a plaintext token.
The device identity remains `floor-mini-01`, with fixed destination
`wss://home-butler.onrender.com/api/vision/v1/device`. Source and mock validation
are a separate deliverable from signing, installation, enrollment and actual
Keychain acceptance. None of those activation operations is authorized here.
The protected-file Python provider remains an isolated TLS fixture aid, not the
recommended production credential store. See floor `docs/status-pilot.md` for
its current native implementation and remaining acceptance requirements.

HB `vision_pilot.py` installs the status-only routes from main only when all gates
are explicit and an existing protected SQLite registry is valid. The DB stores
digests and authorization metadata, not plaintext credentials. Enrollment/revoke
are offline operator actions; request/session checks reread the registry. Missing,
corrupt, replaced or incorrectly protected DB/lock files fail closed, never create
an empty fallback registry. Existing Render config declares no persistent volume.

## Owner/operator decisions — one concentrated approval batch

1. Confirm `home-butler.onrender.com`, device `floor-mini-01`, synthetic status
   payload and the specific Dashboard user ID(s) permitted `status` only.
2. Approve exact HB/Dashboard/floor release and rollback SHAs. Approve a **single
   HB instance and single worker**, no autoscaling or overlapping rollout. The
   file lock only protects one filesystem; it is not a distributed lock.
3. Resolve durable registry storage after the HB storage review. The current
   implemented adapter uses private SQLite and needs durable storage; that does
   **not** establish that a new paid Render volume is the minimum solution.
   HB already persists application data in Google Sheets, but its existing cache
   is unsuitable for authorization. The current once-per-second session check
   alone can consume the Sheets per-user read quota; a Sheets registry needs
   a separately validated freshness/revocation design. SQLite plus durable disk
   is the least code change for the present strict checks, not the only possible
   storage choice. Actual hosting plan and incremental price remain unverified.
   Do not purchase storage or treat an unimplemented adapter as available.
4. Approve independent device/service tokens, expiry and storage only during the
   activation window: a dedicated Keychain item accessible to the reviewed signed
   native broker, service token in Vercel **server** hosting secrets, digest-only
   records on HB. Approve the exact signing identity/designated requirement and
   enrollment/rotation/ACL procedure. No token in chat, source, argv, logs, client
   environment or exports. A plaintext mini token file is not the default plan.
5. Approve manual bounded connector execution only. launchd, camera access, edit,
   media/TURN, public mini listeners and HA/MQTT remain outside this batch.

## Approved-window execution order (do not run before approval)

A. The following SQLite commands apply only if that backend and its durable
storage have been approved; they are not a purchase recommendation. Stop any
previous vision pilot authority/connector. Back up the existing
registry if present while authority is stopped. Arrange the approved persistent
mount and private directory: runtime UID ownership, directory0700, DB/lock0600.
Do not reuse an unrelated file or recreate a missing database automatically.
On the approved HB filesystem, the reviewed offline CLI initializes a new registry
once, then enrolls two **new** record IDs for `floor-mini-01` (service and device).

```sh
python scripts/vision_status_registry.py init --db /var/data/vision-status/registry.sqlite3
python scripts/vision_status_registry.py enroll --db /var/data/vision-status/registry.sqlite3 \
  --record-id SERVICE_RECORD --kind service --device-id floor-mini-01 \
  --expires-at EXPIRY_UNIX_SECONDS --secret-file /approved/private/service-token
python scripts/vision_status_registry.py enroll --db /var/data/vision-status/registry.sqlite3 \
  --record-id DEVICE_RECORD --kind device --device-id floor-mini-01 \
  --expires-at EXPIRY_UNIX_SECONDS --secret-file /approved/private/device-token
```

The operator creates/inputs tokens directly into the approved stores; this runbook
contains no generation command or value. Temporary plaintext enrollment files must
follow the approved secret-handling/disposal procedure. Do not restore a backup
that predates revocation without first reapplying all revocations; restored expired
credentials must not be made valid again. Keep DB and stable lock inode unchanged
while the authority is running.

B. Deploy the reviewed HB SHA with `VISION_STATUS_PILOT_ENABLED=1`,
`VISION_STATUS_REGISTRY_DB` set to the approved DB, both
`VISION_STATUS_SINGLE_AUTHORITY_ACK=1` and `VISION_STATUS_TLS_PROXY_ACK=1`,
`WEB_CONCURRENCY=1`, and `UVICORN_WORKERS=1` if present. These ACKs are operator
assertions, not platform enforcement or TLS proof. Confirm the public TLS chain,
proxy trust boundary, exactly one instance/process and no media route activation.

C. Deploy Dashboard with `DASHBOARD_VISION_STATUS_PILOT=1`, server-only
`DASHBOARD_VISION_PILOT_SERVICE_TOKEN`,
`DASHBOARD_VISION_PILOT_EXPIRES_AT` (Unix seconds), and explicit
`DASHBOARD_VISION_GRANTS` containing only the approved user's `status` grant.
Do **not** set any `*_FIXTURE_*` variables, custom CA or insecure TLS flags.
Production rejects the test-only TLS fixture destination/trust-root settings.

D. After native source review, signing/installation, Keychain enrollment and
storage authorization, use the approved native broker entry point documented in
floor `docs/status-pilot.md`. Do not substitute the Python `--credential-file`
fixture command as the production default. Native signing, real Keychain ACL
acceptance and real-host testing remain separate unperformed steps.

It connects once; no automatic reconnect or command replay. This synthetic pilot
must show the synthetic source label. Confirm status-only response, unauthorized
user rejection, config/edit/media refusal, token expiry/revocation and a clean
stop. Restart of the read-only authority restores registry/revocation but drops
sessions/in-flight requests: responses stay unavailable/unknown until an explicit
new connector session. No read is replayed. Media's 67-second quarantine is not
needed here because no media or mutating operation can start in this pilot.

## Rollback / emergency stop

1. Disable Dashboard pilot and remove its vision grants; stop the new mini process.
2. Revoke both record IDs using the reviewed registry CLI while preserving the DB:

```sh
python scripts/vision_status_registry.py revoke --db /var/data/vision-status/registry.sqlite3 --record-id SERVICE_RECORD
python scripts/vision_status_registry.py revoke --db /var/data/vision-status/registry.sqlite3 --record-id DEVICE_RECORD
```

3. Disable `VISION_STATUS_PILOT_ENABLED`, stop the vision-enabled HB authority,
   and roll back the approved application SHAs if needed. Retain revocation records
   and approved backups; do not delete/reset the DB to regain access.
4. Remove/rotate only the new pilot secrets under the approved procedure. Do not
   touch camera, existing family API keys, other services or network permissions.

## Remaining external acceptance

Offline TLS fixtures prove certificate/hostname rejection and the code path,
not the actual Render/Vercel network, persistent mount or deployed topology.
Real endpoint certificate checks, hosting-secret injection, mount retention across
platform restart, platform singleton verification and pilot acceptance require the
above explicit configuration/deployment authorization. No such action occurred.

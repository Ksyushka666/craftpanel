# Automation and administration

CraftPanel now supports three server roles in addition to the owner: `admin`, `operator`, and `viewer`. The owner controls membership changes, webhook registration, and scheduled jobs. A viewer can inspect server status, logs, files, and signed downloads. An operator can additionally execute lifecycle actions, console commands, catalog installs, file writes, uploads, creates, and deletes. The current model remains owner-scoped at the workspace level; team invitations and email-based identity lookup are intentionally not guessed from a Falix user ID.

Falix webhook deliveries are accepted at `/api/falix/webhooks/:serverId/main`. Falix requires HTTPS and signs the exact JSON request bytes with HMAC-SHA256 in `X-Falix-Signature`; CraftPanel verifies the signature before parsing the payload and records an idempotency key so retries do not duplicate server logs. The webhook secret is stored server-side and is never returned to the browser.

Restart schedules are persisted in `server_schedules` and created through the Heartbeat SDK. A schedule points to `/api/scheduled/restart-server`, authenticates as a cron session, resolves its persisted `taskUid`, checks that it is enabled, sends the Falix `restart` signal, and records `lastRunAt`. Cron expressions are interpreted by the scheduler in UTC. Pausing a schedule updates both the Heartbeat job and the local record.

The file workspace includes a text editor for provider-backed UTF-8 content up to 64 KiB and a drag-and-drop upload zone for files up to 10 MiB. Uploads use Falix's short-lived signed upload URL; the Falix API key remains on the backend. Browser uploads are currently sent through an authenticated tRPC base64 boundary, which is deliberately limited to keep request memory bounded. Larger archives should use a future direct multipart proxy or SFTP flow rather than increasing this limit.

## References

- [1] [Falix API Reference — Webhooks](https://client.falixnodes.net/profile/apidocs)
- [2] [Manus periodic updates guidance](https://help.manus.im)

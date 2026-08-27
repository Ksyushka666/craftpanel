# Falix Free integration

CraftPanel can use **Falix Free** as the external Minecraft runtime while the panel remains deployed on Render. The Falix API key is server-only and is stored as the `FALIX_API_KEY` project secret. The selected Falix server is mapped through `FALIX_SERVER_ID`; it is not hardcoded in the application source.

## What is connected

The provider bridge uses the official Falix API v2. Lifecycle actions call `POST /servers/{server_id}/power` with idempotency keys. The dashboard polling path reads `/status` and `/players/online`, then persists real state, CPU, RAM, disk and player values into the owner-scoped CraftPanel server record. Console commands request a short-lived console token and use the provider WebSocket, so the Falix API key is never sent to the socket. The file manager lists the provider directory and uses the provider's folder, file-write and delete APIs instead of local metadata when Falix is configured.

Falix's console WebSocket token expires after about ten minutes. The bridge obtains a fresh token per command; a future continuous live-console improvement can keep one session open and renew the token on `token expiring`. Falix API webhooks can be added later for push lifecycle/player events, but dashboard status polling remains the safe fallback.

## Required Falix scopes

Create a scoped API key in Falix Account → API Keys. The bridge needs read access for `servers`, `monitor`, `players` and `files`; write access for `power`, `console` and file mutations. Restrict the key to the intended server and revoke/rotate it from Falix if it is ever exposed.

## Free-plan behavior

Falix may require watching an advertisement before starting a free-plan server. The API returns an `action_url` with `ad_required`; CraftPanel surfaces that provider error rather than attempting to bypass it. The free plan is therefore not equivalent to an unrestricted 24/7 VPS: server availability, region, resource quotas and provider policy remain controlled by Falix.

The verified server for this project is Falix server `3409521`, currently reporting allocation `5.9.89.83:32296` and an offline state during integration testing. Do not treat that address as immutable; display the current allocation from Falix when the provider mapping is made richer.

## Environment variables

| Variable | Location | Purpose |
|---|---|---|
| `FALIX_API_KEY` | Render/WebDev server secret | Bearer credential for Falix API v2; never expose to browser |
| `FALIX_SERVER_ID` | Render/WebDev server variable | External Falix server mapped to the first CraftPanel server |
| `VITE_OAUTH_PORTAL_URL`, `VITE_APP_ID` and related Manus variables | Platform-managed | Existing CraftPanel OAuth; custom domain callback uses the browser origin and requires no hardcoded provider URL |
| Built-in storage variables | Platform-managed | Existing S3-compatible Manus storage for panel artifacts and backups |

## Custom OAuth domain and storage policy

No custom domain was supplied, so the current deployment uses the Render/Manus origin and the existing nonce-protected Manus OAuth flow. If a custom panel domain is later attached, the OAuth redirect URI must remain `${window.location.origin}/api/oauth/callback`; update the OAuth application's allowed redirect list to include that exact HTTPS origin. Do not hardcode a domain in server code.

Panel-owned backup artifacts continue to use the built-in S3-compatible storage helper. Store only object keys and metadata in TiDB, keep objects owner-scoped, and do not place runtime API keys or raw world archives in GitHub. A production multi-admin rollout should add explicit team membership and per-server permissions before inviting additional operators; the current app remains owner-scoped.

## References

[1]: https://client.falixnodes.net/profile/apidocs "Falix Public API Reference"
[2]: https://falixnodes.net/free-minecraft-server-hosting "Falix Free Minecraft Server Hosting"
[3]: https://support.aternos.org/hc/en-us/articles/12165605063325-Creating-a-free-Minecraft-server-with-Aternos "Aternos free server guide"

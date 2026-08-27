# OAuth browser check

- Production route opened: `https://craftpanel-7d9t.onrender.com/servers`.
- Unauthenticated state correctly rendered the CraftPanel login screen.
- Clicking the app login button opened the canonical Manus login URL: `https://manus.im/login?app_id=...&redirect_url=https%3A%2F%2Fcraftpanel-7d9t.onrender.com%2Fapi%2Foauth%2Fcallback&state=...`.
- The `state` parameter contained the Render callback URL and a nonce, confirming the browser is using the current production origin rather than a hardcoded local/preview URL.
- Provider authentication was not completed because the user cannot take over the browser and no personal account input was supplied. End-to-end post-auth navigation remains externally blocked; code-level coverage now targets `/servers` callback redirect and popup-close/auth.me polling race.

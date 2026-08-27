# OAuth browser check

- Production route opened: `https://craftpanel-7d9t.onrender.com/servers`.
- Unauthenticated state correctly rendered the CraftPanel login screen.
- Clicking the Discord login button opens the Discord authorization-code flow through `/api/auth/discord/start`; the server constructs `https://discord.com/oauth2/authorize` with a nonce-protected state cookie and the current Render callback URL.
- The callback is `https://craftpanel-7d9t.onrender.com/api/auth/discord/callback`. After successful code exchange, the server redirects to `/auth/success?provider=discord`, shows an explicit success screen, and only then navigates to `/servers`.
- External Discord account authentication was not completed automatically because browser takeover and personal account input were unavailable. Local endpoint contracts, state rejection, diagnostics-without-session, success redirect, 63 Vitest tests, typecheck, and production build were verified.

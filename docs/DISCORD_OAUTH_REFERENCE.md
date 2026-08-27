# Discord OAuth2 reference

Official source: https://docs.discord.com/developers/topics/oauth2

CraftPanel uses Discord's authorization-code flow. The authorization URL is `https://discord.com/oauth2/authorize`, the token endpoint is `https://discord.com/api/oauth2/token`, and the user endpoint is `https://discord.com/api/users/@me`.

Discord's token and revoke endpoints require `application/x-www-form-urlencoded`; JSON requests are not accepted. The login flow requests the `identify` and `email` scopes. `identify` allows the application to read `/users/@me`, while `email` allows the email field to be returned for optional account linking.

# Автоматический деплой через GitHub Actions

В репозитории есть два независимых workflow. По умолчанию автоматический push-деплой включён для Render, а Railway запускается вручную после добавления его secrets. Это не даёт одному push запускать два production-деплоя одновременно.

| Провайдер | Что настроить                                                                   | Как запускается                                                                   | Ограничения                                                                              |
| --------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Render    | `RENDER_DEPLOY_HOOK_URL`                                                        | Проверки проходят в GitHub Actions, затем workflow отправляет POST на Deploy Hook | Бесплатный web service может засыпать; deploy hook является секретом                     |
| Railway   | `RAILWAY_TOKEN`, `RAILWAY_PROJECT_ID`, `RAILWAY_ENVIRONMENT`, `RAILWAY_SERVICE` | Проверки проходят в GitHub Actions, затем Railway CLI выполняет `railway up --ci` | Free-план ограничен $1 monthly usage credits и 0.5 GB RAM на service; ресурс usage-based |

## Вариант A: Render

Создай в Render новый Web Service и подключи репозиторий `Ksyushka666/craftpanel` с веткой `main`. `render.yaml` содержит build command `pnpm install --frozen-lockfile && pnpm build` и start command `pnpm start`. В настройках сервиса открой Deploy Hook и добавь его URL в GitHub: **Settings → Secrets and variables → Actions → New repository secret → `RENDER_DEPLOY_HOOK_URL`**.

После этого каждый push в `main` запускает `deploy-render.yml` (это выбранный default provider): устанавливаются зависимости, выполняются `pnpm check`, `pnpm test`, `pnpm build`, а затем вызывается Render Deploy Hook. Секрет нельзя размещать в коде или обычных variables.

## Вариант B: Railway

Создай service из этого репозитория в Railway. В GitHub Secrets добавь project-scoped Railway token и значения проекта: `RAILWAY_TOKEN`, `RAILWAY_PROJECT_ID`, `RAILWAY_ENVIRONMENT`, `RAILWAY_SERVICE`. Workflow `deploy-railway.yml` устанавливает Railway CLI и запускает `railway up --ci --project ... --environment ... --service ...` после успешных проверок. Сейчас он имеет trigger `workflow_dispatch`, чтобы случайно не запускать Railway параллельно с Render; для автоматического Railway-деплоя добавь `push: branches: [main]` в этот workflow и отключи push-trigger у Render.

Railway project token должен быть ограничен конкретной средой, а не account-wide token. После первого ручного связывания service проверь, что Railway разрешает deploy из выбранного project/environment. Публичный URL нужно добавить через настройки домена Railway; сам `railway up` не обязан автоматически публиковать service.

## Переменные приложения

Для полноценной авторизации и базы данных добавь в настройках выбранного провайдера runtime variables из `.env.example` или README проекта: `DATABASE_URL`, `JWT_SECRET`, `DISCORD_CLIENT_ID` и `DISCORD_CLIENT_SECRET`. Email/password вход использует базу данных и отдельные секреты не требует. В Discord Developer Portal добавь redirect URI `https://<твой-домен>/api/auth/discord/callback`. Не добавляй эти значения в GitHub Actions workflow и не коммить `.env`.

## Sources

Инструкции основаны на официальной документации [Render Deploy Hooks](https://render.com/docs/deploy-hooks), [Render Deploys](https://render.com/docs/deploys), [Railway CLI `up`](https://docs.railway.com/cli/up), [Railway CLI deployment](https://docs.railway.com/cli/deploying) и [Railway pricing](https://railway.com/pricing).

## Текущий статус проверки

Workflow-файлы, YAML, build, typecheck и тесты проверены локально. Render Web Service создан и проверен через авторизованную Render-сессию; Deploy Hook сохранён в GitHub Actions secrets. Discord credentials должны быть добавлены в Render environment, а для повторного запуска достаточно выполнить push в `main` или запустить workflow вручную.

## Render service status

A Render Web Service named `craftpanel` was created from `Ksyushka666/craftpanel` on the Free plan in Oregon. Render assigned the public URL `https://craftpanel-7d9t.onrender.com` and service ID `srv-da7ufrid0e5s739s4ivg`. The service is connected to the repository branch `main`; the current live deployment uses commit `a62a2d4`. The Render Deploy Hook was saved to the repository Actions secrets through GitHub Settings.

The assigned public URL is `https://craftpanel-7d9t.onrender.com`. A direct public request returns the CraftPanel login page with the Russian-language product shell and Discord/email authentication entry points. Render logs show a successful build and the production start command running.

## Current integration result

Render service creation completed successfully on the Free plan. The live deployment uses TiDB Cloud through `DATABASE_URL` with `DATABASE_SSL=true`; `JWT_SECRET` and the application title are configured in Render environment variables. The application uses Discord OAuth for social login and local scrypt-hashed credentials for email/password login. Configure `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` on the hosting provider; storage variables remain platform-managed. `RENDER_DEPLOY_HOOK_URL` is stored as a GitHub Actions secret and is not present in source control.

## Render deployment limitation (current verification)

GitHub Actions run `33118769148` completed successfully after the Discord test fix and returned a successful Render deploy-hook response. However, the Render service continued returning the previous SPA response for `/api/auth/discord/start` instead of the expected `302` Discord authorization redirect. The Render Dashboard requires an authenticated user session for deployment inspection or manual redeploy, and browser takeover was unavailable in this task. The managed published domain `https://craftpanel-64jjoh8d.manus.space/` is the verified current build; Render should be rechecked after an authenticated dashboard session or a fresh Render deploy.

## Latest Render redeploy check

The user-provided Render deploy hook returned HTTP 200, and after the redeploy the Render endpoint `/api/auth/discord/start` returned the new runtime response `302 /diagnostics/oauth?auth=error&reason=discord_config`. This confirms the service is now running the Discord/email auth build; the remaining blocker is the missing `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` in the Render service environment.

## Discord production verification completed

The Render Account API key was validated against the service endpoint. `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` were set on service `srv-da7ufrid0e5s739s4ivg` through the Render API, each update returning HTTP 200. A new API-triggered deployment reached `live`, and the Render endpoint now returns HTTP 302 to `https://discord.com/oauth2/authorize` with the exact callback `https://craftpanel-7d9t.onrender.com/api/auth/discord/callback`. The Discord Client Secret is not included in repository files, URLs, logs, or client bundles.

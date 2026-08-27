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

Для полноценной авторизации и базы данных добавь в настройках выбранного провайдера runtime variables из `.env.example` или README проекта: `DATABASE_URL`, `JWT_SECRET`, OAuth variables Manus и storage variables. Не добавляй эти значения в GitHub Actions workflow и не коммить `.env`.

## Sources

Инструкции основаны на официальной документации [Render Deploy Hooks](https://render.com/docs/deploy-hooks), [Render Deploys](https://render.com/docs/deploys), [Railway CLI `up`](https://docs.railway.com/cli/up), [Railway CLI deployment](https://docs.railway.com/cli/deploying) и [Railway pricing](https://railway.com/pricing).

## Текущий статус проверки

Workflow-файлы, YAML, build, typecheck и тесты проверены локально. Фактический Render Web Service и первый E2E вызов Deploy Hook требуют авторизованной Render-сессии и значения `RENDER_DEPLOY_HOOK_URL`; без них репозиторий не делает неподтверждённых внешних запросов. После создания сервиса достаточно добавить secret и выполнить push в `main` или запустить workflow вручную.

## Render service status

A Render Web Service named `craftpanel` was created from `Ksyushka666/craftpanel` on the Free plan in Oregon. Render assigned the public URL `https://craftpanel-7d9t.onrender.com` and service ID `srv-da7ufrid0e5s739s4ivg`. The first deploy was triggered from commit `84002e0`. The Render Deploy Hook was retrieved from the service settings, but the configured GitHub CLI integration returned HTTP 403 while fetching the repository Actions secrets public key, so the repository secret must be added through GitHub Settings in the browser or with a token that has repository Actions administration permission.

The assigned public URL is `https://craftpanel-7d9t.onrender.com`. A direct public request currently returns Render's `Application loading` / `START BUILDING ON RENDER TODAY` page rather than the CraftPanel UI, so the service logs and start configuration must be checked before considering the external deployment healthy.

## Current integration result

Render service creation completed successfully on the Free plan. Render reports the first deployment as live and exposes `https://craftpanel-7d9t.onrender.com`. Repository secret `RENDER_DEPLOY_HOOK_URL` was added successfully through GitHub Settings after the GitHub CLI integration returned a 403 for the Actions public-key API. External `DATABASE_URL`, Manus OAuth values, and storage values are still not configured because no provider credentials were supplied; the deployment guide keeps these values out of source control.

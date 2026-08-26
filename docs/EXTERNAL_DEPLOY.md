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

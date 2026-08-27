# CraftPanel

CraftPanel — элегантная русскоязычная control-панель для владельцев Minecraft-серверов. Интерфейс собран в направлении millida.net/hosting: тёплая бумажная сетка, графитовый control rail, один лаймовый акцент для живых действий и спокойная типографика Space Grotesk + DM Mono.

## Что уже реализовано

| Область         | Реализация                                                                     |
| --------------- | ------------------------------------------------------------------------------ |
| Доступ          | Manus OAuth, защищённые tRPC procedures, owner-scoped запросы по `ctx.user.id` |
| Fleet dashboard | Адаптивные карточки серверов с online/offline, TPS, players, RAM, CPU и disk   |
| Управление      | Start, stop, restart, подтверждение действия через toast и журнал операций     |
| Консоль         | In-panel command console с историей команд и stdout feedback                   |
| Конфигурация    | Java/Bedrock, ядро, версия, player limit, MOTD, PvP и online mode              |
| Каталог         | Карточки modpacks, plugins и maps с one-click install workflow                 |
| Файлы           | Явная точка входа в файловый менеджер из dashboard и каталога                  |
| Бэкапы          | Обзор копий, создание, restore и download workflow                             |
| Адаптивность    | Desktop sidebar, mobile header, responsive cards и stacked action layouts      |

Текущая версия — control-plane foundation. Состояние сервера и действия сохраняются в базе CraftPanel; для подключения к реальному Minecraft-процессу следующий слой — runtime adapter к хосту/daemon (например, отдельный game node с RCON или специализированным server agent). UI и owner-scoped API уже разделены так, чтобы этот адаптер можно было подключить без перестройки интерфейса.

## Локальный запуск

Требования: Node.js 20+, pnpm 10+ и MySQL-compatible база данных. Склонируй репозиторий, установи зависимости и задай переменные окружения через локальный `.env` — секреты не коммить в Git.

```bash
git clone https://github.com/<OWNER>/<REPOSITORY>.git
cd craftpanel
pnpm install
pnpm db:push
pnpm dev
```

После запуска открой `http://localhost:3000`. Авторизация выполняется через Manus OAuth. Для production-подобной проверки используй `pnpm check`, `pnpm test` и `pnpm build`.

## Доменные модели

`minecraft_servers` содержит серверы и telemetry, `server_actions` — журнал действий/команд, `server_backups` — точки восстановления. Все feature-запросы принимают owner id только из аутентифицированного контекста. UI не передаёт owner id от клиента, поэтому пользователь не может выбрать чужую область доступа через форму.

## Переменные окружения

В managed-проекте значения OAuth, JWT, database и Forge API инжектируются платформой. При локальном запуске создай `.env` с аналогичными значениями, ориентируясь на `server/_core/env.ts`. Не добавляй реальный `.env` в репозиторий.

## Проверка

```bash
pnpm check
pnpm test
pnpm build
```

Unit-тесты покрывают запрет действий над чужим сервером, передачу authenticated owner id в список серверов и корректное обновление/логирование действия владельца.

## Структура

```text
client/src/pages/Home.tsx            # Dashboard, console, config, catalog, backups
client/src/components/DashboardLayout.tsx # Auth gate and navigation shell
drizzle/schema.ts                    # Users, servers, actions, backups
server/db.ts                          # Owner-scoped database helpers
server/routers.ts                     # Protected tRPC contract
server/servers.test.ts                # Ownership and actions tests
docs/LOCAL_DEPLOYMENT.md              # Local deployment and runtime adapter notes
```

## Публикация

Репозиторий публикуется как public GitHub repository по запросу владельца. Перед публикацией проверь, что в истории нет `.env`, токенов, приватных адресов или локальных артефактов. Для дальнейшего подключения real runtime adapter добавь секреты через безопасное хранилище окружения, а не в исходники.

## Автоматический внешний деплой

Для деплоя на Render или Railway через GitHub Actions смотри [`docs/EXTERNAL_DEPLOY.md`](docs/EXTERNAL_DEPLOY.md). В репозитории есть `render.yaml`, `deploy-render.yml` и `deploy-railway.yml`; workflow сначала выполняют typecheck, тесты и production build, а затем запускают деплой только при успешном CI. Секреты провайдера добавляются в GitHub repository secrets и не хранятся в исходниках.

## Тема и live-логи

В верхней панели доступен переключатель светлой и тёмной темы. Выбор сохраняется в `localStorage`, а кнопка имеет доступные `aria-label` и `title` для клавиатурной и скринридер-навигации.

Раздел консоли запрашивает owner-scoped записи `servers.logs` с интервалом 1.2 секунды, показывает статус `LIVE`, поддерживает фильтры `Все`, `Система`, `Info`, `Warn`, `Error` и `Debug`, а также подсвечивает уровни разными цветами. Действия из панели пишутся в этот поток через `source: panel`. Для реальных игровых процессов runtime adapter должен отправлять записи в `runtime.logCallback` с заголовком `x-craftpanel-runtime-token`; callback проверяет токен и существование сервера владельца перед сохранением записи.

## Realtime telemetry charts

The dashboard polls the authenticated owner-scoped `servers.list` procedure every five seconds. Each received snapshot contributes CPU percentage, RAM percentage, and online player count to a client-side rolling history capped at 36 points. This keeps the chart lightweight and avoids presenting historical telemetry before the runtime reports it. Until the first snapshot arrives, each chart shows a collecting-data state. The charts are responsive and render consistently in light and dark themes.

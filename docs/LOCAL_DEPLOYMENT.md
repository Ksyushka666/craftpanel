# Локальное развёртывание CraftPanel

## 1. Подготовка

Установи Node.js 20 или новее, pnpm 10 и MySQL 8 / TiDB. Создай локальную базу и подготовь OAuth application для Manus. Значения секретов храни только в `.env` или в менеджере секретов окружения.

## 2. Установка

```bash
git clone https://github.com/<OWNER>/<REPOSITORY>.git
cd craftpanel
pnpm install
pnpm db:push
pnpm dev
```

Dev-сервер будет доступен на `http://localhost:3000`. Production bundle проверяется командами:

```bash
pnpm check
pnpm test
pnpm build
pnpm start
```

## 3. Как работает доступ

Пользователь проходит Manus OAuth. Все feature procedures используют `protectedProcedure`. Внутри database helper owner id берётся из `ctx.user.id`, а запросы к серверам, журналу действий и бэкапам используют совместное условие `resourceId + ownerId`. Клиентские формы никогда не получают возможность указать произвольный owner id.

## 4. Подключение реального Minecraft runtime

Текущий проект реализует безопасный control-plane: изменения состояния и журналы действий уже хранятся в базе, а UI готов принимать telemetry. Для управления живым процессом нужен отдельный игровой узел, который запускает Java/Bedrock server и предоставляет ограниченный внутренний API или RCON gateway.

Рекомендуемый поток выглядит так: пользователь вызывает защищённую процедуру CraftPanel; сервер проверяет владельца; runtime adapter отправляет команду на конкретный node; ответ и telemetry нормализуются в CraftPanel; UI обновляет карточку и консоль. Runtime node должен быть изолирован от публичной сети, принимать подписанные запросы только от backend и не выполнять произвольные OS-команды из чата.

Для production интеграции добавь backend secrets, например `MINECRAFT_RUNTIME_URL` и `MINECRAFT_RUNTIME_TOKEN`, через безопасное хранилище окружения. Не помещай токен в клиентский bundle и не коммить его в GitHub.

## 6. Проверка перед публикацией

| Проверка | Команда / действие |
| --- | --- |
| Стиль и типы | `pnpm check` |
| Доступ и действия | `pnpm test` |
| Production bundle | `pnpm build` |
| Секреты | Убедиться, что `.env*` игнорируются и не попали в Git |
| UI | Проверить desktop и mobile preview, включая консоль, конфигурацию и бэкапы |

## 5. Backup runtime contract

Для реального архива задайте `MINECRAFT_RUNTIME_URL` и `MINECRAFT_RUNTIME_TOKEN` только в server environment. CraftPanel запрашивает архив через `GET /v1/servers/{serverId}/backups/{backupId}/artifact`; node должен вернуть JSON с `key`, `url` и опциональным `sizeGb`. Пока запрос выполняется, `server_backups.artifactStatus` хранит `creating`; после успеха — `ready`, после ошибки — `failed`.

После restore game node должен отправить `POST /api/trpc/runtime.backupCallback` с заголовком `x-craftpanel-runtime-token` и телом `{ "backupId": 123, "status": "ready", "artifactStatus": "ready" }` или соответствующим `restoring`/`failed` состоянием. Callback не доступен без runtime token. Панель отображает сохранённое состояние и не делает вид, что restore завершился до ответа node.

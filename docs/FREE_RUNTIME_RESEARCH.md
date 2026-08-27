# Бесплатный Minecraft runtime: проверенные ограничения

## Oracle Cloud Always Free

Официальная документация Oracle указывает, что Always Free ресурсы доступны на весь срок действия аккаунта в home region. Для Compute доступны до двух AMD Micro VM или Ampere A1 Flex с суммарно до 2 OCPU и 12 GB RAM, а также до 200 GB block volume. Создание VM может быть временно недоступно из-за `out of host capacity`; ресурс нужно создавать в home region.

Источник: [Oracle Always Free Resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm).

## Render Free

Официальная документация Render сообщает, что Free Web Service засыпает после 15 минут без входящих HTTP-запросов или WebSocket-сообщений и просыпается примерно за минуту. Файловая система Free service эфемерна: изменения теряются при redeploy, restart или spin-down; persistent disk для Free service недоступен.

Источник: [Render Deploy for Free](https://render.com/docs/free).

## Архитектурный вывод

Для требования «без оплаты и без домашнего ПК» единственный реалистичный кандидат для настоящего 24/7 Minecraft-процесса — Oracle Cloud Always Free VM, при условии успешной регистрации, доступности capacity, принятия условий провайдера и открытия игровых TCP/UDP портов. Render Free следует оставить только для панели управления; размещать на нём Java/Bedrock процесс и миры небезопасно.

## Регистрация и риски Oracle

Oracle FAQ подтверждает, что Free Tier включает Always Free services, но доступность зависит от страны/региона и capacity limits. Для регистрации большинству пользователей нужны номер телефона и кредитная/дебетовая карта для проверки; Oracle указывает, что карта не списывается за Always Free ресурсы, однако это не означает абсолютную гарантию отсутствия будущих расходов при выходе за бесплатные лимиты или ручном переходе на платный аккаунт.

Источник: [Oracle Cloud Free Tier FAQ](https://www.oracle.com/cloud/free/faq/).

Следствие для CraftPanel: перед автоматическим provisioning пользователь должен сам создать/подтвердить Oracle tenancy и предоставить только необходимые runtime secrets. Нельзя обещать гарантированную доступность Always Free VM или полностью безкарточную регистрацию.

## Альтернатива без Oracle: managed free hosting

Aternos официально позволяет бесплатно создать Java или Bedrock сервер, запустить его вручную и получить адрес для подключения. В проверенной документации не найден публичный API для lifecycle, console, files или telemetry; найденный community API не является официальным контрактом. Поэтому прямое безопасное подключение CraftPanel к Aternos нельзя обещать.

Falix официально предлагает free Minecraft hosting без карты и с поддержкой модов/плагинов. В официальном Falix Public API Reference подтверждены API v2, API keys/scopes, операции серверов, Power, Console, Files, Monitor и Webhooks. Webhooks поддерживают lifecycle события (`server.started`, `server.stopped`, `server.crashed`, `server.idle`), игроков и resource alerts; запросы подписываются HMAC-SHA256. Это делает Falix наиболее совместимым кандидатом для CraftPanel, но потребуется пользовательский Falix аккаунт, созданный server и API key с минимальными scopes.

Источники: [Aternos free server guide](https://support.aternos.org/hc/en-us/articles/12165605063325-Creating-a-free-Minecraft-server-with-Aternos), [Falix free hosting](https://falixnodes.net/free-minecraft-server-hosting), [Falix Public API Reference](https://client.falixnodes.net/profile/apidocs).

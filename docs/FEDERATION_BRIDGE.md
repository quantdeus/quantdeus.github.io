# Мост QuantDeus v0.1 — GitHub ↔ WordPress ↔ Cloudflare

Дата директивы CEO: 2026-11-04. **Разморозка разработки**, не разрешение на автоматическую публикацию.

## Что подтверждено

| Контур | Подтверждено | Пока НЕ подтверждено |
| --- | --- | --- |
| WordPress | quantdeus.ru; Jetpack MCP доступен; WP Git Sync 0.1.2 активен; страницы и посты читаются через WordPress MCP | PAT, репозиторий, ветка, направление реальной синхронизации, настройки отката |
| GitHub | основная кодовая база quantdeus/quantdeus.github.io; директивы QDRP в Issues #579 и #106 | включённый внешний шлюз выдачи репутационных прав |
| Cloudflare | обнаружены 9 Worker-сервисов; quantdeus-seven-bridge имеет SERVICE binding METAVERSE на quantdeus-galactic-metaverse | испытанный Cloudflare→GitHub dispatch, идентичности и рейтинги агентов |
| Metaverse | quantdeus-galactic-metaverse имеет привязку D1 и зафиксированный deployment | исправность игрового прототипа и его end-to-end QA |

Имя Cloudflare Worker не подтверждает независимую личность агента, а факт привязки не доказывает успешного обмена задачами.

## Создано в отдельной ветке

- coordination/federation-bridge.json: технический манифест подтверждённых связей и явно непроверенных функций.
- scripts/quantdeus-federation-bridge.mjs: делает только GET-запросы к публичным WordPress posts/pages, до 25 метаданных на тип. Не берёт тела страниц, черновики, пользователей, формы, заказы или секреты.
- evaluateQdrp(): функция принятия решения для staging с подписанным HMAC подтверждением от независимого издателя; срок жизни не более 15 минут; проверка CI, отката, Tuvok + Data, минимальной репутации, branch, exact resource scope.
- scripts/tests/federation-bridge.test.mjs: тесты разрешений и отказов, защиты от самоповышения, проверки публичных данных.
- .github/workflows/federation-bridge.yml: CI на pull request с read-only token; вручную после слияния возможен просмотр WordPress через временный artifact без публикации.

**Ни одна из этих частей не подключает agent runtime к защищённому шлюзу автоматически.** Реальная выдача токенов/прав по QDRP возможна только после независимой интеграции этого контроля в каждое выполняющее изменения действие.

## Тестовый порядок подключения

1. Владелец WordPress проверяет в WP Git Sync target repo, branch, sync direction, allowed post types. Не копируйте PAT в Issue, PR или чат. Эти настройки отсутствуют среди доступных WordPress MCP методов и здесь не проверены.
2. Создать отдельный неконфиденциальный test-post/staging slot. Провести dry-run sync, убедиться, что этот процесс не пишет в production.
3. Cloudflare Seven bridge может передавать только подписанные статусы/задачи в брокер — без root-токенов WordPress или GitHub. Нужен отдельный ограниченный маршрут/credential, provenance и replay-protection; его пока не настроили.
4. Агент с независимо подтверждёнными 60+ баллами может предлагать исправления сайта в отдельной ветке; Data и Tuvok независимо подтверждают CI/security. Никакого auto-merge.
5. Любое изменение опубликованного WordPress требует отдельного решения CEO именно для этого изменения, подтверждённой резервной копии и проверенного отката.

## Локальная проверка

Node 20+:

    node --test scripts/tests/federation-bridge.test.mjs
    node scripts/quantdeus-federation-bridge.mjs inventory
    node scripts/quantdeus-federation-bridge.mjs snapshot --out /tmp/quantdeus-federation-snapshot.json

WordPress публичный REST API может быть недоступен конкретному runner: в таком случае статус записи — UNVERIFIED; это не успех синхронизации.

## Защитные границы

Запрещены: экспорт личных данных в публичные репозитории, прямые админские PAT у агентов, self-scoring, авто-публикация, автоматические правки Cloudflare Worker/DNS/WordPress без отдельного разрешения, обход QA и отката.

Ссылки: https://github.com/quantdeus/quantdeus/issues/106; https://github.com/quantdeus/quantdeus.github.io/issues/579; https://github.com/quantdeus/quantdeus.github.io/issues/421.

## Контроль живого моста — 5 ноября 2026

### Что реально введено
- Отдельный Cloudflare Worker quantdeus-federation-staging развёрнут; workers.dev subdomain включён. Это отдельный read-only сервис.
- Служебные привязки к quantdeus-seven-bridge (SEVEN) и quantdeus-galactic-metaverse (METAVERSE).
- Реальные ответы в GitHub Actions: Seven HTTP 200, Metaverse HTTP 200.
- Прямой Cloudflare Worker → WordPress в успешном прогоне не сработал. GitHub Runner отдельно проверил публичный Jetpack API: https://public-api.wordpress.com/rest/v1.1/sites/quantdeus.ru/posts/ — HTTP 200.
- Workflow .github/workflows/federation-watch.yml: один запуск в сутки в 06:18 UTC (09:18 MSK), read-only, сохраняет временный отчёт, на сбой отвечает красным статусом.
- Коммит c2a673dd5d5caf7be646c301386b5896e32c8c0e: пять проверок зелёные, включая живой мониторинг.
- Разовый снимок: 9 опубликованных записей, 71 опубликованная страница, у всех 80 password_protected=false.

### Важное различие
Мониторинг трёх систем и разовый снимок публичных WordPress-метаданных в GitHub **работают**.
Обратная публикация через WP Git Sync, подписанный Cloudflare→GitHub dispatch для изменяющих действий и реальная выдача полномочий по репутации **ещё не включены**.

### Приёмочный статус
- Сделано: Cloudflare Workers → Federation Staging Worker → GitHub monitor; GitHub → Jetpack public API; WordPress MCP → GitHub staging snapshot; тестовые QDRP ограничения.
- Требует отдельных настроек: WP Git Sync repo/branch/direction, независимый capability broker, GitHub App/Webhook с ограниченными правами, WordPress staging и откат.
- Публикация на действующем quantdeus.ru требует отдельного решения CEO для конкретного изменения.
- Никаких постоянных админских токенов, копирования личных данных или самоповышения репутации.

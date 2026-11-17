# QuantDeus: бесплатный OpenRouter для 29 ролей + Cloudflare AI Gateway

Дата: 17 ноября 2026. Статус: **изменения в draft PR, без подтверждённой генерации, без переключения production**.

## Одно обязательное действие владельца

В каноническом GitHub-репозитории `quantdeus/quantdeus.github.io` добавить **Settings → Secrets and variables → Actions → New repository secret**:

- Name: `OPENROUTER_API_KEY`
- Secret: приватный ключ из https://openrouter.ai/settings/keys

Не публиковать значение ключа в Issues, PR, комментариях, файлах, Workflow YAML и чатах. Других обязательных секретов для **прямого** OpenRouter-маршрута GitHub Actions нет.

## Что реализовано в PR

- `scripts/cloud-llm-client.js`: общий серверный текстовый клиент OpenRouter, допускающий только `openrouter/free` либо модель с суффиксом `:free`. Любая другая модель принудительно заменяется `openrouter/free`. Ошибки 402 и 429 не вызывают переход на платную модель.
- `scripts/site-agent-reply.js`: ответы в GitHub-комнатах QuantDeus, использующие GitHub Actions secret и общий бесплатный клиент.
- `scripts/telegram-bot.js`: `/agent <id> <запрос>` и автоматический выбор роли получают текстовый запасной маршрут, если доверенный OpenClaw недоступен. Защита входа/выхода сохраняется. Команды с инструментами, GitHub/WordPress writes, admin задачи не исполняются через этот маршрут.
- `scripts/mirror-swarm-client.js`: только из доверенного GitHub Actions workflow передаёт OpenRouter secret на Vercel Mirror по HTTPS вместе с отдельным GitHub OIDC. Vercel сначала проверяет OIDC, затем принимает временный ключ; не записывает его в файлы или логи. **Когда ключ передан, Mirror Swarm видит только `openrouter/free` и не использует остальные провайдеры.** Оставшийся сторонний конфигурационный режим Vercel без переданного ключа работает по прежним настройкам.
- `vercel-dispatcher/lib/mirror-model-router.js`: опциональный Cloudflare Gateway, приоритетный или исключительный OpenRouter.
- `.github/workflows/openrouter-free-fleet.yml`: проверки на PR без реального API и одна реальная тестовая генерация в день для одной роли после слияния в `main`. Можно вызвать вручную с `agent_id`.
- `scripts/qa/cloud-llm-client.test.js` и `vercel-dispatcher/tests/mirror-model-router.test.mjs`: тесты на отсутствие платных моделей и обработку ошибок.

## Опционально: Cloudflare AI Gateway

В подключённом аккаунте Cloudflare создан шлюз `quantdeus-openrouter` с включённой авторизацией, BYOK-only, отключённым логированием, отключённым кэшем и лимитом 20 запросов в минуту.

Для маршрута **через Cloudflare**, а не напрямую, добавить в тот же GitHub Actions Secrets ещё один секрет:

- `CLOUDFLARE_AI_GATEWAY_TOKEN`: токен для заголовка `cf-aig-authorization`.

Обычный GitHub Actions workflow уже задаёт `CLOUDFLARE_ACCOUNT_ID` и `CLOUDFLARE_AI_GATEWAY_ID`. Если второй секрет отсутствует, запрос автоматически идёт **напрямую** `https://openrouter.ai/api/v1/chat/completions`. Иначе используется Cloudflare `/openrouter/v1/chat/completions` (проверить действительный endpoint реальным smoke).

Секреты GitHub Actions автоматически **не появляются** в Vercel и Cloudflare. У Vercel Mirror есть отдельный защищённый OIDC-маршрут, который принимает ключ только из GitHub Actions запроса. Для других runtime secret требуется настроить отдельно.

## Ограничения

Бесплатные модели OpenRouter ограничены примерно 50 запросами/сутки и 20 запросами/минуту для аккаунта без покупки кредитов; при выполнении условий OpenRouter лимит повышается до 1000/сутки. Квота является общей для аккаунта, **не на каждого агента**.

- https://openrouter.ai/collections/free-models
- https://openrouter.ai/pricing
- https://developers.cloudflare.com/ai-gateway/usage/providers/openrouter/

29 агентов в реестре = 29 ролей/профилей, а не 29 отдельных бесплатных квот. Cloudflare и GitHub сами по себе не создают безлимитный AI-инференс. Маршрут `openrouter/free` не заменяет OpenClaw с доверенными GitHub MCP и браузерными инструментами. Не включать через него автоматический штатный агентский cron с привилегированными инструментами.

## Приёмка

1. Добавить `OPENROUTER_API_KEY` в **Actions Secrets**.
2. Проверить draft PR и CI: синтаксис JS, mock-юнит-тесты, отсутствие secrets в diff.
3. После QA/review и разрешённого слияния запустить workflow `QuantDeus Free OpenRouter Fleet 🐒` вручную (один агент) либо дождаться его запланированной ежедневной проверки.
4. Реальный workflow должен получить точный текст `QD_AGENT_SMOKE_OK`; иначе считаем маршрут не подтверждённым.
5. Убедиться в OpenRouter Activity, что использовалась бесплатная модель, а стоимость равна нулю.
6. Проверить `/agent seven-of-nine` через Telegram и обычный агентский комментарий GitHub. Отдельно проверить 402/429 и отсутствие платных fallback.
7. Только затем объявлять текстовый контур активным. Доверенный OpenClaw и его 29 профилей проверять отдельно, в том числе PR #594 с конфликтами.

При любых ошибках итог **BLOCKED/FAILED**, не ложный SUCCESS.

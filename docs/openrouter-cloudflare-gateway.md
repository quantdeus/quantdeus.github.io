# QuantDeus: OpenRouter через Cloudflare AI Gateway

**Статус:** шлюз Cloudflare `quantdeus-openrouter` создан 17.11.2026; настройки подготовлены в отдельном PR. Пока нет подтверждения успешного inference-запроса и подключения всех 29 агентов. Production не переключён.

## Что создано в Cloudflare

- AI Gateway ID: `quantdeus-openrouter`
- Авторизация: включена (`authentication=true`)
- Только собственные ключи провайдеров (`byok_only=true`), без перехода на биллинг Cloudflare Unified Billing
- Лимит шлюза: 20 запросов за 60 секунд
- Хранение логов запросов: отключено
- Кэширование ответов: отключено

Cloudflare нативно поддерживает OpenRouter:
https://developers.cloudflare.com/ai-gateway/usage/providers/openrouter/

## Режим без расходов на платные модели

На серверной стороне, в секретах окружения Vercel для Mirror Swarm, установить:

```dotenv
OPENROUTER_API_KEY=<секрет OpenRouter>
OPENROUTER_MODEL=openrouter/free
QD_OPENROUTER_FREE_ONLY=true
QD_OPENROUTER_ONLY=true
QD_OPENROUTER_PREFERRED=true

CLOUDFLARE_ACCOUNT_ID=<ID аккаунта Cloudflare>
CLOUDFLARE_AI_GATEWAY_ID=quantdeus-openrouter
CLOUDFLARE_AI_GATEWAY_TOKEN=<секрет авторизации AI Gateway>
```

**Никогда не коммитить реальные ключи и не добавлять их в браузерный JavaScript.**

- `QD_OPENROUTER_FREE_ONLY=true` принудительно заменяет модель без суффикса `:free` на `openrouter/free`. Само `openrouter/free` допускается.
- `QD_OPENROUTER_ONLY=true` исключает остальные провайдеры из **Mirror Swarm**: после исчерпания бесплатного лимита процесс завершается ошибкой, без скрытого обращения к платной модели.
- `QD_OPENROUTER_PREFERRED=true` поднимает OpenRouter выше остальных провайдеров, только если строгий режим `OPENROUTER_ONLY` не включён.
- Когда указан account ID, gateway ID и gateway token, запрос идёт через Cloudflare AI Gateway. При отсутствии полного набора данных используется прямой маршрут OpenRouter; дополнительная авторизация Cloudflare не выполняется.
- `CLOUDFLARE_AI_GATEWAY_TOKEN` — отдельный секрет для авторизации запросов **к шлюзу**; `OPENROUTER_API_KEY` — секрет OpenRouter для upstream-провайдера. Требуются оба ключа для защищённого Cloudflare-маршрута.

## Фактические лимиты OpenRouter (проверено 17.11.2026)

Модели с суффиксом `:free` и маршрутизатор `openrouter/free` имеют бесплатный инференс, но общую квоту: обычно 50 запросов/сутки и 20 запросов/минуту для аккаунта без покупки кредитов. После покупки OpenRouter-кредитов на $10 лимит бесплатных вариантов повышается до 1000 запросов/сутки, но покупка для этого сценария **не требуется и не выполняется**. Не нужно автоматически покупать кредиты, обходить лимиты аккаунтами или продолжать запросы после HTTP 429.

Источники:
- https://openrouter.ai/collections/free-models
- https://openrouter.ai/pricing

## Область изменений

Эта ветка изменяет только независимый маршрут `vercel-dispatcher/lib/mirror-model-router.js` и его тесты. Она не заменяет доверенный OpenClaw с инструментами и не активирует автоматически весь 29-агентный флот.

Отдельный PR #594 содержит реализацию текстового OpenRouter fallback для 29 агентов, но по состоянию проверки был **непригоден к прямому слиянию из-за конфликтов**. Для полного переключения роя нужно сначала проверить и восстановить этот путь, а затем сохранить ограничения доступа к инструментам (OIDC, RBAC, human approval, QA).

## Проверка перед включением

1. В Preview задать два API-секрета и указанные флаги режима.
2. Запустить `node --test vercel-dispatcher/tests/mirror-model-router.test.mjs`.
3. Проверить, что strict JSON health probe отвечает реально, не заглушкой.
4. Проверить негативные случаи: отсутствующий ключ, HTTP 402, HTTP 429, таймаут.
5. Сверить Cloudflare AI Gateway analytics и OpenRouter activity: стоимость $0, модель действительно бесплатная, ничего не списывается.
6. После ревью и CI решить, требуется ли интеграция в остальные execution lanes; не включать production автоматически.

При любой ошибке в строгом OpenRouter-only режиме лучше получить явный статус BLOCKED, чем молча перейти на платную модель.

# Galaxy Swarm: Gemma 4 26B A4B через Cloudflare Workers AI

**Модель:** `@cf/google/gemma-4-26b-a4b-it`  
**Статус:** маршрут подготовлен в коде, но выключен по умолчанию. Production не переключён.

## Почему Gemma 4

- MoE: 26B параметров всего, около 4B активных на проход.
- Окно контекста до 256K токенов по документации Cloudflare.
- Поддерживает reasoning, vision и function calling.
- Русский и другие языки поддерживаются; качество для конкретных задач QuantDeus нужно проверить тестовым набором.

Официальная карточка: https://developers.cloudflare.com/ai/models/%40cf/google/gemma-4-26b-a4b-it/

## Переменные окружения Vercel

- `QD_CLOUDFLARE_AI_ENABLED=true` — включать только после проверки доступа, лимитов и preview-тестов.
- `CLOUDFLARE_ACCOUNT_ID` — ID аккаунта Cloudflare.
- `CLOUDFLARE_API_TOKEN` — токен API для Workers AI; только server-side secret, никогда не публиковать в репозитории или браузере.
- `QD_CLOUDFLARE_AI_MODEL=@cf/google/gemma-4-26b-a4b-it` — необязательно; это модель по умолчанию.
- `CLOUDFLARE_AI_GATEWAY_ID` — необязательный ID AI Gateway.
- `QD_CLOUDFLARE_AI_TIMEOUT_MS=40000` — необязательный таймаут, ограниченный кодом максимумом 45 секунд.

Endpoint — OpenAI-compatible `/ai/v1/chat/completions`. Если Cloudflare вернёт ошибку или превысится таймаут, обработчик логирует краткий код ошибки и пытается использовать существующий Vercel AI Gateway. Маршрут включается только при точном значении `QD_CLOUDFLARE_AI_ENABLED=true`.

## Бесплатный лимит и стоимость

Workers AI Free предоставляет ограниченный суточный объём Neurons; это не означает неограниченные бесплатные запросы. Перед массовым запуском роя измерить расход на типовых задачах и сверить текущие лимиты/цены в Cloudflare Dashboard и карточке модели. Не включать автоматическую массовую нагрузку до проверки.

## Проверочный план

1. Настроить server-side secrets только в Vercel Preview.
2. Проверить короткий запрос к Gemma 4 и подтвердить фактическое поле `model` в ответе.
3. Проверить длинный русский запрос, отказ/ошибку провайдера и возврат к Vercel AI Gateway.
4. Проверить tool calling отдельно: этот bridge сейчас нормализует сообщения до `role` и `content`, поэтому сам по себе не передаёт структуру tool calls.
5. Замерить latency, успешность, токены/Neurons и ограничить частоту запросов.
6. Только после результатов решить, включать ли маршрут в production.

**Важно:** это меняет модель по умолчанию внутри выключенного Cloudflare-маршрута. Не переключает автоматически все независимые execution paths Galaxy Swarm и не включает Cloudflare-провайдера в production.

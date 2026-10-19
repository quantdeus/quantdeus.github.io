# Подключение Kimi K2.6 через Cloudflare Workers AI

**Статус:** историческая заметка. Основным рекомендуемым вариантом для нового подключения теперь является Gemma 4 26B A4B; см. [docs/galaxy-swarm-gemma-4.md](./galaxy-swarm-gemma-4.md). Kimi остаётся доступной как ручное переопределение через `QD_CLOUDFLARE_AI_MODEL`, но тест API от 2026-10-19 показал HTTP 403 / код 5035 на текущем Cloudflare Workers Free.

## Настройка Kimi (опционально)

В серверных переменных окружения Vercel задать:

- `QD_CLOUDFLARE_AI_ENABLED=true` — включить маршрут только после проверки доступности и лимитов.
- `CLOUDFLARE_ACCOUNT_ID` — ID аккаунта Cloudflare.
- `CLOUDFLARE_API_TOKEN` — токен API с минимальными правами для Workers AI; хранить только как secret.
- `QD_CLOUDFLARE_AI_MODEL=@cf/moonshotai/kimi-k2.6` — переопределить модель с Gemma 4 на Kimi.
- `CLOUDFLARE_AI_GATEWAY_ID` — необязательный ID AI Gateway.
- `QD_CLOUDFLARE_AI_TIMEOUT_MS=40000` — необязательный таймаут; код ограничивает его 45 секундами, чтобы оставить запас в лимите Vercel.

Запросы отправляются на OpenAI-совместимый Cloudflare endpoint `/ai/v1/chat/completions`. Если провайдер недоступен, код использует существующий Vercel AI Gateway как резервный маршрут. Секреты и текст запросов не записываются в диагностический лог.

До получения доступа не включать флаг: запросы будут падать в резервный маршрут, а Galaxy Swarm фактически не перейдёт на Kimi. После включения сначала проверить preview-деплой, фактический выбор модели, резервный маршрут и расходы. Не считать всех агентов переключёнными, пока не проверены остальные независимые execution paths и tool calling.

# Настройка Telegram-бота и входа на сайт

QuantDeus использует два интерфейса Telegram:

1. **Кнопка меню Mini App** → `https://quantdeus.github.io/telegram/`
2. **Вход на сайте** → Telegram Login / OIDC на `https://quantdeus.github.io/`

## Секрет репозитория

Создайте секрет GitHub Actions:

- `QUANTDEUS_TELEGRAM_BOT_TOKEN`

Не коммитьте и не вставляйте токен в файлы репозитория.

После создания секрета вручную запустите workflow **Set Telegram Mini App URL**. Он проверяет `getMe`, применяет `setChatMenuButton`, затем проверяет итоговый URL меню.

## Login Widget в BotFather

В @BotFather:

- выберите бота QuantDeus;
- откройте **Login Widget**;
- добавьте `https://quantdeus.github.io` в разрешённые URL / доверенные источники.

Публичный сайт загружает только несекретную идентификацию бота. Токен никогда не записывается в GitHub Pages.

## Поведение во время работы

- Внутри Telegram Mini App интерфейс использует контекст пользователя Telegram WebApp.
- В обычном браузере сайт показывает **Войти через Telegram** и использует Telegram Login OIDC.
- ID-токены браузерного OIDC проверяются по Telegram JWKS до отображения состояния `OIDC ✓`.
- Любое будущее привилегированное действие должно повторно проверять токен на стороне сервера.

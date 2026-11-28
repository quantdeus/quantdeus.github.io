# QuantDeus Webmail — Composio Gmail

## Что это

Небольшой **администраторский** WordPress-плагин, работающий с настоящим Gmail через **собственный Composio Developer Project**. Показывает входящие, открывает письма как безопасный текст; написание нового письма включается только явной серверной настройкой. Ни письмо, ни его текст не записываются в WordPress CMS или GitHub. Интерфейс в **WP Admin → QuantDeus Mail**, а не на публичной странице.

**Подключение Gmail к ChatGPT через Composio Connect не является доступом сайта к Gmail.** Отдельный Developer Project обязан получить собственную авторизацию владельца. Исходящий адрес будет тот, который выбран через Composio Google OAuth; не `info@quantdeus.ru`, если он не существует или не подтверждён как допустимый alias.

## Установка без панели GoogieHost

1. В WordPress открой `https://quantdeus.ru/wp-admin/plugin-install.php?tab=upload` и загрузи `quantdeus-composio-webmail.zip` (~12 КБ). Это устанавливает самостоятельный **приватный** плагин и не меняет опубликованные страницы.
2. Активируй плагин **из своего администраторского аккаунта WordPress**. При первом включении плагин привяжет владельца к ID активирующего администратора (никто другой не увидит письма). Если активировал не тот пользователь — не передавай ему Gmail-доступ: нужно выставить константу `QD_WEBMAIL_OWNER_USER_ID` в `wp-config.php` с верным WordPress ID.
3. Открой https://dashboard.composio.dev/ и создай *отдельный* проект `QuantDeus Webmail`, с проектным ключом с минимальными правами: **Session management (Write)** + **Session tool execution (Write)**. Для OAuth может понадобиться управление подключениями. Отключи необязательные toolkit permissions / Proxy Execute.
4. В WordPress → **QuantDeus Mail** вставь проектный API key в закрытую форму. Он шифруется AES-256-GCM с WordPress salts и не выводится обратно. Лучше хранить секреты через константы в `wp-config.php`, если появится доступ к панели хостинга.
5. Нажми **Подключить Gmail через Composio OAuth**, затем **Авторизовать Gmail в Composio**. Плагин сам создаст сессию с `gmail`-allowlist, только 4 нужными Gmail tools, и выдаст официальную ссылку OAuth для этого **developer project**. Подтверди доступ к *отдельному рабочему* Gmail для QuantDeus. Обнови страницу.
6. Проверь имя ящика и **только собственные тестовые письма**. Отправка заблокирована до настройки серверной константы `QD_WEBMAIL_ALLOW_SEND` = true; штатно плагин работает только на чтение. Кнопку отправки использовать только после проверки Google OAuth и адреса отправителя.

### Более защищённая настройка из wp-config.php (опционально)

```php
define('QD_WEBMAIL_OWNER_USER_ID', 123); // Реальный ID владельца WP, не угадывать
define('QD_WEBMAIL_COMPOSIO_API_KEY', 'ВАШ_API_KEY'); // Не хранить в GitHub
define('QD_WEBMAIL_COMPOSIO_SESSION_ID', 'trs_...'); // Можно оставить неуказанным до OAuth
// define('QD_WEBMAIL_ALLOW_SEND', true); // Только после реальных тестов и отдельного решения
```

Не храните секреты в плагине/репозитории. В случае резервного копирования WordPress БД и wp-config совместно условное шифрование ключа не заменяет защиту сервера. Сервер должен иметь доступ к `https://backend.composio.dev` по HTTPS.

## Принципиальные ограничения

- Пользователь Composio ChatGPT **не передаёт OAuth токен** WordPress; новый Composio Developer Project потребует повторного Google OAuth.
- Плагин не создаёт ящик `info@quantdeus.ru`; это доменная почта, которой пока нет. Gmail отправляет от имени своего разрешённого адреса.
- Отправка писем отключена по умолчанию. Нет рассылок, крона, массовых операций, вложений, HTML-рендеринга, синхронизации Groundhogg, автоматического доступа других администраторов.
- WP admins могут изменить код/опции плагина на уровне инфраструктуры; для действительно конфиденциальной переписки используйте отдельный защищённый бизнес-Gmail и ограничьте права на сайт.
- Код прошёл локальные unit/smoke тесты PHP, но **пока не развёрнут и не проверен end-to-end на рабочем WordPress**. Установка, серверная авторизация и рабочие письма требуют отдельных действий владельца.

## Официальный Composio API (v3.1)

- `POST https://backend.composio.dev/api/v3.1/tool_router/session` — создать ограниченную сессию.
- `POST https://backend.composio.dev/api/v3.1/tool_router/session/{id}/link` — официальный OAuth URL.
- `POST https://backend.composio.dev/api/v3.1/tool_router/session/{id}/execute` — исполнить только разрешённые Gmail tools.

Docs:
- https://docs.composio.dev/reference/api-reference/tool-router/postToolRouterSession
- https://docs.composio.dev/reference/api-reference/tool-router/postToolRouterSessionBySessionIdLink
- https://docs.composio.dev/reference/api-reference/tool-router/postToolRouterSessionBySessionIdExecute
- https://docs.composio.dev/reference/authenticating-to-composio/project-api-key-permissions

## Установочный архив (передан владельцу через ChatGPT)

- Имя: `quantdeus-composio-webmail.zip`
- SHA-256: `b0a80b9d2f85fda72d07d2b02d1d32cb018a4b2f4ea146898acef05c5995568d`
- Статус: архив и исходный PHP-код разработаны и проверены в локальном контейнере; по состоянию на 30.10.2026 **не установлен на WordPress**, **не загружен в GitHub**, письма не отправлены.
- Для установки требуется пользовательская загрузка ZIP через `wp-admin/plugin-install.php?tab=upload`, так как подключённый WordPress MCP не предоставляет действие для установки новых плагинов.
- Live QA #633 и проверка owner-only/Composio Developer OAuth остаются обязательными.

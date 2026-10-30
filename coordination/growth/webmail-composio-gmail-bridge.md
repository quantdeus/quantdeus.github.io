# QuantDeus Webmail — Gmail через Composio (выбранный путь, 30.10.2026)

**Статус: ChatGPT Composio OAuth ACTIVE; WordPress bridge NOT DEPLOYED.**

## Что подтверждено фактически (без чтения писем)

- Пользователь завершил OAuth Gmail в **Composio Connect**. `COMPOSIO_MANAGE_CONNECTIONS(list)` показал ровно одну PRIVATE ACTIVE Gmail connection с alias `quantdeus`.
- `GMAIL_GET_PROFILE(me)` возвратил успешный профиль; значит API-соединение реально доступно через текущий Composio Connect.
- `GMAIL_LIST_SEND_AS(me)` показал только основной адрес `@gmail.com`. **Адрес `info@quantdeus.ru` не зарегистрирован как Gmail send-as alias, и его mailbox не создан.** Персональный Gmail адрес и имя пользователя **намеренно не записаны в публичный репозиторий**.
- **НЕ было:** чтения содержимого писем, отправки, новых писем, создания labels, DNS изменений, правок продакшн WordPress или Composio project setup.

## Архитектура / разграничение прав

```
Composio Connect — PRIVATE Gmail account ───> агент QuantDeus (ChatGPT)
                                         `→ profile / labels / drafts / send (по согласию)

Будущая webmail-панель:
WordPress wp-admin [только владелец, HTTPS, WP capability + nonce]
  -> серверный REST endpoint / Cloudflare Worker backend (owner-auth, rate limit, audit)
  -> отдельный **Composio Developer Project** и ограниченная session с инструментами Gmail
  -> Gmail API (Composio keeps OAuth tokens, not WordPress)
  -> sanitized inbox metadata and mail bodies to authorized owner only
```

**Критическое ограничение:** Composio Connect consumer connection из этого чата — PRIVATE и принадлежит пользовательскому Connect-профилю. Она **не равна** автоматически авторизации для иного Composio Developer Project/API key или WordPress. Нельзя извлечь OAuth access/refresh tokens; нужен либо подтверждённый контролируемый в Connect той же личностью серверный доступ с соответствующим consumer key (риск широких прав, не рекомендуется), либо, **предпочтительно**, отдельный Project в Composio с Gmail OAuth пользователя, привязанным к серверу через stable app user ID. Мост НЕ ДОЛЖЕН пытаться использовать ChatGPT account token.

## Минимальная реализация без риска утечки

1. В Composio создать Developer Project с **scoped Project API key**. Не публиковать ключ в GitHub/WordPress страницах; хранить в Cloudflare Worker secret или в секретах приватного backend. Grants минимальные: session management/tool execution, без Proxy Execute без надобности. Узнать, допускает ли бюджет/политика выбранный способ.
2. В проекте OAuth авторизовать *выбранный владельцем* Gmail (рекомендуется отдельный рабочий account, не личный inbox) через официальную Composio Connect Link для app. Использовать stable WP-user-id, подтверждать callback identity.
3. Backend допускает инструменты **только** для read profile, list labels, fetch inbox в режиме metadata/limited, get single message on explicit owner click; send/create draft — отдельным действием после явного действия владельца. Ограничить account ID, tool allow-list и avoid automatic send. No unknown tools or broader scopes.
4. WordPress admin-only UI: inbox list, unread badge, details, reply/draft; `manage_options` (or even narrower capability assigned only to owner), REST permission_callback + nonce, explicit auth; escape/sanitize displayed headers, disable auto remote images and HTML script execution. Не сохранять письма в публичных WP posts/CMS/options/transients/cache; не передавать письма в логирование GitHub или стороннюю аналитику.
5. Отдельно от Groundhogg / SMTP Mailer: Gmail API transport не требует настройки SMTP Mailer, и нельзя перенаправлять маркетинговые рассылки через личный Gmail без отдельного согласия / лимитов / unsubscribe.
6. Test gates: backend secret exists and scoped; Google OAuth ACTIVE in **developer project**; check identity + aliases; preview metadata of a test email without body leak; read one own test message; send ONE test to owner's own address only when approved; confirm received; QA approval; then consider stage deploy. Запрещено по умолчанию: importing 1043 existing emails into WordPress, automated sends, public webmail URL and sharing email to collaborators.

## Про адрес info@quantdeus.ru

Подключение `@gmail.com` не создаёт почтовый ящик домена и не подтверждает его владение. Для `info@quantdeus.ru` по-прежнему нужна реальная почтовая служба/доставка MX либо Google Workspace домена. Gmail Send As alias без владения доменным адресом не использовать. Пока рабочий фактический транспорт — подключённый Gmail, а `info@quantdeus.ru` остаётся зарезервированным брендовым именем.

## Документация

- https://docs.composio.dev/docs/composio-connect
- https://docs.composio.dev/kb/guide/consumer-project-boundaries-and-auth-selection
- https://docs.composio.dev/docs/authentication
- https://docs.composio.dev/docs/sessions-via-mcp
- https://support.google.com/mail/answer/22370
- https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.settings.sendAs

## Альтернативный плагин

`PressedMail` из базовой части PR #646 работает через **IMAP/SMTP mailbox** и не понимает Composio Gmail API. Он НЕ нужен для варианта Composio Gmail API. Сохранён только как optional fallback, не устанавливать в production до нового решения. Первоначальный Playground CI проверяет пакет, а не реальную работу.

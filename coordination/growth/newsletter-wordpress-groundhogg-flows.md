# QuantDeus — четыре Groundhogg потока в WordPress (staging deployment contract)

**Статус:** конфигурационный рецепт, не импортируемый JSON и не активная WordPress-интеграция. Плагины на production не установлены; WP-черновик №218 создан, но формы и подписчиков в нём нет.

## Границы компонентов

- **Groundhogg:** получение контакта через встроенную Web Form, согласие, подтверждение, сегмент, очереди и письма. Не принимать заявки GitHub Issue за согласие на маркетинг.
- **SMTP Mailer:** внешний подключаемый SMTP/API транспорт через `wp_mail`, реальную совместимость подтвердить тестом; без сервиса отправки не включать.
- **GitHub Actions:** только синтетические тесты; никогда не получает email контактов и не запускает живую очередь.
- **WordPress:** черновик `/newsletter/`, ID=218, без `gh_form` до появления настоящего ID.

## Контрольные настройки Groundhogg (staging)

1. Groundhogg → Settings → Compliance: Only send to confirmed = true, Email confirmation grace period = 0, Enable GDPR features = true, Do not send email without consent = true.
2. Enable one-click unsubscribe и рабочий центр управления предпочтениями; проверить, что отписка реально подавляет будущие письма.
3. Встроенная **Web Form**: обязательный email, **одна** тема из `eco|books|ai|media`, непредустановленный checkbox с текстом информированного согласия и действующей ссылкой на Privacy Policy. До окончания E2E не подключать к посетителям.
4. После отправки формы: статус pending/unconfirmed; разрешено только **транзакционное** письмо с `{confirmation_link}` и пояснением, зачем человек получил письмо. Никаких продаж до подтверждения.
5. Дождаться **Opt-in Status Confirmed** benchmark, проверить consent отдельно. Только затем тег выбранной темы и переход в соответствующий nurture flow. Статусы unsubscribed, bounced, complained, spam, suppressed — исключать.
6. Пока общая недельная частота не доказана end-to-end, ограничить контакт **одной активной темой и одним nurture flow**. Блокировать повторные входы/триггеры, никакие автоматические пересылки между потоками.

## Карта четырёх потоков

| Сегмент | Подтверждение | День 0 | День 7 | День 14 |
|---|---|---|---|---|
| `eco` | подтверждение email | `eco-welcome` | `eco-vision` | `eco-research` |
| `books` | подтверждение email | `books-welcome` | `books-ideas` | — |
| `ai` | подтверждение email | `ai-welcome` | `ai-usecase` | `ai-inquiry` (добровольно) |
| `media` | подтверждение email | `media-welcome` | `media-news` | — |

Источники субъектов, CTA и материалы:
- `coordination/growth/newsletter-autofunnels.json`
- `coordination/growth/newsletter-message-drafts.json`

Перед переносом текста в Groundhogg проверить реальную тему письма и конечный URL; не заявлять, что «PDF доступен», пока фактическая ссылка не проверена. В письмах использовать **настоящие ссылки отписки из Groundhogg**, а не буквальные `{{unsubscribe_url}}` — это условные плейсхолдеры в исходных черновиках, **не** коды Groundhogg.

## Обязательные тесты для staging

- Отправка формы без согласия запрещена; unconfirmed получает **только** DOI confirmation, не nurture.
- Подтверждённый контакт с одной темой получает ровно одно приветственное письмо; на повторные webhook/cron/перезагрузку формы дублей нет.
- Сменивший тему не получает две маркетинговые рассылки в интервале 7 суток.
- Unsubscribed/suppressed не получает писем даже после повторного импорта/изменения темы.
- Email контент/лог не публикуется в GitHub и не содержит персональных данных в публичных артефактах.
- SPF/DKIM/DMARC, sender identity и SMTP provider проверяются отдельно.
- Проверка реального `gh-cron.php`/WordPress server cron (рекомендуемый интервал провайдера — около 1 минуты), исключить вторую очередь GitHub.
- WordPress privacy policy #3 опубликована и доступна без авторизации; рабочий `[gh_form ...]` встроен в #218 **лишь после** настоящего shortcode из установленного Groundhogg.

## Go-live gate

Нужны зелёные QA, staging E2E, выбранный и подключённый отправитель, действующая политика, явное согласие владельца на **отдельно** публикацию формы и **отдельно** реальную отправку. В случае любого недоказанного условия — оставлять черновик и `external_send_enabled=false`.

Официальные материалы: 
- https://help.groundhogg.io/article/42-ghform
- https://help.groundhogg.io/article/381-how-to-confirm-an-email-address
- https://help.groundhogg.io/article/719-settings
- https://help.groundhogg.io/article/601-contact-marketability-explained
- https://groundhogg.io/doc/cron-jobs/
- https://wordpress.org/plugins/smtp-mailer/

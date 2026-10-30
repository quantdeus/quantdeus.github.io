# QuantDeus Webmail — принятый вариант А (WordPress IMAP/SMTP)

**Дата:** 30.10.2026. **Статус:** staging design / installation smoke only. **НЕ НАСТРОЕН** настоящий корпоративный почтовый ящик. Продуктивная почта не подключена.

## Задача владельца

Настоящая входящая и исходящая почта `info@quantdeus.ru` в WordPress-панели. Не внутренний WordPress messenger и не CRM-имитация почты. Вариант А выбран владельцем. Сайт WordPress `https://quantdeus.ru`, фактически размещён на GoogieHost; его хостинговая панель временно недоступна. Домен обслуживается отдельно в Timeweb.

## Фактически подтверждённая инфраструктура

- Live WordPress: 7.1.4, PHP 8.3.36, MariaDB 10.11.19, HTTPS — совместимо с published requirements PressedMail (WP >= 6.6, PHP >= 8.2, MariaDB >= 10.2 с InnoDB usermeta/locks). **Доступность нужных внешних IMAP/SMTP портов из GoogieHost НЕ проверена**.
- WordPress MCP установленные плагины: Groundhogg 4.10 ACTIVE; SMTP Mailer 1.1.28 ACTIVE; miniOrange MCP ACTIVE. PressedMail **не установлен** на момент проверки.
- Корпоративный адрес `info@quantdeus.ru` выбран как главный брендовый адрес, **но существование ящика не подтверждено**, нет IMAP/SMTP реквизитов, логина и проверенной доставки.
- WP-MCP показывает установленные плагины, активирует их, но не устанавливает новые. Нельзя выдавать GitHub/Playground smoke за установку на production.

## Целевая архитектура

```text
Внешняя почта для quantdeus.ru [настоящий mailbox]
              │ IMAP 993/TLS    │ SMTP 587/STARTTLS (провайдер может выбрать другие)
              ▼                 ▼
     PressedMail FREE в личном wp-admin владельца
              │
              ├── Входящие / Отправленные / Черновики / Папки
              └── Почтовые ответы владельца, вложения и поиск

Groundhogg (CRM, рассылки) ──> SMTP Mailer ──> одобренный SMTP-провайдер
                [отдельная очередь и согласие]
```

**PressedMail FREE**: 1 IMAP/SMTP mailbox на WordPress сайт. Пользовательское письмо и письма сайта — не одно и то же. Не включать в PressedMail «WordPress Email» одновременно с SMTP Mailer без отдельной проверки: два SMTP-плагина не должны конфликтовать на `wp_mail`.

## Реальный порядок настройки

1. **Почтовый провайдер:** получить/создать настоящий `info@quantdeus.ru` с доступами IMAP и SMTP, проверить в его внешнем webmail. Наличие «Timeweb Mail» в DNS-меню не доказывает создание mailbox. Если только домен в Timeweb без почтового тарифа, услугу нужно проверить отдельно. Никаких оплат без согласия владельца.
2. **DNS:** проверить текущие MX/TXT (SPF, DKIM, DMARC), сохранить существующие значения; при настройке провайдера менять *только* почтовые записи и лишь после backup/проверки MX. Не менять записи сайта и nameservers без надобности.
3. **Защитить WordPress:** резервная копия БД и файлов, отдельный admin/user с 2FA, HTTPS, аудит пользователей с повышенными правами, проверить диск/ресурсы GoogieHost и может ли он соединяться с портами IMAP/SMTP.
4. **Безопасный staging:** установить официальный `PressedMail` из WordPress.org на MariaDB/MySQL staging, проверить активацию с Groundhogg и SMTP Mailer; GitHub Playground smoke тестирует *только установку*, потому что Playground SQLite, и не заменяет MariaDB E2E.
5. **Production только после QA и владельца:** в WP admin: «Плагины → Добавить новый → PressedMail → Установить → Активировать». Открыть **PressedMail → Settings → Email Connections → Add Account → Custom Email**, указать `info@quantdeus.ru`, display name `QuantDeus`, фактические IMAP и SMTP hostnames и учётные данные провайдера. Данные вводятся только в WP, не в GitHub/чат/Issues.
6. **Тест:** Test Connection; прочитать письмо с другого своего ящика; отправить одно письмо на другой собственный адрес и проверить ответ. Успех SMTP-отправки не означает факт доставки, нужна проверка получателем.
7. **Доступ/приватность:** оставить inbox доступным только владельцу mailbox, не создавать публичный `/webmail/` endpoint и не вставлять форму webmail на публичные страницы; remote images off, убрать по желанию локальное кэширование тела писем; хост и резервные копии защищать — PressedMail хранит метаданные/возможно содержимое писем в БД WP.
8. **Связь с CRM:** сохраняем текущий SMTP Mailer, Groundhogg и собственный черновик /newsletter/ #218 независимыми до отдельной готовности реальных рассылок и policy #3. Не импортировать личную переписку в CRM автоматически.

## Что НЕ подтверждено

- почтовый ящик, MX ownership, действующий логин и пароль, SMTP/IMAP endpoints и доступ портов с GoogieHost;
- оплаченный почтовый сервис; публичный веб-интерфейс; корректная обработка писем от провайдера;
- исправная доставка, совместимость PressedMail на live-хосте, staging E2E;
- настройки SPF/DKIM/DMARC, разрешение отправлять массовые письма.

## Полезные официальные инструкции

- https://wordpress.org/plugins/pressedmail/
- https://pressedmail.com/docs/install-and-quickstart
- https://pressedmail.com/docs/custom-imap-smtp
- https://pressedmail.com/docs/where-your-mail-lives
- https://timeweb.com/ru/docs/pochta/tarif-pochtovyj/ — отдельная почта **95 ₽/мес** при помесячной оплате, если нет платного Timeweb хостинга; не подключать автоматически.

## Реальный результат первого CI и корректировка теста

Первый запуск установки с `activate=true` в WordPress Playground был **FAILED**. Установочный экран самого PressedMail отказал в активации с причиной: `Your site is running on ... mysql-on-sqlite ... SQLite and WordPress Playground are not supported.` Это предсказанное ограничение пакета; никакие проверки PressedMail не отключены. Запуск: https://github.com/quantdeus/quantdeus.github.io/actions/runs/41107956827 .

В новом Playground smoke пакет скачивается и распаковывается, но остаётся **inactive** (`activate=false`). Проверяется файл плагина и SQLite, а не пригодность почтового клиента к запуску. Для **полноценной** проверки нужен MariaDB/MySQL staging. Нельзя считать этот тест green свидетельством активного почтового клиента.

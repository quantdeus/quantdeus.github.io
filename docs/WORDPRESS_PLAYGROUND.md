# QuantDeus WordPress в GitHub Pages

Рабочий маршрут: `/wordpress/`.

Это **WordPress Playground**, а не обычная серверная установка WordPress с PHP/MySQL.

- WordPress и PHP выполняются в браузере посетителя через WebAssembly.
- Стартовая страница размещена в GitHub Pages.
- Конфигурация находится в `wordpress/blueprint.json`.
- Сохранение в браузере обеспечивается механизмом сохранённых сайтов WordPress Playground.
- GitHub Actions запускает тот же Blueprint через `@wp-playground/cli` и завершает сборку ошибкой, если WordPress не стартует.
- Обычный QuantDeus Store, Mini App и Центр координации работают независимо.

Полноценный многопользовательский production WordPress с общей серверной базой данных всё ещё требует PHP-хостинга. Текущий Playground подходит для локальной браузерной CMS, демонстраций, прототипирования, работы с темами/плагинами и экспериментов через GitHub.

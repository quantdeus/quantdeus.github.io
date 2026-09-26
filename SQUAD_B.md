# ⚒️ QuantDeus Octet Squad B — вторая исполнительная команда

Octet Squad B — **исполнительная команда, работающая от Issues**, для `quantdeus/quantdeus.github.io`.

Первая команда и Coordinator формируют и приоритизируют задачи. Squad B превращает одобренные задачи в реальные изменения репозитория через отдельную ветку и Pull Request.

## Конвейер из 8 агентов

1. 🔭 **Разведчик репозитория** (`scout`) — забирает Issue, манифест исполнения и контекст.
2. 🔬 **Проверяющий задачи** (`verifier`) — проверяет формат, пути и операции.
3. 📊 **Аналитик изменений** (`analyst`) — классифицирует область и риск.
4. 🧠 **Стратег исполнения** (`strategist`) — строит порядок выполнения и выбирает маршрут.
5. 🛡️ **Страж** (`guardian`) — проверяет правила управления и чувствительные зоны.
6. ⚒️ **Кузнец задач** (`tasksmith`) — меняет файлы, создаёт ветку, commit и push.
7. 🗄️ **Архивариус исполнения** (`archivist`) — пишет журнал в `coordination/executions/`.
8. 📣 **Вестник PR** (`herald`) — открывает PR либо оставляет handoff для Control Tower, обновляет метки и возвращает ссылку в Issue.

## Как поставить задачу

Issue должен иметь `coord:task` и `squad-b:ready`. В body нужен JSON-манифест:

```qd-exec
{
  "version": 1,
  "summary": "Коротко: что изменить",
  "operations": [
    {
      "op": "create",
      "path": "docs/example.md",
      "content": "# Пример\n"
    }
  ]
}
```

Поддерживаются технические операции `create`, `replace`, `append`. Удаление намеренно не поддерживается.

## Правила управления

- Прямой запуск разрешён владельцу репозитория, пользователям из `QUANTDEUS_ADMIN_GITHUB_USERS` или Issue с `governance:passed`.
- Изменения `.github/workflows/**`, governance-файлов и других чувствительных зон требуют `squad-b:privileged`.
- Squad B **никогда не сливает PR автоматически**.
- Секреты, `.git/**`, `.env*`, ключи и credential-файлы запрещены.
- Любое изменение проходит через ветку `squad-b/issue-<N>` и Pull Request.

## Состояния

`ready → active → review → done` или `blocked`.

Workflow: `.github/workflows/octet-squad.yml`.

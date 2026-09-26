# ⚒️ QuantDeus Octet Squad B — вторая команда исполнителей

Octet Squad B — **issue-driven execution crew** для `quantdeus/quantdeus.github.io`.
Первая команда/координатор формирует и приоритизирует задачи. Squad B превращает одобренные задачи в реальные изменения репозитория через отдельную ветку и Pull Request.

## Конвейер из 8 агентов

1. 🔭 **Repo Scout** — забирает Issue, манифест исполнения и контекст.
2. 🔬 **Task Verifier** — валидирует формат, пути и операции.
3. 📊 **Change Analyst** — классифицирует область и риск изменений.
4. 🧠 **Execution Strategist** — строит порядок выполнения и выбирает lane.
5. 🛡️ **Guardian** — проверяет governance и чувствительные зоны.
6. ⚒️ **Task Smith** — реально изменяет файлы, создаёт ветку, commit и push.
7. 🗄️ **Archivist** — добавляет журнал исполнения в `coordination/executions/`.
8. 📣 **Herald** — открывает PR, обновляет labels и оставляет ссылку в Issue.

## Как поставить задачу

Issue должен иметь `coord:task` и метку `squad-b:ready`. В body должен быть JSON-манифест:

```qd-exec
{
  "version": 1,
  "summary": "Коротко: что изменить",
  "operations": [
    {
      "op": "create",
      "path": "docs/example.md",
      "content": "# Example\n"
    },
    {
      "op": "replace",
      "path": "README.md",
      "find": "старый текст",
      "replace": "новый текст"
    },
    {
      "op": "append",
      "path": "docs/CHANGELOG.md",
      "content": "\n- новое изменение\n"
    }
  ]
}
```

Поддерживаются `create`, `replace`, `append`. Удаление файлов намеренно не поддерживается.

## Governance

- Прямой запуск задачи разрешён владельцу репозитория, пользователям из `QUANTDEUS_ADMIN_GITHUB_USERS` или Issue с `governance:passed`.
- Изменения `.github/workflows/**`, governance-файлов и других чувствительных зон требуют метку `squad-b:privileged`.
- Squad B **никогда не merge'ит PR автоматически**.
- Секреты, `.git/**`, `.env*`, ключи и credential-файлы запрещены.
- Любое изменение идёт через `squad-b/issue-<N>` и Pull Request.

## Состояния

`ready → active → review → done` или `blocked`.

Workflow: `.github/workflows/octet-squad.yml`.

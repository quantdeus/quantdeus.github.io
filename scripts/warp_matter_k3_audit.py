#!/usr/bin/env python3
"""Read-only archival quantum-result + literature-audit for BANANA LAB K3.

Only parses existing D1 export JSON and a source-linked literature catalog.
No qBraid calls, no qBraid calculations, no materials physics simulation,
no equipment control. Requires Python stdlib only.
"""
import argparse
from collections import Counter
import json
from pathlib import Path
import sys

# Also works when invoked as python scripts/warp_matter_k3_audit.py
sys.path.insert(0, str(Path(__file__).resolve().parent))
from warp_matter_archive_parser import analyze_document

CATEGORIES = {"measured", "theory", "review", "database"}
REQUIRED = {
    "id", "title", "kind", "evidence_level", "reference_url",
    "observable", "geometry_status", "potential_application",
    "ftl_validation", "manufacturing_status",
}


def audit(export, literature):
    records = analyze_document(export)["records"]
    if not records:
        raise ValueError("Empty qBraid archive")
    missions = [r.get("mission") for r in records]
    if None in missions or len(missions) != len(set(missions)):
        raise ValueError("Archive has missing or duplicate mission identifiers")
    leads = literature.get("leads")
    if not isinstance(leads, list) or not leads:
        raise ValueError("Literature leads missing")
    ids = set()
    for lead in leads:
        missing = REQUIRED - lead.keys()
        if missing:
            raise ValueError(f"Lead {lead.get('id','?')} is missing: {sorted(missing)}")
        if lead["id"] in ids:
            raise ValueError(f"Duplicate literature ID: {lead['id']}")
        ids.add(lead["id"])
        if lead["evidence_level"] not in CATEGORIES:
            raise ValueError(f"Invalid evidence level for {lead['id']}")
        if not lead["reference_url"].startswith("https://"):
            raise ValueError(f"Non-HTTPS source for {lead['id']}")
        if lead["ftl_validation"] != "none":
            raise ValueError("Unverified FTL claim needs independent human review")
    return records, leads


def render_report(export, literature):
    rows, leads = audit(export, literature)
    counts = Counter(r["classification"] for r in rows)
    lines = [
        "# QuantDeus BANANA LAB — архивный аудит qBraid и материалов",
        "",
        "**Метод:** Python stdlib, только чтение ранее полученных данных; "
        "никаких новых квантовых задач или моделей материалов.",
        "",
        "## qBraid D1: проверенные архивные задания",
        "",
        f"Записей: **{len(rows)}**; с однозначными квантовыми гистограммами "
        f"без явной атомной геометрии: **{counts['measurement_only_no_atomic_geometry']}**; "
        f"записей с признаками явных структур: "
        f"**{counts['structure_candidate_needs_validation']}**.",
        "",
        "| Миссия | Состояние | Результат анализа |",
        "|---|---|---|",
    ]
    for row in rows:
        lines.append(
            f"| `{row['mission']}` | {row['job_status']} | "
            f"`{row['classification']}` |"
        )
    lines += [
        "",
        "Важное ограничение: поля `measurementCounts` описывают вероятности "
        "исходов измерения кубитов, а **не химический состав или атомные координаты**. "
        "Чтобы связать их с материалом, потребуются исходный гамильтониан, "
        "геометрия и таблица отображения модели на кубиты. Архивный вывод "
        "не доказывает существование FTL-материала.",
        "",
        "## Опубликованные направления исследования",
        "",
        "| Источник | Уровень свидетельства | Что полезно | Ограничение |",
        "|---|---|---|---|",
    ]
    for lead in leads:
        lines.append(
            f"| [{lead['id']}]({lead['reference_url']}) | "
            f"{lead['evidence_level']} | "
            f"{lead['potential_application']} | "
            f"{lead['manufacturing_status']} |"
        )
    lines += [
        "",
        "## Шкала Кардашёва и проверяемость",
        "",
        "Тип III Кардашёва означает **энергетический масштаб цивилизации, "
        "сопоставимый с галактическим**, а не тип вещества или метаматериала. "
        "Ни один из перечисленных источников не является подтверждённым "
        "FTL-двигателем. Метаматериалы и наноструктуры могут управлять "
        "электромагнитными и поверхностными эффектами, но не создают "
        "по умолчанию необходимый для сверхсветового варпа "
        "тензор энергии-импульса.",
        "",
        "## Решение репликаторного шлюза",
        "",
        "**BLOCKED**: нет подтверждённого FTL-эффекта, проверенного рабочего "
        "прототипа, полной спецификации производства и отдельного "
        "разрешения на печать.",
        "",
        "## Происхождение данных",
        "",
        f"- Экспорт: `{export.get('source','не указано')}`.",
        "- Источники перечислены по прямым ссылкам в каталоге; "
        "содержимое статей в этой процедуре автоматически не скачивается.",
        "- Статус вычислений: **новых qBraid-задач 0**.",
        "",
    ]
    return "\n".join(lines)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--archive", default="research/warp-matter/archives/qbraid-existing-20261024-25.json")
    p.add_argument("--literature", default="coordination/research/warp-matter-k3-literature.json")
    p.add_argument("--output", help="Optional Markdown report destination")
    a = p.parse_args()
    archive = json.loads(Path(a.archive).read_text(encoding="utf-8"))
    literature = json.loads(Path(a.literature).read_text(encoding="utf-8"))
    report = render_report(archive, literature)
    if a.output:
        Path(a.output).write_text(report, encoding="utf-8")
    else:
        print(report)


if __name__ == "__main__":
    main()

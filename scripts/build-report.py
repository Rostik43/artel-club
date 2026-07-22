#!/usr/bin/env python3
"""Сборка единого Word-отчёта из глав-документов docs/.

Склеивает front-matter (титул, содержание, executive summary) и 7 глав с разрывами
страниц в один markdown, затем — pandoc → docx.

Использование:
    python3 scripts/build-report.py            # пишет docs/_report-combined.md
    pandoc docs/_report-combined.md -o docs/artel-udmurtia-report.docx -V lang=ru

Требуется pandoc (brew install pandoc). Src главы редактируются по отдельности —
отчёт всегда пересобирается из них, поэтому правьте главы, а не собранный файл.
"""
from pathlib import Path

FRONT = "docs/_report-frontmatter.md"
OUT = "docs/_report-combined.md"
CHAPTERS = [
    ("Глава 1. Обзор рынка новостроек Удмуртии", "docs/udmurtia-market-analysis.md"),
    ("Глава 2. Верифицированная распроданность (ЕИСЖС, дом-уровень)", "docs/udmurtia-sellout-verified.md"),
    ("Глава 3. Кирпич vs монолит-кирпич: формат, а не материал", "docs/kirpich-vs-monolit.md"),
    ("Глава 4. Бенчмарк посылов: сайты застройщиков УР vs федералы", "docs/messaging-benchmark.md"),
    ("Глава 5. Геймификация и продуктовые механики", "docs/gamification-analysis.md"),
    ("Глава 6. ИИ-инструменты для застройщиков", "docs/ai-tools-for-developers.md"),
    ("Глава 7. Остатки готового жилья: кто сидит на сданных квартирах", "docs/ready-stock-report.md"),
    ("Глава 8. Методика и факт-чек", "docs/fact-check-report.md"),
]
# Разрыв страницы для docx через raw OpenXML (pandoc пробрасывает как есть)
PAGEBREAK = '\n```{=openxml}\n<w:p><w:r><w:br w:type="page"/></w:r></w:p>\n```\n\n'


def strip_first_h1(text: str) -> str:
    if text.startswith("---"):  # снять YAML-фронтматтер главы
        text = text.split("---", 2)[-1]
    out, dropped = [], False
    for line in text.splitlines():
        if not dropped and line.startswith("# "):
            dropped = True
            continue
        out.append(line)
    return "\n".join(out).strip()


def main() -> None:
    parts = [Path(FRONT).read_text(encoding="utf-8")]
    for title, path in CHAPTERS:
        body = strip_first_h1(Path(path).read_text(encoding="utf-8"))
        parts.append(f"{PAGEBREAK}# {title}\n\n{body}\n")
    Path(OUT).write_text("\n".join(parts), encoding="utf-8")
    words = len("\n".join(parts).split())
    print(f"Собрано: {OUT} ({words} слов, {len(CHAPTERS)} глав).")
    print("Дальше: pandoc docs/_report-combined.md -o docs/artel-udmurtia-report.docx -V lang=ru")


if __name__ == "__main__":
    main()

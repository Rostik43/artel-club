#!/usr/bin/env python3
"""Преобразует сырой дамп ЕИСЖС (наш.дом.рф) в плоскую таблицу houses.csv.

Сырой дамп (data/eisgs/raw/eisgs_api_dump.json) собран в браузере с российского IP:
API наш.дом.рф закрыт WAF (Servicepipe, cookie spjs/spsc) — прямые запросы curl/urllib
получают 403. Данные выкачаны через fetch() в контексте авторизованной вкладки
(каталог /сервисы/api/kn/object?place=18 + карточки /сервисы/api/object/{objId}).

Структура дампа: {collectedAt, source, catalog:[...], details:[...], rows:[...]}.
`rows` уже содержит готовые к выгрузке поля; здесь мы просто пишем их в CSV
в стабильном порядке колонок и добавляем шапку с датой/источником.

Использование:
    python3 scripts/market-data/process_eisgs_dump.py
    python3 scripts/market-data/process_eisgs_dump.py --dump path.json --out data/eisgs/houses.csv
"""

import argparse
import csv
import json
from pathlib import Path

# Порядок и русские заголовки колонок houses.csv
COLUMNS = [
    ("objId", "ID дома (objId)"),
    ("hobjId", "hobjId"),
    ("rpdNum", "№ разрешения (РС)"),
    ("zhk", "ЖК"),
    ("address", "Адрес"),
    ("rayon", "Район/город"),
    ("zastroyshchik", "Застройщик"),
    ("gruppa", "Группа компаний"),
    ("inn", "ИНН застройщика"),
    ("floorMin", "Этажность (мин)"),
    ("floorMax", "Этажность (макс)"),
    ("wallMaterial", "Материал стен"),
    ("klass", "Класс жилья"),
    ("srokSdachi", "Срок сдачи (план 100%)"),
    ("kvartir", "Квартир, шт"),
    ("zhilayaPloshchad", "Жилая площадь, м²"),
    ("soldOutPerc", "Распродано, %"),
    ("cenaM2", "Цена, ₽/м²"),
    ("cenaDataMes", "Цена на дату"),
    ("genpodryadchik", "Генподрядчик"),
    ("escrow", "Эскроу"),
    ("problem", "Проблемный"),
    ("status", "Статус"),
    ("publDt", "Опубликован"),
    ("lat", "Широта"),
    ("lon", "Долгота"),
    ("hasDetail", "Есть карточка (1/0)"),
]


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--dump", default="data/eisgs/raw/eisgs_api_dump.json")
    p.add_argument("--out", default="data/eisgs/houses.csv")
    args = p.parse_args()

    data = json.loads(Path(args.dump).read_text(encoding="utf-8"))
    rows = data.get("rows", [])
    collected = data.get("collectedAt", "")
    source = data.get("source", "")

    out = Path(args.out)
    with out.open("w", newline="", encoding="utf-8-sig") as fh:
        fh.write(f"# Источник: {source}\n")
        fh.write(f"# Собрано: {collected}\n")
        fh.write(f"# Всего домов: {len(rows)}; с карточкой: {sum(1 for r in rows if r.get('hasDetail'))}\n")
        writer = csv.writer(fh)
        writer.writerow([title for _, title in COLUMNS])
        for r in rows:
            writer.writerow([r.get(key, "") for key, _ in COLUMNS])

    with_sold = sum(1 for r in rows if r.get("soldOutPerc") not in ("", None))
    print(f"CSV: {out} ({len(rows)} строк, распроданность есть у {with_sold})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

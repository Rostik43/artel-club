#!/usr/bin/env python3
"""Сборщик данных ЕИСЖС (наш.дом.рф) по новостройкам Удмуртской Республики.

Запускать с российского IP — наш.дом.рф блокирует зарубежные адреса.
Требует только стандартную библиотеку Python 3.9+ (без pip install).

Что делает:
  1. Постранично выкачивает каталог строящихся домов региона (код 18)
     через публичный JSON API каталога наш.дом.рф.
  2. Сохраняет сырые ответы в data/eisgs/raw/ (на случай смены схемы API).
  3. Пытается забрать карточку каждого дома (детальный endpoint) —
     там обычно есть распроданность, этажность, материал стен, сроки.
  4. Собирает плоскую таблицу data/eisgs/houses.csv со всеми полями,
     которые вернул API (схема не захардкожена — поля обнаруживаются).

Использование:
    python3 scripts/market-data/fetch_eisgs.py            # регион 18 (Удмуртия)
    python3 scripts/market-data/fetch_eisgs.py --region 18 --out data/eisgs

Если API вернул не то, что ожидалось, — смотри сырые файлы в raw/
и подбери параметры: скрипт печатает URL каждого запроса.
"""

import argparse
import csv
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

# Домен наш.дом.рф в punycode
BASE = "https://xn--80az8a.xn--d1aqf.xn--p1ai"
# Каталог новостроек: этот endpoint использует фронтенд каталога.
# Если вернёт 404 — открой каталог в браузере с DevTools (вкладка Network,
# фильтр XHR) и подставь актуальный путь сюда.
CATALOG_PATH = "/сервисы/api/kn/object"
DETAIL_PATH = "/сервисы/api/object/{obj_id}"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept": "application/json",
    "Referer": BASE + "/",
}

PAGE_SIZE = 20
PAUSE_SEC = 1.0  # вежливая пауза между запросами


def get_json(url: str) -> dict:
    print(f"  GET {url}")
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_catalog(region: str, raw_dir: Path) -> list[dict]:
    """Выкачивает все страницы каталога по региону, возвращает список объектов."""
    objects, offset, total = [], 0, None
    while total is None or offset < total:
        params = urllib.parse.urlencode(
            {
                "offset": offset,
                "limit": PAGE_SIZE,
                "place": region,  # если фильтр не сработает, попробуй "region"
                "objStatus": 0,  # 0 = строящиеся
            }
        )
        url = f"{BASE}{urllib.parse.quote(CATALOG_PATH)}?{params}"
        data = get_json(url)
        (raw_dir / f"catalog_offset{offset}.json").write_text(
            json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        # Структура ответа может отличаться — ищем список объектов и total
        payload = data.get("data", data)
        page = payload.get("list") or payload.get("objects") or payload.get("items") or []
        total = payload.get("total") or payload.get("totalCount") or total
        if not page:
            print(f"  Пустая страница на offset={offset}; total={total}. Останавливаюсь.")
            break
        objects.extend(page)
        print(f"  Получено {len(objects)}/{total if total is not None else '?'}")
        offset += PAGE_SIZE
        time.sleep(PAUSE_SEC)
    return objects


def fetch_details(objects: list[dict], raw_dir: Path) -> None:
    """Дозабирает карточку каждого дома (там распроданность/готовность)."""
    for i, obj in enumerate(objects):
        obj_id = obj.get("objId") or obj.get("id")
        if obj_id is None:
            continue
        url = BASE + urllib.parse.quote(DETAIL_PATH.format(obj_id=obj_id))
        try:
            data = get_json(url)
        except Exception as exc:  # noqa: BLE001 — фиксируем и идём дальше
            print(f"  ! карточка {obj_id}: {exc}")
            continue
        (raw_dir / f"object_{obj_id}.json").write_text(
            json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        obj["_detail"] = data.get("data", data)
        print(f"  Карточка {i + 1}/{len(objects)} (id={obj_id})")
        time.sleep(PAUSE_SEC)


def flatten(prefix: str, value, row: dict) -> None:
    if isinstance(value, dict):
        for k, v in value.items():
            flatten(f"{prefix}.{k}" if prefix else k, v, row)
    elif isinstance(value, list):
        row[prefix] = json.dumps(value, ensure_ascii=False)
    else:
        row[prefix] = value


def write_csv(objects: list[dict], out_file: Path) -> None:
    rows = []
    for obj in objects:
        row: dict = {}
        flatten("", obj, row)
        rows.append(row)
    columns = sorted({k for r in rows for k in r})
    with out_file.open("w", newline="", encoding="utf-8-sig") as fh:
        writer = csv.DictWriter(fh, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)
    print(f"CSV: {out_file} ({len(rows)} строк, {len(columns)} колонок)")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--region", default="18", help="код региона (18 = Удмуртия)")
    parser.add_argument("--out", default="data/eisgs", help="каталог для результатов")
    parser.add_argument("--skip-details", action="store_true", help="только каталог, без карточек")
    args = parser.parse_args()

    out_dir = Path(args.out)
    raw_dir = out_dir / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)

    print(f"1/3 Каталог региона {args.region}…")
    objects = fetch_catalog(args.region, raw_dir)
    if not objects:
        print("Каталог пуст: проверь CATALOG_PATH и параметры (см. подсказку в шапке файла).")
        return 1

    if not args.skip_details:
        print("2/3 Карточки домов…")
        fetch_details(objects, raw_dir)

    print("3/3 Сборка CSV…")
    write_csv(objects, out_dir / "houses.csv")
    print("Готово. Сырые ответы в", raw_dir)
    return 0


if __name__ == "__main__":
    sys.exit(main())

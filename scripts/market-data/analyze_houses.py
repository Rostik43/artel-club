#!/usr/bin/env python3
"""Анализ распроданности новостроек УР по дом-уровневым данным ЕИСЖС.

Вход:  data/eisgs/houses.csv (собран локально с российского IP, 118 домов).
Выход: печать сводок в stdout + data/analysis/sellout-breakdowns.md

Считаем распроданность (поле «Распродано, %») в разрезах, важных для стратегии:
класс жилья, материал стен, этажность, срок сдачи, цена, застройщик — и выделяем
«зависающие» дома (низкая распроданность при близком сроке сдачи).
"""

import csv
import statistics
from pathlib import Path

CSV = Path("data/eisgs/houses.csv")
OUT = Path("data/analysis/sellout-breakdowns.md")


def load():
    with CSV.open(encoding="utf-8-sig") as f:
        rows = list(csv.reader(f))
    hdr_i = next(i for i, r in enumerate(rows) if r and not r[0].lstrip("﻿").startswith("#"))
    header = rows[hdr_i]
    idx = {name: j for j, name in enumerate(header)}
    houses = []
    for r in rows[hdr_i + 1 :]:
        if len(r) < len(header) or r[0].startswith("#"):
            continue
        houses.append({name: r[j] for name, j in idx.items()})
    return houses


def num(x):
    if x is None:
        return None
    x = str(x).replace("\xa0", "").replace(" ", "").replace(",", ".").strip()
    if x in ("", "-", "None", "null"):
        return None
    try:
        return float(x)
    except ValueError:
        return None


def wavg(pairs):
    """Взвешенное среднее распроданности: pairs = [(perc, weight), ...]."""
    num_, den = 0.0, 0.0
    for perc, w in pairs:
        if perc is None or w is None:
            continue
        num_ += perc * w
        den += w
    return (num_ / den) if den else None


def sold_year(h):
    s = h.get("Срок сдачи (план 100%)", "")
    for tok in str(s).replace("-", ".").replace("/", ".").split("."):
        if len(tok) == 4 and tok.isdigit():
            return tok
    return s[:4] if s[:4].isdigit() else "н/д"


def group(houses, keyfn, label):
    buckets = {}
    for h in houses:
        k = keyfn(h) or "н/д"
        buckets.setdefault(k, []).append(h)
    lines = [f"\n### Распроданность по разрезу: {label}\n",
             "| Значение | Домов | Квартир | Распроданность (взвеш. по квартирам) |",
             "|---|---:|---:|---:|"]
    stats = []
    for k, hs in buckets.items():
        flats = sum(num(h["Квартир, шт"]) or 0 for h in hs)
        pairs = [(num(h["Распродано, %"]), num(h["Квартир, шт"])) for h in hs]
        wa = wavg(pairs)
        stats.append((k, len(hs), flats, wa))
    stats.sort(key=lambda t: (-(t[3] if t[3] is not None else -1)))
    for k, n, flats, wa in stats:
        wa_s = f"{wa:.1f}%" if wa is not None else "н/д"
        lines.append(f"| {k} | {n} | {int(flats)} | {wa_s} |")
    return "\n".join(lines)


def floors_bucket(h):
    mx = num(h.get("Этажность (макс)"))
    if mx is None:
        return "н/д"
    if mx <= 4:
        return "малоэтажные (≤4)"
    if mx <= 9:
        return "среднеэтажные (5–9)"
    if mx <= 17:
        return "многоэтажные (10–17)"
    if mx <= 24:
        return "высотные (18–24)"
    return "высотные (25+)"


def price_bucket(h):
    p = num(h.get("Цена, ₽/м²"))
    if p is None or p == 0:
        return "цена не указана"
    if p < 100_000:
        return "< 100 тыс ₽/м²"
    if p < 130_000:
        return "100–130 тыс"
    if p < 160_000:
        return "130–160 тыс"
    if p < 200_000:
        return "160–200 тыс"
    return "200+ тыс"


def main():
    houses = load()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out = [f"# Распроданность новостроек УР — разрезы (ЕИСЖС, срез 08.07.2026)\n",
           f"Домов: {len(houses)}. Расчёт по `data/eisgs/houses.csv`. "
           f"Распроданность = поле «Распродано, %», взвешено по числу квартир.\n"]

    total_pairs = [(num(h["Распродано, %"]), num(h["Квартир, шт"])) for h in houses]
    total_flats = sum(num(h["Квартир, шт"]) or 0 for h in houses)
    with_data = [h for h in houses if num(h["Распродано, %"]) is not None]
    out.append(f"**Итого:** {int(total_flats)} квартир, распроданность "
               f"**{wavg(total_pairs):.1f}%** (данные о распроданности у {len(with_data)}/{len(houses)} домов).\n")

    out.append(group(houses, lambda h: h.get("Класс жилья"), "Класс жилья"))
    out.append(group(houses, lambda h: h.get("Материал стен"), "Материал стен"))
    out.append(group(houses, floors_bucket, "Этажность"))
    out.append(group(houses, sold_year, "Срок сдачи (год)"))
    out.append(group(houses, price_bucket, "Цена ₽/м²"))
    out.append(group(houses, lambda h: h.get("Группа компаний"), "Группа компаний"))
    out.append(group(houses, lambda h: h.get("Район/город"), "Район / город"))

    # «Зависающие»: сдача 2026-2027, распроданность < 25%, есть продажи
    out.append("\n### 🚩 Дома-риски: близкий срок сдачи + низкая распроданность\n")
    out.append("Сдача в 2026–2027, распроданность < 25%, ≥20 квартир (кандидаты на архитектурную переупаковку):\n")
    out.append("| ЖК | Застройщик | Город | Этажей | Материал | Класс | Сдача | Квартир | Распродано | ₽/м² |")
    out.append("|---|---|---|---:|---|---|---|---:|---:|---:|")
    risk = []
    for h in houses:
        yr = sold_year(h)
        sold = num(h["Распродано, %"])
        flats = num(h["Квартир, шт"])
        if yr in ("2026", "2027") and sold is not None and sold < 25 and (flats or 0) >= 20:
            risk.append((sold, h, yr, flats))
    risk.sort(key=lambda t: t[0])
    for sold, h, yr, flats in risk:
        p = num(h.get("Цена, ₽/м²"))
        p_s = f"{int(p):,}".replace(",", " ") if p else "—"
        out.append(f"| {h.get('ЖК','').strip(chr(34))} | {h.get('Группа компаний','')} | "
                   f"{h.get('Район/город','')} | {h.get('Этажность (макс)','')} | "
                   f"{h.get('Материал стен','')} | {h.get('Класс жилья','')} | {yr} | "
                   f"{int(flats)} | {sold:.0f}% | {p_s} |")
    out.append(f"\nВсего домов-рисков: **{len(risk)}**.\n")

    text = "\n".join(out)
    OUT.write_text(text, encoding="utf-8")
    print(text)
    print(f"\n[записано в {OUT}]")


if __name__ == "__main__":
    main()

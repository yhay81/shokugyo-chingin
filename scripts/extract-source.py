"""Extract current-classification MHLW occupation wage tables for 2023–2025."""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

import openpyxl

YEARS = [2023, 2024, 2025]
SOURCE_URL = "https://www.mhlw.go.jp/toukei/list/xls/114-1d-10.xlsx"
SHEETS = {
    1: "fr",  # full-time, reception area
    3: "fw",  # full-time, workplace area
    5: "pr",  # part-time, reception area
    7: "pw",  # part-time, workplace area
}
PREFECTURES = [
    ("JP-01", "北海道", "北海道"),
    ("JP-02", "青森", "東北"),
    ("JP-03", "岩手", "東北"),
    ("JP-04", "宮城", "東北"),
    ("JP-05", "秋田", "東北"),
    ("JP-06", "山形", "東北"),
    ("JP-07", "福島", "東北"),
    ("JP-08", "茨城", "関東"),
    ("JP-09", "栃木", "関東"),
    ("JP-10", "群馬", "関東"),
    ("JP-11", "埼玉", "関東"),
    ("JP-12", "千葉", "関東"),
    ("JP-13", "東京", "関東"),
    ("JP-14", "神奈川", "関東"),
    ("JP-15", "新潟", "北陸甲信越"),
    ("JP-16", "富山", "北陸甲信越"),
    ("JP-17", "石川", "北陸甲信越"),
    ("JP-18", "福井", "北陸甲信越"),
    ("JP-19", "山梨", "北陸甲信越"),
    ("JP-20", "長野", "北陸甲信越"),
    ("JP-21", "岐阜", "東海"),
    ("JP-22", "静岡", "東海"),
    ("JP-23", "愛知", "東海"),
    ("JP-24", "三重", "東海"),
    ("JP-25", "滋賀", "近畿"),
    ("JP-26", "京都", "近畿"),
    ("JP-27", "大阪", "近畿"),
    ("JP-28", "兵庫", "近畿"),
    ("JP-29", "奈良", "近畿"),
    ("JP-30", "和歌山", "近畿"),
    ("JP-31", "鳥取", "中国"),
    ("JP-32", "島根", "中国"),
    ("JP-33", "岡山", "中国"),
    ("JP-34", "広島", "中国"),
    ("JP-35", "山口", "中国"),
    ("JP-36", "徳島", "四国"),
    ("JP-37", "香川", "四国"),
    ("JP-38", "愛媛", "四国"),
    ("JP-39", "高知", "四国"),
    ("JP-40", "福岡", "九州・沖縄"),
    ("JP-41", "佐賀", "九州・沖縄"),
    ("JP-42", "長崎", "九州・沖縄"),
    ("JP-43", "熊本", "九州・沖縄"),
    ("JP-44", "大分", "九州・沖縄"),
    ("JP-45", "宮崎", "九州・沖縄"),
    ("JP-46", "鹿児島", "九州・沖縄"),
    ("JP-47", "沖縄", "九州・沖縄"),
]


def numeric(value: object) -> int | None:
    return int(value) if isinstance(value, (int, float)) else None


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: extract-source.py SOURCE.xlsx OUTPUT_DIRECTORY")
    source_path = Path(sys.argv[1])
    output_directory = Path(sys.argv[2])
    workbook = openpyxl.load_workbook(source_path, read_only=True, data_only=True)

    places = [{"id": "JP-00", "name": "全国", "region": "全国"}] + [
        {"id": item_id, "name": name, "region": region}
        for item_id, name, region in PREFECTURES
    ]
    place_ids = {"全国計": "JP-00"} | {
        f"{name}労働局": item_id for item_id, name, _region in PREFECTURES
    }
    records: dict[tuple[str, str], dict[str, object]] = {}
    occupations: dict[str, dict[str, str]] = {}
    group_names: dict[str, str] = {}

    for sheet_index, series in SHEETS.items():
        sheet = workbook.worksheets[sheet_index]
        current_place_id: str | None = None
        current_group: str | None = None
        for row in sheet.iter_rows(min_row=3, values_only=True):
            if row[0] in place_ids:
                current_place_id = place_ids[str(row[0])]
            source_name = str(row[1] or "").strip()
            group_match = re.match(r"^([Ａ-Ｋ])(.+)$", source_name)
            if group_match:
                current_group = group_match.group(1)
                group_names.setdefault(current_group, group_match.group(2))
                continue
            occupation_match = re.match(r"^(\d{2})(.+)$", source_name)
            if current_place_id is None or current_group is None or not occupation_match:
                continue
            occupation_id, occupation_name = occupation_match.groups()
            previous = occupations.setdefault(
                occupation_id,
                {"id": occupation_id, "name": occupation_name, "group": current_group},
            )
            if previous["name"] != occupation_name or previous["group"] != current_group:
                raise ValueError(f"occupation changed across sheets: {source_name}")
            key = (current_place_id, occupation_id)
            record = records.setdefault(key, {"p": current_place_id, "o": occupation_id})
            if series in record:
                raise ValueError(f"duplicate series: {key} {series}")
            record[series] = [numeric(value) for value in row[2:5]]

    if len(occupations) != 73 or len(group_names) != 11:
        raise ValueError(
            f"unexpected occupation dimensions: {len(occupations)} occupations, {len(group_names)} groups"
        )
    expected_records = len(places) * len(occupations)
    if len(records) != expected_records:
        raise ValueError(f"expected {expected_records} records, got {len(records)}")
    for record in records.values():
        if set(record) != {"p", "o", *SHEETS.values()}:
            raise ValueError(f"missing series: {record}")
        for series in SHEETS.values():
            values = record[series]
            if len(values) != len(YEARS):
                raise ValueError(f"invalid series length: {record}")
            if any(value is not None and value <= 0 for value in values):
                raise ValueError(f"invalid published value: {record}")

    ordered_occupations = [occupations[key] for key in sorted(occupations)]
    ordered_records = [
        records[(place["id"], occupation["id"])]
        for place in places
        for occupation in ordered_occupations
    ]
    available_values = sum(
        value is not None
        for record in ordered_records
        for series in SHEETS.values()
        for value in record[series]
    )
    value_count = len(ordered_records) * len(SHEETS) * len(YEARS)
    source_sha = hashlib.sha256(source_path.read_bytes()).hexdigest()
    index = {
        "schemaVersion": 1,
        "asOf": "2026-08-02",
        "edition": "2023〜2025年度（現行表）",
        "years": YEARS,
        "placeCount": len(places),
        "prefectureCount": 47,
        "groupCount": len(group_names),
        "occupationCount": len(ordered_occupations),
        "recordCount": len(ordered_records),
        "seriesCount": len(SHEETS),
        "valueCount": value_count,
        "availableValueCount": available_values,
        "unavailableValueCount": value_count - available_values,
        "places": places,
        "groups": [
            {"id": group_id, "name": group_names[group_id]}
            for group_id in sorted(group_names)
        ],
        "occupations": ordered_occupations,
        "source": {"url": SOURCE_URL, "sha256": source_sha},
    }
    output_directory.mkdir(parents=True, exist_ok=True)
    (output_directory / "index.json").write_text(
        json.dumps(index, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    (output_directory / "wages.json").write_text(
        json.dumps(ordered_records, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "available_values": available_values,
                "groups": len(group_names),
                "occupations": len(ordered_occupations),
                "places": len(places),
                "records": len(ordered_records),
                "sha256": source_sha,
                "unavailable_values": value_count - available_values,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()

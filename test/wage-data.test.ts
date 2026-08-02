import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type RecordRow = {
  p: string;
  o: string;
  fr: Array<number | null>;
  fw: Array<number | null>;
  pr: Array<number | null>;
  pw: Array<number | null>;
};

const root = process.cwd();
const index = JSON.parse(readFileSync(resolve(root, "public/data/index.json"), "utf8"));
const records = JSON.parse(
  readFileSync(resolve(root, "public/data/wages.json"), "utf8"),
) as RecordRow[];
const find = (placeId: string, occupationId: string) =>
  records.find((item) => item.p === placeId && item.o === occupationId)!;

describe("official occupation average job-offer wage tables", () => {
  it("retains verified source metadata and dimensions", () => {
    expect(index).toMatchObject({
      schemaVersion: 1,
      asOf: "2026-08-02",
      edition: "2023〜2025年度（現行表）",
      years: [2023, 2024, 2025],
      placeCount: 48,
      prefectureCount: 47,
      groupCount: 11,
      occupationCount: 73,
      recordCount: 3504,
      seriesCount: 4,
      valueCount: 42_048,
      availableValueCount: 38_913,
      unavailableValueCount: 3135,
      source: {
        url: "https://www.mhlw.go.jp/toukei/list/xls/114-1d-10.xlsx",
        sha256: "7b3e3559d494b6471255383c7ff2a6ba26287463eba05e3a01028560d63f1559",
      },
    });
  });

  it("contains one unique row for every place and occupation", () => {
    expect(records).toHaveLength(3504);
    expect(new Set(records.map((item) => `${item.p}|${item.o}`)).size).toBe(3504);
    expect(index.places).toHaveLength(48);
    expect(index.groups).toHaveLength(11);
    expect(index.occupations).toHaveLength(73);
  });

  it("keeps every occupation attached to one published group", () => {
    const groupIds = new Set(index.groups.map((item: { id: string }) => item.id));
    for (const occupation of index.occupations as { group: string; id: string; name: string }[]) {
      expect(occupation.id).toMatch(/^\d{2}$/u);
      expect(occupation.name.length).toBeGreaterThan(1);
      expect(groupIds.has(occupation.group)).toBe(true);
    }
    expect(index.occupations.find((item: { id: string }) => item.id === "10")).toMatchObject({
      group: "Ｂ",
      name: "情報処理・通信技術者",
    });
    expect(index.occupations.find((item: { id: string }) => item.id === "36")).toMatchObject({
      group: "Ｅ",
      name: "介護サービス職業従事者",
    });
  });

  it("retains nationwide and known prefecture values", () => {
    expect(find("JP-00", "10")).toEqual({
      p: "JP-00",
      o: "10",
      fr: [330, 337, 347],
      fw: [332, 340, 351],
      pr: [1385, 1413, 1460],
      pw: [1393, 1434, 1459],
    });
    expect(find("JP-00", "25").fw).toEqual([207, 214, 223]);
    expect(find("JP-13", "36").fw).toEqual([241, 252, 263]);
    expect(find("JP-47", "25").fr).toEqual([185, 194, 205]);
  });

  it("keeps unavailable cells as null and all series length three", () => {
    const missing = { fr: 0, fw: 0, pr: 0, pw: 0 };
    let available = 0;
    for (const record of records) {
      expect(Object.keys(record).sort()).toEqual(["fr", "fw", "o", "p", "pr", "pw"]);
      for (const series of ["fr", "fw", "pr", "pw"] as const) {
        expect(record[series]).toHaveLength(3);
        for (const value of record[series]) {
          if (value === null) missing[series] += 1;
          else {
            expect(Number.isInteger(value)).toBe(true);
            expect(value).toBeGreaterThan(0);
            available += 1;
          }
        }
      }
    }
    expect(missing).toEqual({ fr: 431, fw: 427, pr: 1154, pw: 1123 });
    expect(available).toBe(38_913);
    expect(statSync(resolve(root, "public/data/wages.json")).size).toBeLessThan(400_000);
  });
});

import { readFile } from "node:fs/promises";

const index = JSON.parse(
  await readFile(new URL("../public/data/index.json", import.meta.url), "utf8"),
);
const records = JSON.parse(
  await readFile(new URL("../public/data/wages.json", import.meta.url), "utf8"),
);
const series = ["fr", "fw", "pr", "pw"];

if (
  index.placeCount !== 48 ||
  index.prefectureCount !== 47 ||
  index.groupCount !== 11 ||
  index.occupationCount !== 73
)
  throw new Error("Unexpected index dimensions");
if (
  index.recordCount !== 3504 ||
  index.seriesCount !== 4 ||
  index.valueCount !== 42048 ||
  index.availableValueCount !== 38913 ||
  index.unavailableValueCount !== 3135
)
  throw new Error("Unexpected value dimensions");
if (records.length !== 3504) throw new Error("Unexpected record count");
if (index.years.join(",") !== "2023,2024,2025") throw new Error("Unexpected years");
if (index.source.sha256 !== "7b3e3559d494b6471255383c7ff2a6ba26287463eba05e3a01028560d63f1559")
  throw new Error("Unexpected source SHA-256");

const placeIds = new Set(index.places.map((item) => item.id));
const occupationIds = new Set(index.occupations.map((item) => item.id));
const keys = new Set();
let available = 0;
for (const record of records) {
  if (!placeIds.has(record.p) || !occupationIds.has(record.o)) throw new Error("Unknown dimension");
  const key = `${record.p}|${record.o}`;
  if (keys.has(key)) throw new Error(`Duplicate record: ${key}`);
  keys.add(key);
  if (Object.keys(record).sort().join(",") !== "fr,fw,o,p,pr,pw")
    throw new Error(`${key}: unexpected record shape`);
  for (const seriesId of series) {
    if (record[seriesId].length !== 3) throw new Error(`${key}: invalid series length`);
    for (const value of record[seriesId]) {
      if (value !== null && (!Number.isInteger(value) || value <= 0))
        throw new Error(`${key}: invalid published value`);
      if (value !== null) available += 1;
    }
  }
}
if (available !== index.availableValueCount) throw new Error("Available value count changed");

const find = (place, occupation) =>
  records.find((record) => record.p === place && record.o === occupation);
if (find("JP-00", "10").fw.at(-1) !== 351) throw new Error("National IT wage changed");
if (find("JP-00", "25").pw.at(-1) !== 1222)
  throw new Error("National office part-time wage changed");
if (find("JP-13", "36").fw.at(-1) !== 263) throw new Error("Tokyo care wage changed");
if (find("JP-47", "25").fr.at(-1) !== 205) throw new Error("Okinawa office wage changed");

console.log(
  JSON.stringify({
    available,
    groups: index.groupCount,
    occupations: index.occupationCount,
    places: index.placeCount,
    records: records.length,
    unavailable: index.unavailableValueCount,
  }),
);

const MAX_COMPARE = 4;
const STORAGE_KEY = "shokugyo-chingin:compare:v1";
const DEFAULT_SELECTED = ["JP-00", "JP-13", "JP-27"];
const DEFAULT_OCCUPATION = "25";

const occupationSearch = document.querySelector("#occupation-search");
const occupationGroup = document.querySelector("#occupation-group");
const occupationList = document.querySelector("#occupation-list");
const occupationStatus = document.querySelector("#occupation-status");
const search = document.querySelector("#search");
const region = document.querySelector("#region");
const sort = document.querySelector("#sort");
const employment = document.querySelector("#employment");
const basis = document.querySelector("#basis");
const year = document.querySelector("#year");
const results = document.querySelector("#results");
const resultsTitle = document.querySelector("#results-title");
const conditionLabel = document.querySelector("#condition-label");
const resultCount = document.querySelector("#result-count");
const dataStatus = document.querySelector("#data-status");
const metricNote = document.querySelector("#metric-note");
const compareList = document.querySelector("#compare-list");
const compareCount = document.querySelector("#compare-count");
const copyCompare = document.querySelector("#copy-compare");

let index = null;
let records = [];
let recordMap = new Map();
let selected = loadSelected();
let selectedOccupationId = DEFAULT_OCCUPATION;
let occupationSearchTimer;
let regionSearchTimer;
let noResultReported = false;
let occupationNoResultReported = false;

const isPrivacyEnabled = () =>
  navigator.doNotTrack === "1" || navigator.globalPrivacyControl === true;
const isQa = () => navigator.webdriver === true || new URLSearchParams(location.search).has("qa");
const getSession = () => {
  const key = "shokugyo-chingin:session:v1";
  let value = sessionStorage.getItem(key);
  if (!value) {
    value = crypto.randomUUID();
    sessionStorage.setItem(key, value);
  }
  return value;
};
const track = (name) => {
  if (isPrivacyEnabled()) return;
  fetch("/api/telemetry", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-shokugyo-chingin-session": getSession(),
      "x-shokugyo-chingin-qa": isQa() ? "1" : "0",
    },
    body: JSON.stringify({ name }),
    keepalive: true,
  }).catch(() => undefined);
};

function loadSelected() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === null) return [...DEFAULT_SELECTED];
    const value = JSON.parse(stored);
    return Array.isArray(value)
      ? value.filter((id) => typeof id === "string").slice(0, MAX_COMPARE)
      : [...DEFAULT_SELECTED];
  } catch {
    return [...DEFAULT_SELECTED];
  }
}
function saveSelected() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(selected));
  } catch {
    // The current comparison remains usable without storage.
  }
}

const normalize = (value) => value.normalize("NFKC").toLocaleLowerCase("ja").replaceAll(/\s/gu, "");
const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const number = new Intl.NumberFormat("ja-JP");
const selectedOccupation = () => index.occupations.find((item) => item.id === selectedOccupationId);
const selectedRecord = (placeId) => recordMap.get(`${placeId}|${selectedOccupationId}`);
const seriesId = () =>
  ({
    full: { reception: "fr", workplace: "fw" },
    part: { reception: "pr", workplace: "pw" },
  })[employment.value][basis.value];
const seriesFor = (placeId) => selectedRecord(placeId)?.[seriesId()] ?? [null, null, null];
const yearIndex = () => index.years.indexOf(Number(year.value));
const currentValue = (placeId) => seriesFor(placeId)[yearIndex()];
const previousValue = (placeId) => {
  const position = yearIndex();
  return position > 0 ? seriesFor(placeId)[position - 1] : null;
};
const displayValue = (value) => {
  if (value === null) return "公表なし";
  return employment.value === "full"
    ? `${number.format(value * 1000)}円`
    : `${number.format(value)}円 / 時`;
};
const shortValue = (value) => {
  if (value === null) return "—";
  return employment.value === "full" ? `${value}千円` : `${number.format(value)}円`;
};
const deltaValue = (placeId) => {
  const current = currentValue(placeId);
  const previous = previousValue(placeId);
  return current === null || previous === null ? null : current - previous;
};
const displayDelta = (value) => {
  if (value === null) return "比較不可";
  const converted = employment.value === "full" ? value * 1000 : value;
  return `${converted >= 0 ? "+" : ""}${number.format(converted)}円`;
};
const employmentLabel = () =>
  employment.value === "full" ? "パートを除く常用 · 月給" : "常用的パート · 時給";
const basisLabel = () => (basis.value === "workplace" ? "就業地" : "受理地");

function currentScale() {
  const values = index.places
    .map((place) => currentValue(place.id))
    .filter((value) => value !== null);
  return { max: Math.max(...values), min: Math.min(...values) };
}
function wageGauge(value, label) {
  if (value === null)
    return '<div class="wage-gauge is-missing"><span>公式表で公表なし</span></div>';
  const scale = currentScale();
  const span = Math.max(1, scale.max - scale.min);
  const position = ((value - scale.min) / span) * 100;
  return `<div aria-label="${escapeHtml(label)}" class="wage-gauge" role="img"><div class="gauge-track"><i style="left:${position.toFixed(2)}%"></i></div><div class="gauge-labels"><span>${shortValue(scale.min)}</span><span>${shortValue(scale.max)}</span></div></div>`;
}
function yearStrip(placeId) {
  const values = seriesFor(placeId);
  return `<div class="year-strip">${index.years.map((value, i) => `<div class="year-cell${value === Number(year.value) ? " is-current" : ""}"><span>${value}</span><b>${shortValue(values[i])}</b></div>`).join("")}</div>`;
}

function visibleOccupations() {
  const term = normalize(occupationSearch.value);
  const group = occupationGroup.value;
  return index.occupations.filter((occupation) => {
    const matchesTerm = !term || normalize(`${occupation.id}${occupation.name}`).includes(term);
    const matchesGroup = group === "all" || occupation.group === group;
    return matchesTerm && matchesGroup;
  });
}
function renderOccupations() {
  const visible = visibleOccupations();
  occupationStatus.textContent = `${visible.length} / ${index.occupations.length} 職種`;
  if (visible.length === 0) {
    occupationList.innerHTML =
      '<div class="no-occupations"><strong>一致する職種がありません</strong><span>職種名を短くするか、分類を「すべて」に戻してください。</span></div>';
    if (!occupationNoResultReported) {
      occupationNoResultReported = true;
      track("no_result");
    }
    return;
  }
  occupationNoResultReported = false;
  occupationList.innerHTML = visible
    .map((occupation) => {
      const group = index.groups.find((item) => item.id === occupation.group);
      const active = occupation.id === selectedOccupationId;
      return `<button aria-pressed="${active}" class="occupation-option${active ? " is-selected" : ""}" data-occupation="${occupation.id}" type="button"><span>${escapeHtml(occupation.id)} · ${escapeHtml(group.name)}</span><strong>${escapeHtml(occupation.name)}</strong><i aria-hidden="true">${active ? "選択中" : "選ぶ"}</i></button>`;
    })
    .join("");
}

function renderCompare() {
  const places = selected
    .map((id) => index.places.find((place) => place.id === id))
    .filter(Boolean);
  compareCount.textContent = `${places.length} / ${MAX_COMPARE}`;
  copyCompare.disabled = places.length === 0;
  if (places.length === 0) {
    compareList.className = "empty-compare";
    compareList.textContent = "一覧の「比較に追加」から、2〜4地域を選んでください。";
    return;
  }
  compareList.className = "compare-list";
  compareList.innerHTML = places
    .map((place) => {
      const value = currentValue(place.id);
      return `<article class="compare-card"><div class="compare-title"><div><span>${escapeHtml(place.region)}</span><strong>${escapeHtml(place.name)}</strong></div><button aria-label="${escapeHtml(place.name)}を比較から外す" data-remove="${place.id}" type="button">×</button></div><div class="compare-value"><span>${escapeHtml(selectedOccupation().name)}</span><b>${displayValue(value)}</b></div>${yearStrip(place.id)}<dl class="count-pair"><div><dt>前年差</dt><dd>${displayDelta(deltaValue(place.id))}</dd></div><div><dt>地域基準</dt><dd>${basisLabel()}</dd></div></dl></article>`;
    })
    .join("");
}

function visiblePlaces() {
  const term = normalize(search.value);
  const selectedRegion = region.value;
  const filtered = index.places.filter((place) => {
    const haystack = normalize(`${place.name}${place.region}`);
    return (
      (!term || haystack.includes(term)) &&
      (selectedRegion === "all" || place.region === selectedRegion)
    );
  });
  if (sort.value === "name")
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name, "ja"));
  return filtered;
}
function renderResults() {
  const visible = visiblePlaces();
  resultCount.textContent = number.format(visible.length);
  resultsTitle.textContent = selectedOccupation().name;
  conditionLabel.textContent = `${employmentLabel()} · ${basisLabel()} · ${year.value}年度`;
  if (visible.length === 0) {
    results.innerHTML =
      '<div class="no-results"><span>0</span><h3>一致する地域がありません</h3><p>都道府県名を短くするか、地域を「すべて」に戻してください。</p></div>';
    if (!noResultReported) {
      noResultReported = true;
      track("no_result");
    }
    return;
  }
  noResultReported = false;
  results.innerHTML = visible
    .map((place) => {
      const value = currentValue(place.id);
      const active = selected.includes(place.id);
      const disabled = !active && selected.length >= MAX_COMPARE;
      return `<article class="place-card"><div class="place-heading"><div><p>${escapeHtml(place.region)} · ${escapeHtml(place.id)}</p><h3>${escapeHtml(place.name)}</h3></div><strong>${displayValue(value)}</strong></div>${wageGauge(value, `${place.name}の${selectedOccupation().name} ${displayValue(value)}`)}<dl class="place-counts"><div><dt>前年差</dt><dd>${displayDelta(deltaValue(place.id))}</dd></div><div><dt>公表単位</dt><dd>${employment.value === "full" ? "月給 · 千円" : "時給 · 円"}</dd></div></dl><button class="compare-button${active ? " is-selected" : ""}" data-select="${place.id}" ${disabled ? "disabled" : ""} type="button">${active ? "比較中" : disabled ? "4地域を選択済み" : "比較に追加"}</button></article>`;
    })
    .join("");
}
function renderAll() {
  metricNote.textContent =
    employment.value === "full"
      ? "月給は千円単位の公表値を円へ換算します。求人件数がないため、平均値の安定性は判断できません。"
      : "時給は円単位の公表値です。求人件数がないため、平均値の安定性は判断できません。";
  renderCompare();
  renderResults();
}
function chooseOccupation(id) {
  if (!index.occupations.some((item) => item.id === id)) return;
  selectedOccupationId = id;
  renderOccupations();
  renderAll();
  resultsTitle.scrollIntoView({ behavior: "smooth", block: "start" });
  track("occupation_changed");
}
function toggleSelected(id) {
  if (selected.includes(id)) selected = selected.filter((item) => item !== id);
  else if (selected.length < MAX_COMPARE) {
    selected = [...selected, id];
    track("compared");
  }
  saveSelected();
  renderAll();
}

occupationList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-occupation]");
  if (button) chooseOccupation(button.dataset.occupation);
});
results.addEventListener("click", (event) => {
  const button = event.target.closest("[data-select]");
  if (button) toggleSelected(button.dataset.select);
});
compareList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove]");
  if (button) toggleSelected(button.dataset.remove);
});
occupationSearch.addEventListener("input", () => {
  renderOccupations();
  clearTimeout(occupationSearchTimer);
  if (occupationSearch.value.trim())
    occupationSearchTimer = setTimeout(() => track("searched"), 650);
});
occupationGroup.addEventListener("change", () => {
  renderOccupations();
  track("group_changed");
});
search.addEventListener("input", () => {
  renderResults();
  clearTimeout(regionSearchTimer);
  if (search.value.trim()) regionSearchTimer = setTimeout(() => track("searched"), 650);
});
region.addEventListener("change", () => {
  renderResults();
  track("region_changed");
});
sort.addEventListener("change", renderResults);
employment.addEventListener("change", () => {
  renderAll();
  track("employment_changed");
});
basis.addEventListener("change", () => {
  renderAll();
  track("basis_changed");
});
year.addEventListener("change", () => {
  renderAll();
  track("year_changed");
});
copyCompare.addEventListener("click", async () => {
  const lines = selected
    .map((id) => index.places.find((place) => place.id === id))
    .filter(Boolean)
    .map(
      (place) =>
        `${place.name}｜${displayValue(currentValue(place.id))}｜前年差 ${displayDelta(deltaValue(place.id))}`,
    );
  await navigator.clipboard.writeText(
    [
      `${selectedOccupation().name}（${employmentLabel()}・${basisLabel()}・${year.value}年度）`,
      ...lines,
      "ハローワーク求人票の公表平均。求人件数、中央値、実際の採用賃金は示しません。",
      "出典：厚生労働省「職業安定業務統計 雇用関係指標 第10表」",
    ].join("\n"),
  );
  copyCompare.textContent = "コピーしました";
  setTimeout(() => {
    copyCompare.textContent = "比較をコピー";
  }, 1600);
  track("copied");
});

Promise.all([
  fetch("/data/index.json").then((response) => {
    if (!response.ok) throw new Error("index_unavailable");
    return response.json();
  }),
  fetch("/data/wages.json").then((response) => {
    if (!response.ok) throw new Error("data_unavailable");
    return response.json();
  }),
])
  .then(([indexData, wageData]) => {
    index = indexData;
    records = wageData;
    recordMap = new Map(records.map((record) => [`${record.p}|${record.o}`, record]));
    const validIds = new Set(index.places.map((place) => place.id));
    selected = selected.filter((id) => validIds.has(id));
    saveSelected();
    occupationGroup.insertAdjacentHTML(
      "beforeend",
      index.groups
        .map(
          (item) =>
            `<option value="${escapeHtml(item.id)}">${escapeHtml(item.id)} ${escapeHtml(item.name)}</option>`,
        )
        .join(""),
    );
    const regions = [...new Set(index.places.map((place) => place.region))];
    region.insertAdjacentHTML(
      "beforeend",
      regions
        .map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
        .join(""),
    );
    dataStatus.textContent = "全国・47労働局 · 73職種 · 2023—2025年度";
    renderOccupations();
    renderAll();
    track("visited");
  })
  .catch(() => {
    occupationStatus.textContent = "職種表を読み込めませんでした";
    dataStatus.textContent = "データを読み込めませんでした。再読み込みしてください。";
    results.innerHTML =
      '<div class="no-results"><h3>公式表を表示できません</h3><p>通信状態を確認して、ページを再読み込みしてください。</p></div>';
  });

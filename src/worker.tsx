import { Hono } from "hono";
import type { Context } from "hono";
import { jsxRenderer } from "hono/jsx-renderer";

type Bindings = { ASSETS: Fetcher; DB: D1Database };
type Variables = { requestId: string };
type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>;

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403,
  ) {
    super(message);
  }
}

const origin = "https://shokugyo-chingin.yhay81.com";
const dataPage = "https://www.mhlw.go.jp/toukei/list/114-1d.html";
const sourceWorkbook = "https://www.mhlw.go.jp/toukei/list/xls/114-1d-10.xlsx";
const termsPage = "https://www.mhlw.go.jp/toukei/list/114-1_yougo.html";
const useTerms = "https://www.mhlw.go.jp/chosakuken/index.html";
const sessionPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const eventNames = new Set([
  "visited",
  "searched",
  "no_result",
  "region_changed",
  "group_changed",
  "employment_changed",
  "basis_changed",
  "year_changed",
  "occupation_changed",
  "compared",
  "copied",
]);

const nowSeconds = () => Math.floor(Date.now() / 1000);
const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};
const sameOrigin = (c: AppContext) => {
  const site = c.req.header("sec-fetch-site");
  if (site && site !== "same-origin") throw new ApiError("cross_site_request", 403);
  const requestOrigin = c.req.header("origin");
  if (requestOrigin && requestOrigin !== new URL(c.req.url).origin)
    throw new ApiError("cross_site_request", 403);
};
const parseJson = async (c: AppContext) => {
  if (Number(c.req.header("content-length") ?? "0") > 512)
    throw new ApiError("invalid_payload", 400);
  try {
    return await c.req.json<unknown>();
  } catch {
    throw new ApiError("invalid_json", 400);
  }
};
const record = async (c: AppContext, name: string) => {
  const session = (c.req.header("x-shokugyo-chingin-session") ?? "").toLowerCase();
  if (!sessionPattern.test(session)) return;
  await c.env.DB.prepare(
    "INSERT INTO product_events (session_hash,event_name,is_qa,created_at) VALUES (?,?,?,?)",
  )
    .bind(
      await sha256(session),
      name,
      c.req.header("x-shokugyo-chingin-qa") === "1" ? 1 : 0,
      nowSeconds(),
    )
    .run();
};

const nav = [
  { href: "/", label: "職種と地域" },
  { href: "/guide", label: "数字の見方" },
  { href: "/source", label: "出典" },
  { href: "/privacy", label: "保存" },
];

const Layout = ({
  canonical,
  children,
  description,
  noindex = false,
  title,
}: {
  canonical: string;
  children: unknown;
  description: string;
  noindex?: boolean;
  title: string;
}) => (
  <html lang="ja">
    <head>
      <meta charset="utf-8" />
      <meta content="width=device-width, initial-scale=1" name="viewport" />
      <title>{title}</title>
      <meta content={description} name="description" />
      <link href={canonical} rel="canonical" />
      {noindex ? <meta content="noindex" name="robots" /> : null}
      <meta content="website" property="og:type" />
      <meta content="ja_JP" property="og:locale" />
      <meta content={title} property="og:title" />
      <meta content={description} property="og:description" />
      <meta content={canonical} property="og:url" />
      <meta content={`${origin}/og.svg`} property="og:image" />
      <meta content="summary_large_image" name="twitter:card" />
      <meta content="#283a36" name="theme-color" />
      <link href="/favicon.svg" rel="icon" type="image/svg+xml" />
      <link href="/manifest.webmanifest" rel="manifest" />
      <link href="/styles.css" rel="stylesheet" />
    </head>
    <body>
      <header class="site-header">
        <a aria-label="職種賃金くらべ ホーム" class="brand" href="/">
          <span aria-hidden="true" class="brand-mark">
            <i />
            <i />
            <i />
          </span>
          <span>職種賃金くらべ</span>
        </a>
        <nav aria-label="主なページ">
          {nav.map((item) => (
            <a href={item.href}>{item.label}</a>
          ))}
        </nav>
      </header>
      {children}
      <footer>
        <div>
          <strong>職種賃金くらべ</strong>
          <p>厚生労働省「職業安定業務統計 雇用関係指標」を加工して作成</p>
        </div>
        <div class="footer-links">
          <a href="/source">出典と注意</a>
          <a href="/privacy">保存と計測</a>
          <a href="https://github.com/yhay81/shokugyo-chingin">ソースコード</a>
        </div>
      </footer>
    </body>
  </html>
);

const OccupationDrawerFigure = () => (
  <div
    aria-label="職種カードを分類別の引き出しに収め、月給と時給の目盛りを添えた図"
    class="occupation-drawer"
    role="img"
  >
    <div class="drawer-tabs" aria-hidden="true">
      {"ＡＢＣＤＥＦＧＨＩＪＫ".split("").map((letter) => (
        <i>{letter}</i>
      ))}
    </div>
    <div class="occupation-cards" aria-hidden="true">
      <div class="occupation-card is-front">
        <span>25</span>
        <strong>一般事務</strong>
        <div class="salary-rule">
          <i />
          <i />
          <i />
          <i />
        </div>
        <small>全国 · 就業地 · 2025</small>
        <b>223千円</b>
      </div>
      <div class="occupation-card is-middle">
        <span>36</span>
        <strong>介護サービス</strong>
      </div>
      <div class="occupation-card is-back">
        <span>10</span>
        <strong>情報処理・通信</strong>
      </div>
    </div>
    <div class="drawer-handle" aria-hidden="true" />
  </div>
);

const HomePage = () => (
  <Layout
    canonical={`${origin}/`}
    description="ハローワーク求人の職種別平均賃金を、73職種、全国・47労働局、2023〜2025年度、月給・時給、受理地・就業地から選び、最大4地域で比較できます。"
    title="職種別の求人賃金を地域比較 | 職種賃金くらべ"
  >
    <main>
      <section class="hero-shell">
        <div class="hero-copy">
          <p class="period-label">2023—2025年度 · ハローワーク</p>
          <h1>職種ごとの求人賃金を、地域と年度で。</h1>
          <p class="lead">同じ職種と集計条件をそろえ、月給・時給の公表平均を並べます。</p>
          <div aria-label="収録内容" class="hero-facts">
            <span>
              <b>73</b> 職種
            </span>
            <span>
              <b>48</b> 地域
            </span>
            <span>
              <b>最大4</b> 地域比較
            </span>
          </div>
        </div>
        <OccupationDrawerFigure />
      </section>

      <section aria-labelledby="occupation-title" class="occupation-picker">
        <div class="section-heading">
          <div>
            <p class="section-kicker">職種を選ぶ</p>
            <h2 id="occupation-title">73枚の職種カード</h2>
          </div>
          <p id="occupation-status" role="status">
            公式表を読み込んでいます
          </p>
        </div>
        <div class="occupation-controls">
          <label class="occupation-search">
            <span>職種名</span>
            <input
              autocomplete="off"
              id="occupation-search"
              placeholder="例：事務、介護、情報"
              type="search"
            />
          </label>
          <label>
            <span>分類</span>
            <select id="occupation-group">
              <option value="all">すべて</option>
            </select>
          </label>
        </div>
        <div class="occupation-grid" id="occupation-list" />
      </section>

      <section aria-labelledby="compare-title" class="compare-panel">
        <div class="section-heading compare-heading">
          <div>
            <p class="section-kicker">選択した地域</p>
            <h2 id="compare-title">同じ職種を並べる</h2>
          </div>
          <div class="compare-actions">
            <span id="compare-count">0 / 4</span>
            <button disabled id="copy-compare" type="button">
              比較をコピー
            </button>
          </div>
        </div>
        <div class="metric-controls">
          <label>
            <span>雇用区分</span>
            <select id="employment">
              <option value="full">パートを除く常用 · 月給</option>
              <option value="part">常用的パート · 時給</option>
            </select>
          </label>
          <label>
            <span>地域の基準</span>
            <select id="basis">
              <option value="workplace">働く場所（就業地）</option>
              <option value="reception">求人の受付場所（受理地）</option>
            </select>
          </label>
          <label>
            <span>年度</span>
            <select id="year">
              <option value="2025">2025年度</option>
              <option value="2024">2024年度</option>
              <option value="2023">2023年度</option>
            </select>
          </label>
        </div>
        <p class="metric-note" id="metric-note">
          月給は千円単位の公表値を円へ換算します。求人件数がないため、平均値の安定性は判断できません。
        </p>
        <div class="empty-compare" id="compare-list">
          一覧の「比較に追加」から、2〜4地域を選んでください。
        </div>
      </section>

      <section aria-labelledby="finder-title" class="finder">
        <div class="section-heading">
          <div>
            <p class="section-kicker">地域一覧</p>
            <h2 id="finder-title">都道府県を選ぶ</h2>
          </div>
          <p id="data-status" role="status">
            賃金表を準備しています
          </p>
        </div>
        <div class="controls">
          <label class="search-field">
            <span>都道府県・全国</span>
            <input
              autocomplete="off"
              id="search"
              placeholder="例：東京、福岡、全国"
              type="search"
            />
          </label>
          <label>
            <span>地域</span>
            <select id="region">
              <option value="all">すべて</option>
            </select>
          </label>
          <label>
            <span>並び順</span>
            <select id="sort">
              <option value="source">都道府県コード順</option>
              <option value="name">名前順</option>
            </select>
          </label>
        </div>
      </section>

      <section aria-labelledby="results-title" class="results-section">
        <div class="results-heading">
          <div>
            <h2 id="results-title">一般事務従事者</h2>
            <p id="condition-label">パートを除く常用 · 就業地 · 2025年度</p>
          </div>
          <p>
            <b id="result-count">—</b> 地域
          </p>
        </div>
        <div class="place-grid" id="results" />
      </section>

      <aside class="boundary">
        <span aria-hidden="true">票</span>
        <div>
          <strong>平均だけでは、賃金相場は決められません</strong>
          <p>
            ハローワーク求人票の基本給と定額手当の公表平均です。求人件数、中央値、手取り、賞与、残業代、実際の採用賃金は分かりません。
          </p>
        </div>
      </aside>
    </main>
    <script defer src="/app.js" />
  </Layout>
);

const GuidePage = () => (
  <Layout
    canonical={`${origin}/guide`}
    description="職種賃金くらべの月給・時給、受理地・就業地、職種区分、未公表値、平均との差の読み方を説明します。"
    title="数字の見方 | 職種賃金くらべ"
  >
    <main class="text-page">
      <div class="page-intro">
        <p class="section-kicker">数字の見方</p>
        <h1>職種と条件を、同じカードで。</h1>
        <p>職種、雇用区分、地域の基準、年度をそろえた地域だけを比較します。</p>
      </div>
      <section class="wage-guide" aria-label="月給と時給の目盛り図">
        <div class="guide-card">
          <span>パートを除く常用</span>
          <strong>月給</strong>
          <div class="guide-rule">
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
          <small>公式の千円単位を円表示</small>
        </div>
        <div class="guide-card is-hourly">
          <span>常用的パート</span>
          <strong>時給</strong>
          <div class="guide-rule">
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
          <small>公式の円単位を表示</small>
        </div>
      </section>
      <section class="guide-grid">
        <article>
          <span>働く場所</span>
          <h2>就業地別</h2>
          <p>求人票に記載された実際の就業場所で地域を集計します。既定はこちらです。</p>
        </article>
        <article>
          <span>受付場所</span>
          <h2>受理地別</h2>
          <p>求人を受け付けたハローワークの所在地で地域を集計します。</p>
        </article>
        <article>
          <span>73職種</span>
          <h2>現行の中分類</h2>
          <p>公式Excelが別シートにした2023年度以降の73職種だけを収録し、旧区分と接続しません。</p>
        </article>
        <article>
          <span>—</span>
          <h2>未公表</h2>
          <p>公式表の「-」は公表なしと表示します。0円や周辺地域の平均で補いません。</p>
        </article>
      </section>
      <section class="note-panel">
        <h2>求人件数は表にありません</h2>
        <p>
          平均求人賃金は、求人票に記載された基本給と定額的に支払われる手当をもとにした公表値です。職種・地域ごとの求人件数がないため、値の安定性や代表性を独自に判定しません。
        </p>
        <a href={dataPage}>厚生労働省 雇用関係指標</a>
      </section>
    </main>
  </Layout>
);

const SourcePage = () => (
  <Layout
    canonical={`${origin}/source`}
    description="職種賃金くらべが利用する厚生労働省の公式Excel、4系列、加工内容、未公表値、確認日、利用条件を示します。"
    title="出典とデータ | 職種賃金くらべ"
  >
    <main class="text-page">
      <div class="page-intro">
        <p class="section-kicker">出典</p>
        <h1>48地域、73職種、4系列を照合。</h1>
        <p>第10表の現行4シートを使い、未公表値を残したまま同じ職種へ対応づけました。</p>
      </div>
      <section class="source-ledger">
        <div>
          <span>提供元</span>
          <strong>厚生労働省</strong>
          <a href={dataPage}>雇用関係指標（年度）</a>
        </div>
        <div>
          <span>公式表</span>
          <strong>第10表 · 職業別平均求人賃金</strong>
          <a href={sourceWorkbook}>公式Excel</a>
        </div>
        <div>
          <span>収録範囲</span>
          <strong>48地域 × 73職種</strong>
          <a href={termsPage}>用語の解説</a>
        </div>
        <div>
          <span>系列</span>
          <strong>月給・時給 × 受理地・就業地</strong>
          <span>2023〜2025年度</span>
        </div>
        <div>
          <span>利用条件</span>
          <strong>公共データ利用規約 第1.0版</strong>
          <a href={useTerms}>厚生労働省の利用規約</a>
        </div>
      </section>
      <section class="prose-section">
        <h2>行った加工</h2>
        <ul>
          <li>第10表の2023年度以降4シートから、73の職業中分類だけを抽出しました。</li>
          <li>全国と47労働局、雇用区分、受理地・就業地、年度を42,048セルに対応づけました。</li>
          <li>38,913個の公表値が正の整数であることを確認しました。</li>
          <li>3,135個の未公表セルはnullとして保持し、0円や平均値で補完していません。</li>
          <li>月給の千円単位は表示時だけ1,000倍して円へ換算します。時給は円単位のままです。</li>
          <li>労働局名を都道府県名へ短縮し、9地域と全国に分類しました。</li>
          <li>出典：厚生労働省「職業安定業務統計 雇用関係指標（年度）第10表」を加工して作成。</li>
        </ul>
      </section>
      <section class="prose-section">
        <h2>ファイル確認</h2>
        <p>
          2026年8月2日取得。1,261,238 bytes、SHA-256:
          7b3e3559d494b6471255383c7ff2a6ba26287463eba05e3a01028560d63f1559。
        </p>
      </section>
    </main>
  </Layout>
);

const PrivacyPage = () => (
  <Layout
    canonical={`${origin}/privacy`}
    description="職種賃金くらべの端末保存、匿名利用計測、保持期間、追跡拒否への対応を示します。"
    title="保存と計測 | 職種賃金くらべ"
  >
    <main class="text-page">
      <div class="page-intro">
        <p class="section-kicker">保存</p>
        <h1>選んだ地域は、端末に。</h1>
        <p>検索語、地域名、職種、年度、雇用区分、地域の基準をサーバーへ記録しません。</p>
      </div>
      <section class="privacy-grid">
        <article>
          <h2>端末に保存</h2>
          <p>比較に選んだ公開地域IDを最大4件だけブラウザへ保存します。アカウントは不要です。</p>
        </article>
        <article>
          <h2>操作名だけを計測</h2>
          <p>訪問、検索、0件、条件変更、職種選択、比較追加、コピーの操作名だけを計測します。</p>
        </article>
        <article>
          <h2>35日で削除</h2>
          <p>
            ランダムなセッションIDをSHA-256で変換し、操作名、QA区分、時刻とともにD1へ保存します。
          </p>
        </article>
        <article>
          <h2>追跡拒否を尊重</h2>
          <p>
            Do Not TrackまたはGlobal Privacy
            Controlが有効な場合は計測しません。広告・外部解析・Cookieは使いません。
          </p>
        </article>
      </section>
    </main>
  </Layout>
);

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("requestId", crypto.randomUUID());
  await next();
  c.header(
    "Content-Security-Policy",
    "default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self'",
  );
  c.header("Cross-Origin-Opener-Policy", "same-origin");
  c.header("Cross-Origin-Resource-Policy", "same-origin");
  c.header("Permissions-Policy", "camera=(), geolocation=(), microphone=(), payment=(), usb=()");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("X-Request-Id", c.get("requestId"));
});
app.use(
  "*",
  jsxRenderer(({ children }) => <>{children}</>),
);
app.get("/", (c) => c.html(<HomePage />));
app.get("/guide", (c) => c.html(<GuidePage />));
app.get("/source", (c) => c.html(<SourcePage />));
app.get("/privacy", (c) => c.html(<PrivacyPage />));
app.post("/api/telemetry", async (c) => {
  sameOrigin(c);
  const body = await parseJson(c);
  if (
    typeof body !== "object" ||
    body === null ||
    !("name" in body) ||
    typeof body.name !== "string" ||
    !eventNames.has(body.name)
  )
    throw new ApiError("invalid_event", 400);
  await record(c, body.name);
  return c.body(null, 202);
});
app.get("/health", async (c) => {
  const row = await c.env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
  return c.json({
    asOf: "2026-08-02",
    ok: row?.ok === 1,
    records: 42048,
    service: "shokugyo-chingin",
  });
});
app.get("/sitemap.xml", (c) => {
  const paths = ["/", "/guide", "/source", "/privacy"];
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((path) => `<url><loc>${origin}${path}</loc></url>`).join("")}</urlset>`;
  c.header("Cache-Control", "public,max-age=300,s-maxage=300");
  c.header("Content-Type", "application/xml; charset=utf-8");
  return c.body(xml);
});
app.notFound((c) => {
  c.status(404);
  return c.html(
    <Layout
      canonical={`${origin}/404`}
      description="指定されたページは見つかりません。"
      noindex
      title="ページが見つかりません | 職種賃金くらべ"
    >
      <main class="text-page">
        <div class="page-intro">
          <p class="section-kicker">404</p>
          <h1>この職種カードは見つかりません。</h1>
          <p>
            <a href="/">職種と地域の比較へ戻る</a>
          </p>
        </div>
      </main>
    </Layout>,
  );
});
app.onError((error, c) => {
  if (error instanceof ApiError)
    return c.json({ error: error.message, requestId: c.get("requestId") }, error.status);
  console.error(
    JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
      requestId: c.get("requestId"),
    }),
  );
  return c.json({ error: "internal_error", requestId: c.get("requestId") }, 500);
});

export const scheduled = async (_event: ScheduledEvent, env: Bindings, _ctx: ExecutionContext) => {
  await env.DB.prepare("DELETE FROM product_events WHERE created_at < ?")
    .bind(nowSeconds() - 35 * 86400)
    .run();
};

export default app;

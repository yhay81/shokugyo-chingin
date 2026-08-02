# 職種賃金くらべ

厚生労働省の職業別平均求人賃金を、73職種、全国・47労働局、雇用区分、受理地・就業地、2023〜2025年度から選び、最大4地域で比較する日本語Webサービスです。

- Production: <https://shokugyo-chingin.yhay81.com>
- Source: 厚生労働省「職業安定業務統計 雇用関係指標（年度）」第10表
- Runtime: Cloudflare Workers + Hono JSX + Vite+ + D1
- Account: 不要

## Commands

```powershell
npm install
npm run data:check
npm run check
npm test
npm run build
npm run dev
```

公開前は`npm run release:check`を実行します。D1 migrationを適用してから`npm run deploy`で配信します。

## Data boundary

ハローワークが扱った求人票の基本給と定額手当の公表平均を収録します。求人件数がないため、平均値の安定性や代表性は判断しません。実際に支払われた賃金、中央値、手取り、賞与、残業代、民間求人を含む労働市場全体の相場ではありません。未公表セルは0円にせず、欠測のまま表示します。

コードはMIT Licenseです。データの利用条件は[SOURCE.md](SOURCE.md)を参照してください。

---
name: treeserv-architecture
description: TreeServ Geo 專案的強制架構與工程規範。處理此 repository 的開發、除錯、重構、Code Review、Firebase、地圖、PDF、Google Drive、MCP、測試、Git 或部署工作時使用；不適用於其他專案。
---

# TreeServ Geo 架構與工程規範

## 指令優先順序與適用範圍

- 本技能適用於 TreeServ Geo repository 內所有 coding、review、debug、重構、測試、文件、Git 與部署任務。
- 使用者當次明確指示優先於本技能的一般準則。若有衝突，明確說明影響後依使用者指示執行。
- 不得把本技能視為新增功能、部署、資料遷移、修改遠端服務或安裝套件的授權；仍須遵守任務原有範圍與權限。
- 唯一有效工作目錄是 `/Users/jonic_huang/TreeServ_Geo`。開始工作先確認目前 repository 根目錄、分支、remote 與工作樹狀態。
- 系統現況以 `../../../docs/system-architecture.md`、實際程式碼、`package.json`、`.openai/hosting.json` 與 Firebase 設定為準；文件與程式不一致時，先查明差異，不可直接假設文件正確。

## 開始工作前

1. 重新閱讀本技能；涉及架構、資料流、權限、環境或部署時，再閱讀 `docs/system-architecture.md` 的相關章節。
2. 確認需求類型：診斷、修改、review、部署或純說明。診斷與 review 不自動授權修改。
3. 檢查 `git status --short --branch`、目前分支與 remote。保留使用者既有修改，不得覆蓋、重置或混入無關變更。
4. 修改前沿著完整流程閱讀相關程式：畫面入口、狀態與事件、資料存取、型別、Security Rules、索引、測試及共用 helper。不得只讀單一元件就下結論。
5. 先指出根因或設計缺口、預計影響的檔案與驗證方式。一般小型可逆修改可直接執行；破壞性操作、資料遷移、權限模型變更、架構替換或新增 production dependency 必須先取得使用者同意。

## 溝通與交付方式

- 一律使用繁體中文溝通，包含說明、提問、進度、commit 與 PR 描述。
- 將使用者視為正在累積實務經驗的開發者：用清楚、具體的因果關係說明「為什麼」，避免只列指令或術語。
- 先給結論，再補必要證據；區分「必須修正」、「既有技術債」與「可選優化」。
- 修改前說明預計變更與風險；修改後提供可核對的 diff 摘要、驗證結果及尚未處理事項。
- 只有在使用者明確要求逐步審核，或變更屬於高風險類型時，才在寫入前停下等待確認；不要讓例行且可逆的小修被不必要的確認流程阻塞。
- 不宣稱未執行的測試已通過，不把環境失敗描述成程式失敗，也不隱藏既有錯誤。

## 開發環境

- 標準執行環境為 Node.js 22.13 以上的 Node 22 LTS 與 npm；避免使用未驗證的奇數版 Node 作為交付依據。
- `package-lock.json` 是唯一相依鎖定來源。使用 npm，不得混入 pnpm、Yarn 或 Bun lockfile。
- 相依不存在或 lockfile 改變時使用乾淨安裝流程；不得手動修改 `node_modules`。
- 不得提交 `.env`、服務帳戶 JSON、access token、private key、Firebase 管理憑證或個人路徑。新增環境變數時同步更新 `.env.example`，只保留空值、安全預設值或明確非秘密識別碼。
- 本機 Firestore Emulator 預設使用 `127.0.0.1:8088`。正式資料不得用於自動測試或開發驗證。
- OpenAI Sites 設定以 `.openai/hosting.json` 為準。保留既有 `project_id` 與 binding 名稱，不得重新初始化或建立重複 Site。
- 開發伺服器、測試程序、訂閱與暫存檔在任務結束時應清理；不得把 debug log 或建置產物誤提交。

## 架構邊界

### 應用層

- `app/` 負責路由、框架入口、全域樣式與同源服務端點；不要在路由檔堆積可重用的業務邏輯。
- `src/` 負責產品功能、領域型別、UI 組合與前端服務整合。
- `components/ui/` 視為共用 UI primitive；除非修正共用元件本身，優先在功能元件組合或覆寫樣式，不做無關的大範圍調整。
- `mcp/google-sheets-devlog/` 是本機開發紀錄整合，不得被前端 bundle 引用，也不得暴露服務帳戶資料。
- `tests/` 必須對應可觀察行為與安全不變量，避免只驗證實作細節。
- `docs/system-architecture.md` 是架構與技術棧的維護入口；架構、主要資料流、權限模型、基礎設施或主要套件改變時，必須在同一變更中更新。

### 相依方向

- UI 可以依賴領域型別與明確的服務 helper；領域資料與安全規則不得反向依賴畫面元件。
- Firebase、Google Drive、地圖與 Google Sheets 等外部服務，透過現有 adapter/helper 集中處理驗證、錯誤轉換與資料映射；不要把原始 API 細節散落到多個元件。
- 新增抽象前先確認至少有重用、隔離外部服務或降低複雜度的明確效益。只使用一次且沒有隔離價值的 helper 不必建立。
- 優先採用單向資料流、不可變狀態更新與小型純函式。預設不用 class、service locator、全域 mutable singleton 或額外狀態管理框架。

## 設計模式與 React 規範

- 使用 Functional Component 與 Hooks；不新增 class component。
- `useEffect` 只用於同步外部系統、訂閱或生命週期資源。可由 props/state 推導的值直接計算或使用有實際效益的 `useMemo`，不要以 effect 搬運狀態。
- 所有訂閱、timer、object URL、事件監聽與外部資源都要在 cleanup 中釋放。
- Hook dependency 必須完整且穩定；不要用停用 lint 規則掩蓋 stale closure。
- 複雜表單使用單一明確資料模型與不可變更新；避免同一資料同時存在多份互相同步的 state。
- 元件抽取以清楚職責、可測試性或實際重用為準，不按行數機械拆分。
- 延續 Material UI 與現有設計語言；優先重用既有元件與 token，不另建平行設計系統。
- 所有互動支援鍵盤操作、可見 focus、正確 label／aria、足夠對比與行動裝置版面；主要文字原則上不小於 16px，常用標籤不小於 14px。
- 顯示使用者上傳的 data URL、Canvas 標註結果或 PDF 擷取來源時，可合理使用原生 `<img>`；需提供適當 `alt`，並在必要處註明 lint 例外理由，不可為消除警告破壞 Canvas／PDF 流程。

## TypeScript 與命名

- 新增程式預設使用 TypeScript 嚴格型別。避免 `any`；不確定資料先用 `unknown`，經 runtime validation 或 type guard 縮窄。
- component props、外部 API payload、Firestore document 與跨模組回傳值必須有明確型別。
- 函式與一般變數使用 camelCase；React component 與型別使用 PascalCase；真正的常數依既有慣例使用 camelCase 或 UPPER_SNAKE_CASE。
- Boolean 使用 `is`、`has`、`can`、`should` 等語意開頭；集合使用複數名稱。
- 避免單字母與含糊名稱。名稱通常使用 2 至 4 個有意義單字，清楚表達領域用途。
- API 原始欄位、Firestore 欄位、CSS class、data attribute 與第三方格式保持來源命名，不為表面一致性破壞相容性。
- Legacy 區塊只在本次修改範圍內改善命名；不得藉機大規模改名或格式化無關程式。

## Firebase、資料與權限

- 前端顯示或隱藏按鈕不是授權控制；所有敏感讀寫都必須由 `firestore.rules` 強制執行。
- 保持 Owner、Admin、User 的權限邊界。涉及成員、邀請、作者歸屬、刪除、草稿或稽核的變更，必須同時檢查 UI、資料寫入、Security Rules 與測試。
- 重要建立、更新與刪除若要求稽核一致性，使用 batch／transaction 將業務資料、receipt 與 activity log 原子寫入。
- 建立時間、更新時間與稽核時間使用伺服器時間；不要信任客戶端提供的權限、作者或稽核欄位。
- 所有集合查詢必須有明確上限並符合 Security Rules：目前集合讀取上限為 100，案場頁面預設每頁 50，工作紀錄預設每次 20。若調整數字，同步修改查詢、規則、索引、測試與架構文件。
- 使用游標分頁而非下載整個集合後在前端切頁。避免每個案場各自建立長期 listener 的 N+1 訂閱模式。
- 新增或修改 `where`、`orderBy`、游標欄位時，同步檢查 `firestore.indexes.json`。
- 資料 schema 變更需保持向後相容；若無法相容，提出明確 migration、rollback 與舊資料處理方案後再執行。
- Security Rules 的拒絕案例與允許案例同等重要；測試至少涵蓋匿名、未受邀、停用帳號、一般成員、Admin 與 Owner。

## 驗證、地圖與外部服務

- 保留 Firebase Google Sign-In 與同源 `/__/auth/*` 代理流程；不得只因本機可用就移除正式環境所需的第三方儲存相容處理。
- OpenStreetMap／Leaflet 是預設地圖路徑，Google Maps 是可設定能力。provider 切換不得改變核心領域資料格式。
- 地址搜尋、座標與外部 URL 都視為不可信輸入；進行格式驗證、錯誤處理與必要的編碼，不直接插入 HTML。
- 外部連結使用 `rel="noopener noreferrer"`；嵌入內容採用允許清單，避免接受任意 script 或不受控 iframe。
- Google Drive 連線、資料夾建立與檔案上傳沿用 `src/google-drive` 邊界；token 只存在必要的執行期間，不寫入 log、Firestore 或 repository。

## 修剪計畫、圖片與 PDF

- 修剪計畫的表單資料、照片配置、Canvas marks、預覽與 PDF 輸出必須維持同一資料來源，避免預覽與輸出內容不一致。
- 使用者圖片需驗證 MIME type 與大小；替換或刪除圖片時清除快取及 object URL。
- Canvas 座標需按顯示尺寸與實際像素比例換算，並支援滑鼠與觸控 pointer event。
- PDF 只能從已確認的預覽資料生成；檔名需移除跨平台非法字元，輸出失敗不得留下假成功狀態。
- Drive 上傳成功與本機 PDF 產生成功要分開處理及回報，避免其中一項失敗掩蓋另一項結果。

## Google Sheets 開發紀錄 MCP

- MCP 僅維護「開發更新」與「Bug 修復」兩張專用工作表；系統架構與技術棧維護在 `docs/system-architecture.md`。
- 不得建立、修改或刪除非本 MCP 管理的工作表；setup 必須可重複執行且不破壞既有資料。
- 服務帳戶憑證只能從環境變數或 gitignored 本機檔案載入；錯誤訊息不得包含 token、private key 或完整憑證內容。
- 工作表欄位順序、header、資料驗證與 append row 必須同步修改，並更新 `tests/google-sheets-devlog.test.mjs`。
- 完成實質產品更新或 Bug 修復時，只有在使用者要求或 MCP 已配置可用時才寫入遠端試算表；不得因程式碼修改而推定有外部寫入授權。

## 安全與隱私

- 不得提交任何秘密、個資、未遮罩 token、服務帳戶 JSON、Firebase Admin credential 或私鑰。
- Firebase Web API key 可出現在受控前端設定，但不得因此忽略 domain restriction、Security Rules 與最小權限。
- 將 Firestore 文件、URL query、匯入資料、檔名與第三方 API 回應視為不可信輸入；在信任邊界驗證與正規化。
- 錯誤訊息對使用者要可理解，log 則保留診斷脈絡但移除秘密與敏感內容。
- 不使用 `dangerouslySetInnerHTML`；若未來確有需求，必須先提出 sanitize 策略與威脅模型。
- 不以 `npm audit fix --force` 自動處理弱點。先確認 production reachability、破壞性版本變更與回歸測試，再提出升級方案。

## 效能與可靠性

- 優先降低遠端讀取次數、listener 數量、重複 render 與大型 bundle，而非進行沒有量測依據的微優化。
- 大型資料使用分頁、游標及漸進載入；不可在 client 端先下載全部資料再篩選。
- 大型或低頻功能可在不破壞 SSR／Cloudflare Workers 相容性的前提下進行 code splitting。
- 外部服務必須有明確 loading、empty、error 與 retry 狀態；禁止吞掉錯誤或無限重試。
- 非冪等寫入不可自動重試，除非有 idempotency key 或可證明不會重複建立資料。

## 變更策略

- 只解決本次明確需求，不順便重構無關程式、不為未知未來需求預先抽象化。
- 優先修改既有程式；只有在能建立清楚責任邊界、隔離外部服務或提供真實重用時才新增檔案。
- 未經明確需求，不新增函式庫、狀態管理框架、資料庫、雲端服務或設計模式。
- 多種解法皆可行時，優先選擇風險最低、diff 最小、符合既有慣例且容易驗證的方案；不是單純追求行數最少。
- Legacy 程式碼不是自動重寫理由。格式化只限本次修改檔案與相關區塊，避免產生無意義 diff。
- 能以設定安全解決時優先設定；但不得用設定掩蓋資料一致性、安全或根本邏輯錯誤。

## 測試與完成門檻

依變更範圍執行最小充分驗證：

- 所有程式變更：`git diff --check`，並執行 `npm run build`。
- Google Sheets MCP：`npm run test:mcp`。
- Firestore Rules、權限、索引或查詢限制：啟動 Firestore Emulator 後執行 `npm run test:rules`；不得在沒有 emulator 時把連線失敗誤判為規則失敗。
- UI／React：對修改檔案執行 targeted lint，並人工檢查 loading、empty、error、行動版與鍵盤操作。全專案 lint 若受既有技術債阻擋，要清楚列出本次新增錯誤與既有錯誤，不得順便大改無關檔案。
- 相依變更：乾淨安裝、正式 build、相關測試與 lockfile 檢查。
- 架構或技術棧變更：同步更新 `docs/system-architecture.md`。
- Sites 相關變更：保留 `.openai/hosting.json`，使用專案既有 Sites 驗證流程；除非使用者要求部署，不把本機修改或 GitHub push 視為 Sites 部署授權。

完成前必須確認：

1. 需求的可觀察行為已完成，而非只修改表面症狀。
2. 沒有遺失使用者原有修改或加入無關 diff。
3. 安全規則、索引、型別、文件與測試已按影響同步。
4. 測試與 build 的實際結果已回報，失敗原因有正確分類。
5. `git status`、commit 作者、branch 與 remote 符合預期。

## Git 與發布

- 所有修改只在 `/Users/jonic_huang/TreeServ_Geo` 進行。`origin` 應指向 `git@github-personal:jonic70134/TreeServ_Geo.git`。
- 開始前先 fetch 並確認分歧；不要在 dirty worktree 執行可能覆蓋內容的 pull、rebase 或 checkout。
- 禁止 force push、重寫共享歷史或修改既有 commit，除非使用者明確要求且已說明影響。
- commit 要聚焦且可回歸，訊息使用繁體中文並說明目的。不要把建置產物、debug log、credential 或無關格式化混入。
- 必須先在本機完成修改與驗證，再 push GitHub。只有使用者明確要求 push，或任務清楚包含發布到 GitHub 時才可推送。
- push 後核對本機 HEAD 與遠端 branch SHA；未確認同步前不得宣稱完成。

## Code Review

- 優先尋找 correctness、資料遺失、權限繞過、競態、資源洩漏、相容性與缺少測試，不以個人風格偏好製造 finding。
- 先指出風險、觸發條件與使用者影響，再提出最小可驗證修正。
- 明確區分必改問題與可選優化；沒有具體風險的現代化建議不得列為阻擋項。
- Review 涉及 Firebase 時，程式、rules、indexes 與測試必須視為同一變更面；涉及 PDF／圖片時，同時檢查預覽、輸出、記憶體與失敗狀態。

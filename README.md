# TreeServ Geo

TreeServ Geo 是以地圖為中心的案場工作紀錄系統。前端主要介面使用 Vue 3，透過 Firebase Authentication 提供 Google 登入，並以 Cloud Firestore 保存地點與工作時間軸。

## 已包含的功能

- OpenStreetMap 預設地圖、目前位置與地址自動定位（Google Maps 入口保留）
- 每筆工作紀錄可保存 A → 途經點 → B 手動進場路線、方向箭頭與進場說明；點選路線後可拖曳調整，最多 100 點
- Owner 可編輯及刪除所有工作紀錄；User 僅可編輯本人紀錄。更新及刪除皆需再次確認，更新保留原作者
- Owner 專用登入與操作紀錄頁，按時間倒序，每次載入 50 筆，以台灣時間顯示至秒
- Owner 專用修剪計畫書工作頁，整理人事時地物、業主需求、聯絡窗口與現場限制
- 現場照片可使用畫筆、弧線、方向箭頭與圈選工具標註；圖面與計畫書 PDF 可分別保存到指定的 Google Drive 專案資料夾
- 已記錄地點的即時搜尋與 autocomplete
- 地點注意事項及歷史工作時間軸
- 文字、圖片 URL、YouTube 嵌入與檔案 URL
- Firestore 即時更新與未設定服務時的示範模式
- Owner / User / Guest 權限，並保留 editor、manager 等角色擴充點
- Owner：`jonic70134@gmail.com`

## Firebase 設定

1. 在 Firebase Console 建立專案，資料庫選擇 **Cloud Firestore**。
2. 在 Authentication 啟用 **Google** 登入方式。
3. 將 Firebase Web App 設定值填入 `.env.local`（欄位請參考 `.env.example`）。
4. 將部署網址加入 Firebase Authentication 的授權網域。
5. 使用 Firebase CLI 部署 `firestore.rules` 與 `firestore.indexes.json`。

資料結構：

- `locations/{locationId}`：名稱、地址、座標、狀態、注意事項、別名與建立者。
- `workRecords/{recordId}`：地點 ID、文字內容、圖片 URL、YouTube URL、檔案 URL、作者與時間。
- `users/{uid}`：預留角色與個人資料；一般登入帳號預設為 user。
- `activityLogs/{id}`：帳號、登入／登出／開啟編輯／建立／更新／刪除及計畫圖面／PDF 儲存事件與伺服器時間。僅 Owner 可讀，客戶端無法修改或刪除。
- `recordDeletions/{recordId}`：刪除的稽核收據，與工作紀錄刪除及操作紀錄以同一批次提交；不保留完整紀錄內容，不能用於還原。
- `importedRecordStates/{recordId}`：匯入紀錄的刪除標記，讓所有裝置持續隱藏已刪除的匯入項目；不含帳號資料。原始匯入素材仍留在程式來源。

群組匯入紀錄不再限制 Owner 唯讀。首次修改時保存資料庫版本，保留匯入作者的顯示名稱與施工日期；後續讀取優先使用資料庫版本。既有日期分頁、施工人員、吊車、天氣及醫療等欄位均保留。

登入事件包含網頁啟動時 Firebase 恢復的登入狀態；登出只記錄網站內的登出動作。關閉瀏覽器、Firebase Console 或管理員 SDK 的操作不在客戶端事件紀錄範圍內。歷史事件不會回補。登入與開啟編輯的事件由客戶端發起，時間與帳號由 Firestore 規則驗證；這不是 Firebase Authentication 的完整身分驗證日誌。

建立、更新及刪除與稽核紀錄一起提交；稽核寫入失敗時整個操作失敗。正式站啟用此版本前，必須同步部署 `firestore.rules`；舊版網頁需重新整理後才能寫入。部署時請保留 Sites 執行期 Firebase 環境設定，不將金鑰寫入版本控制。

## 權限測試

以 `demo-treeserv` 專案啟動本機 Firestore Emulator（127.0.0.1:8088），執行 `npm run test:rules`。測試僅操作模擬器資料，涵蓋訪客讀取、Owner 跨作者修改、本人修改限制、作者保留、路線保存、稽核不可變及原子刪除。

## Google Maps 設定

在 Google Cloud 啟用 **Maps JavaScript API** 與 **Geocoding API**，把瀏覽器金鑰填入 `VITE_GOOGLE_MAPS_API_KEY`。建議將金鑰限制為正式網站網域，並限制只可呼叫這兩項 API。可另填 `VITE_GOOGLE_MAP_ID` 套用自訂地圖樣式。

## Google Drive 計畫書存檔

Google Drive API 必須在 Firebase 所屬的 Google Cloud 專案啟用。Owner 在計畫書頁按下「連接 Google Drive」後，網站以 Firebase Google 登入要求 `drive.file` 權限；此權限只允許 TreeServ Geo 存取由它建立或開啟的檔案，不會讀取整個雲端硬碟。

計畫書頁會依輸入的資料夾名稱尋找由 TreeServ Geo 建立的資料夾，找不到時在「我的雲端硬碟」建立。標註圖片與 PDF 保持 Google Drive 的預設限制存取，不會建立「知道連結的任何人」權限；回傳的 `webViewLink` 仍需使用獲授權的 Google 帳號登入。

## 本機開發

```bash
npm install
cp .env.example .env.local
npm run dev
```

未提供 Firebase 或 Google Maps 設定時，網站會以內建示範資料和預覽地圖運作，方便先驗收操作流程。

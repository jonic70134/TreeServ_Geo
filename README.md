# TreeServ Geo

TreeServ Geo 是以地圖為中心的案場工作紀錄系統。前端主要介面使用 Vue 3，透過 Firebase Authentication 提供 Google 登入，並以 Cloud Firestore 保存地點與工作時間軸。

## 已包含的功能

- Google Maps 點位、目前位置與地址自動定位
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

## Google Maps 設定

在 Google Cloud 啟用 **Maps JavaScript API** 與 **Geocoding API**，把瀏覽器金鑰填入 `VITE_GOOGLE_MAPS_API_KEY`。建議將金鑰限制為正式網站網域，並限制只可呼叫這兩項 API。可另填 `VITE_GOOGLE_MAP_ID` 套用自訂地圖樣式。

## 本機開發

```bash
npm install
cp .env.example .env.local
npm run dev
```

未提供 Firebase 或 Google Maps 設定時，網站會以內建示範資料和預覽地圖運作，方便先驗收操作流程。

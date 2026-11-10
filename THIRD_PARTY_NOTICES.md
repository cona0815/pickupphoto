# 第三方元件與素材（校園拾光 2026v50，2026-11-10 清點）

| 項目 | 用途 | 授權 | 怎麼用 |
|---|---|---|---|
| JSZip 3.10.1 | 壓縮 ZIP | MIT（雙授權 MIT／GPLv3，本專案採 MIT） | jsDelivr 載入，SRI 鎖定，未修改 |
| onnxruntime-web 1.20.1 | 跑人臉模型 | MIT | 同上 |
| @vladmandic/face-api 1.7.14（含模型） | 人臉特徵 | MIT | 同上 |
| YuNet face_detection_yunet_2023mar（OpenCV Zoo） | 人臉偵測模型 | MIT | 從 GitHub 下載，比對 SHA-256 |
| heic2any 0.0.4 | HEIC 轉檔 | MIT；內含 libheif／libde265（LGPL-3.0） | jsDelivr 載入原始檔，未修改、未併入本專案程式碼 |
| mp4-muxer 5.2.2 | 把影片裝成 MP4 | MIT | jsDelivr 載入，SRI 鎖定，未修改 |
| taiwan-atlas 鄉鎮市區界線 | 離線判斷地名 | MIT（資料來源：內政部開放資料） | 內嵌 |
| Noto Sans TC、JetBrains Mono | 字型 | SIL Open Font License 1.1 | 由 Google Fonts 載入 |
| OpenStreetMap Nominatim | 查地標名稱（按了才查） | 資料 ODbL，© OpenStreetMap 貢獻者 | 畫面上有標示出處 |
| 內建配樂 10 首 | 回顧短片配樂 | 公眾領域／CC0（Kevin MacLeod、Bryan Teoh） | 明細見 `audio/bgm/SOURCES.md` |

只放連結、沒有使用其程式碼或素材：Concat（AGPL-3.0）、7-Zip、Google AI Studio。

影片的 H.264／AAC 編碼由使用者的瀏覽器與作業系統提供，本專案沒有散布任何編碼器。

Gemini（Google）是使用者用自己的 API Key 呼叫的服務，不是本專案的一部分。

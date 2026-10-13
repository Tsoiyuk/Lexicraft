# LexiCraft 部署步驟

整個過程大約 15 分鐘。LexiCraft 和「抱佛腳」共用同一個 Supabase 專案，所以不需要新建 Supabase，也不需要新的帳號。

## 1. 建立資料表

1. 打開 Supabase 控制台，進入抱佛腳所在的專案。
2. 左側選 **SQL Editor** → **New query**。
3. 把 `supabase/schema.sql` 的全部內容貼進去，按 **Run**。

看到 `Success. No rows returned` 就完成了。所有新表都以 `lc_` 開頭，不會影響抱佛腳的資料。

> 這段 SQL 只需要執行一次。重複執行會因為「已存在」而報錯，屬於正常現象。

## 2. 填寫連線資訊

打開 `js/config.js`，把兩行換成抱佛腳使用的同一組值：

- `SUPABASE_URL`：Supabase 控制台 → **Project Settings** → **API** → Project URL
- `SUPABASE_ANON_KEY`：同一頁的 `anon` `public` key

anon key 本來就會出現在網頁裡，可以公開；資料安全由第 1 步建立的權限規則保證。**千萬不要**填 `service_role` key。

## 3. 上傳到 GitHub 並開啟 Pages

1. 在 GitHub 新建一個公開的 repository，例如 `lexicraft`。
2. 在 repository 頁面點 **Add file** → **Upload files**，把整個資料夾裡的所有檔案和資料夾拖進去（包括 `.nojekyll`），按 **Commit changes**。
3. 進入 **Settings** → **Pages**，Source 選 **Deploy from a branch**，Branch 選 `main`、資料夾選 `/ (root)`，按 **Save**。
4. 一兩分鐘後，頁面上方會顯示網址，例如 `https://你的帳號.github.io/lexicraft/`。

## 4. 允許登入郵件跳回 LexiCraft

Supabase 控制台 → **Authentication** → **URL Configuration** → **Redirect URLs** → **Add URL**，加入：

```
https://你的帳號.github.io/lexicraft/**
```

**Site URL 保持抱佛腳的網址不要改**。沒有這一步，LexiCraft 寄出的驗證信、登入連結和重設密碼信會跳到抱佛腳。

另外要注意，兩個工具共用同一套郵件範本，所以 LexiCraft 寄出的信，標題和內文會和抱佛腳一樣。如果想讓內容通用一些，可以在 **Authentication** → **Email Templates** 把信件文字改成不提及具體工具名稱。

## 5. 搬移舊的單詞卡

1. 用抱佛腳的帳號登入 LexiCraft。
2. 新建項目，類型選「闪卡」，模板選「基础：单词 / 释义 / 例句 / 笔记」。
3. 進入「词库」→「导入」，選擇 `old-flashcards.json`（和這個資料夾分開提供，**不要上傳到 GitHub**），按「导入」。

5 個單詞和它們的複習進度都會一起搬過來。

## 6. 邀請朋友共同編輯詞典

1. 在詞典項目的「设置」→「共享与协作」裡，複製邀請連結，再按「生成 / 刷新密钥」。
2. 把連結和密鑰一起傳給朋友。密鑰只會顯示一次，忘記了就再刷新一次，已加入的成員不受影響。
3. 朋友打開連結、註冊或登入後輸入密鑰，就能一起編輯。

## 之後更新程式

修改後的檔案同樣用 **Upload files** 上傳覆蓋，GitHub Pages 會在一兩分鐘內自動更新。如果資料庫結構有變動，我會另外提供要執行的 SQL。

## 已知限制

- **中國大陸訪問**：GitHub Pages 和 Supabase 在大陸都可能連不上或很慢，與抱佛腳的情況相同，可以沿用抱佛腳的解法。
- **自訂字型的授權**：上傳的字型會提供給所有項目成員下載使用，請確認字型授權允許這樣做。
- **朗讀**：使用瀏覽器內建的語音，可用的語言和音色取決於使用者的裝置。

# LexiCraft

背单词，也造词典。 / Learn words. Build dictionaries.

- **闪卡**：每张卡可以有任意多面（例如德语名词：冠词+原形 → 复数 → 释义），按间隔重复安排复习。
- **词典**：像 Excel 一样编辑表格，像 Wiktionary 一样查阅词条；支持字元表、逐字拆解、读法模板、自定义字体和特殊字符键盘，适合自创语言。
- **协作**：项目默认私有，凭邀请链接和密钥加入后可共同编辑，修改即时同步。
- 中文 / English 界面，电脑和手机通用，数据存于 Supabase。

纯静态网页（原生 ES 模块，无需构建），直接部署到 GitHub Pages。部署步骤见 `DEPLOY.md`。

## 结构

```
index.html               入口
css/style.css            样式
js/config.js             Supabase 地址与 anon key（部署前填写）
js/app.js                路由与登录状态
js/store.js              数据读取、写入与实时同步
js/views/*.js            各页面：登录、首页、复习、词库、查阅、表格、设置
supabase/schema.sql      数据库结构与权限规则
```

本地预览需要用 HTTP 服务器打开（ES 模块不能从 file:// 载入）：

```
python3 -m http.server 8000
```

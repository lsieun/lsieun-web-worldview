# WorldView 天下

历史、地理与人物——一部可以漫游的世界史。

- **史册**：楚汉之际、丝路初开、大航海
- **舆图**：十三座文明坐标、三条历史通道（ECharts 世界地图）
- **人物**：统一时间轴上的生命线档案

## 技术栈

Eleventy 3 + 原生 CSS + 原生 JS + ECharts（全部本地自托管）。

## 开发

```bash
npm install
npm run dev      # http://localhost:8080
npm run build    # 输出到 dist/
```

## 目录

```text
src/
├── _data/       site.json / hubs.json / eras.json
├── _includes/   head / header / footer / atlas
├── _layouts/    default / entry
├── assets/      css / js / data（含 world.json）
└── content/     history / geo / figures
```

## 新增内容

- 史册 / 舆图 / 人物详情页：在对应 `content/` 目录新增 HTML，按 `specs/01-website-c-structure.md` 填写 Front Matter。
- 舆图坐标：编辑 `src/_data/hubs.json`。
- 样式与路由约定：见 `specs/` 与 `ai-instructions.md`。

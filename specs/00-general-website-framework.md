# 通用建站决策与设计框架

本项目属于 lsieun-web 矩阵，遵循 `lsieun-web-auxiliary` 的通用契约：

- **解耦**：独立仓库、独立依赖，不与矩阵其他项目共享代码或子模块。
- **HTML-Only**：`src/` 目录内禁止出现 `.md` 文件，页面统一使用 HTML + Nunjucks，避免 Markdown 解析残留。
- **本地自托管**：字体、ECharts、地图 GeoJSON 全部随项目发布，不依赖外部 CDN。
- **格式化保护**：含 Front Matter 的 HTML 必须把 `# @formatter:off` / `# @formatter:on` 写在 YAML 内部，且文件第一行为 `---`。
- **中正之美**：形式服务内容；装饰元素克制使用，颜色与主题来源于「山河舆图」的内容气质。
- **阶段交付**：先骨架与设计系统，再逐栏目补充内容；任何结构性调整先与用户确认。

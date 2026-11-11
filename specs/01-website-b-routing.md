# 路由规范

## 1. 输出规则

由 `eleventy.config.js` 的全局 `permalink` 统一控制：

| 源文件 | 输出 |
| :--- | :--- |
| `src/index.html` | `/index.html` |
| `src/404.html` | `/404.html` |
| `src/content/history/index.html` | `/history/index.html` |
| `src/content/history/chu-han.html` | `/history/chu-han.html` |
| `src/content/figures/liubang.html` | `/figures/liubang.html` |

规则：剥离统一的 `/content` 前缀，保留栏目层级，统一以 `.html` 结尾。

## 2. 栏目与路径

| 栏目 | 索引 | 详情 |
| :--- | :--- | :--- |
| 史册 History | `/history/index.html` | `/history/<slug>.html` |
| 舆图 Geography | `/geo/index.html` | `/geo/<slug>.html` |
| 人物 Figures | `/figures/index.html` | `/figures/<slug>.html` |

## 3. 链接约定

- 站内链接一律使用绝对路径并带 `.html` 后缀，不依赖目录默认页。
- 导航高亮通过 `page.url` 与目标路径比较实现。
- 不在导航中使用站外链接；新增栏目需同步修改 `_includes/header.html` 与首页入口。

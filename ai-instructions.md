# AI 协作导航

开发前请先阅读对应规范，避免偏离项目既定契约。

| 我要做的事 | 必读规范 |
| :--- | :--- |
| 修改颜色、字体、版式、组件样式 | `specs/01-website-a-style.md` |
| 新增页面 / 理解 URL 结构 | `specs/01-website-b-routing.md` |
| 新增页面文件 / 配置 Front Matter | `specs/01-website-c-structure.md` |
| 排查构建问题 / 修改 `eleventy.config.js` | `specs/02-build-a-eleventy.md` |
| 修改部署配置（仅可改 `name`） | `specs/03-deploy-a-cloudflare.md` |
| 撰写栏目内容 / 新增舆图坐标 | `specs/05-content-a-style.md` |
| 通用建站决策 | `specs/00-general-website-framework.md` |

## 铁律

1. `src/` 下不出现 `.md` 文件，页面一律 HTML + Nunjucks。
2. 颜色只通过 CSS 变量引用。
3. 第三方资源全部本地自托管。
4. 索引页不得带与集合同名的 tag。
5. 未得到明确同意，不改变三段式栏目结构（索引 → 详情 → 关联）。

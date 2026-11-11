# 内容写作与组件规范

## 1. 写作口径

- 以**结构性解释**为主：讲清条件、选择与后果，不做人物褒贬式的道德评判。
- 每篇详情页遵循：导语（lead）→ 3–4 个 `<h2>` 小节 → 一句引文或结论。
- 年代统一写「前 209」而不是「公元前 209 年」，与 `cnYear` 过滤器输出保持一致。
- 地名首次出现时可附今地，但避免百科式罗列。
- 不用 Markdown 语法；强调用 `<strong>`，术语用 `<em>`（渲染为细下划线）。

## 2. 可用组件

| 组件 | 用法 |
| :--- | :--- |
| 导语 | Front Matter `lead` |
| 引文 | `<blockquote><p>…</p></blockquote>` |
| 说明框 | `<div class="callout"><p class="callout-label">LABEL</p><p>…</p></div>` |
| 列表 | `<ul><li>…</li></ul>`，术语可用 `<strong>` |
| 人物生命线 | Front Matter `birth` / `death` / `milestones`，由 `entry.html` 自动渲染 |

## 3. 舆图数据

- 新增坐标：在 `src/_data/hubs.json` 的 `places` 中追加对象，字段为
  `id / name / en / lon / lat / era / region / weight / summary / figures / events`。
- 新增通道：在 `routes` 中追加 `id / name / points`，颜色由 `atlas.js` 的 `COLORS.routes` 映射。
- 面板内容全部由数据驱动，不需要修改模板。

## 4. 人物与未来的年龄对比模块

人物页已使用统一的年代刻度（`site.axis`）。后续迁移「大清人物年龄对比」时，建议：

- 将人物数据拆为独立 JSON，复用 `pct` 过滤器定位生命线；
- 保留「统一刻度 + 生命线 + 关键节点」三层结构；
- 新增朝代时只扩展数据，不复制视图代码。
- **死亡节点不可省略**：每个人物的死亡都应作为个人关键事件，在事件的 `figures` 中关联本人，并将事件加入对应视图的 `personalEvents`；事件 `year` 应与人物 `death` 一致，标题或 `desc` 应说明去世情形（如病逝、战死、自刎），使生命线上出现明确的死亡节点，不能只填写 `death` 字段。

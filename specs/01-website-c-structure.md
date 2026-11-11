# 目录结构与 Front Matter 规范

## 1. 目录

```text
src/
├── _data/          # 全局数据：site / hubs / eras
├── _includes/      # head / header / footer / atlas
├── _layouts/       # default / entry
├── assets/         # css / js / data（不经模板编译）
├── content/
│   ├── history/    # 史册：index + 详情
│   ├── geo/        # 舆图：index + 详情
│   └── figures/    # 人物：index + 详情
├── index.html
└── 404.html
```

## 2. 详情页 Front Matter

```yaml
---
# @formatter:off
title: "页面标题"
description: "用于搜索结果与分享的摘要"
layout: "entry.html"
category: "史册"          # 史册 / 舆图 / 人物
tags: ["history"]         # history / geo / figure，供集合筛选
era: "秦汉"
span: "前 209 — 前 202"   # 年代或尺度
lead: "导语，一到两句"
keywords: ["关键词"]
order: 1                  # 栏目内排序
# @formatter:on
---
```

- 舆图详情额外提供 `en`、`region`、`coords`。
- 人物详情额外提供 `en`、`region`、`birth`、`death` 与 `milestones`（`year` + `label`），用于渲染生命线。

## 3. 索引页约束

- 索引页**不得**带有与集合同名的 tag（`history` / `geo` / `figure`），否则会把自身加入列表。
- 索引页标题只写栏目名（如「史册」），由 head 模板自动拼接站点名。

## 4. 数据文件

- `site.json`：站点名、描述、坐标、人物时间轴刻度。
- `hubs.json`：舆图坐标（`places`）与通道（`routes`），新增地点只需追加对象。
- `eras.json`：史册页的中国历史纪年带。

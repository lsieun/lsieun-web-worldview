# Eleventy 构建配置规范

## 1. 基本配置

- Eleventy `^3.1.6`，ESM 项目（`"type": "module"`）。
- 输入 `src/`，输出 `dist/`，`_includes` 与 `_layouts` 位于 `src/` 下。
- 模板格式仅 `html`、`njk`；`htmlTemplateEngine: "njk"`。
- `eleventyConfig.ignores.add("src/assets/**")`，防止资源目录被二次解析。

## 2. 直通资源

```js
eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
eleventyConfig.addPassthroughCopy({ "src/favicon.svg": "favicon.svg" });
eleventyConfig.addPassthroughCopy({ "node_modules/@fontsource-variable/inter": "assets/fonts/inter" });
eleventyConfig.addPassthroughCopy({ "node_modules/@fontsource-variable/outfit": "assets/fonts/outfit" });
eleventyConfig.addPassthroughCopy({ "node_modules/@fontsource-variable/jetbrains-mono": "assets/fonts/jetbrains-mono" });
eleventyConfig.addPassthroughCopy({ "node_modules/echarts/dist/echarts.min.js": "assets/js/echarts.min.js" });
```

字体在 `assets/css/fonts.css` 中用 `@font-face` 引用，路径为 `/assets/fonts/<family>/files/*.woff2`。

## 3. 集合与过滤器

- 集合：`historyEntries` / `geoEntries` / `figureEntries`，按 `order` 升序。
- 过滤器：
  - `cnYear`：负数年份输出「前 256」。
  - `pct(value, min, max)`：把年份映射为 0–100 的百分比，用于生命线定位。
  - `categoryName`：tag → 栏目名。

## 4. 常见陷阱

- 列表页不可带与集合同名的 tag。
- Nunjucks 的 `dump` 必须接 `| safe`，否则内联 JSON 会被实体转义。
- 地图数据通过 `fetch('/assets/data/world.json')` 加载，必须经 HTTP 服务访问，直接打开 `dist/index.html` 时地图不会渲染。
- 修改 `eleventy.config.js` 后需重启 dev server。

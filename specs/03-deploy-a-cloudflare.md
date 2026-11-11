# Cloudflare Pages 部署规范

遵循矩阵统一契约，`wrangler.toml` **仅允许修改 `name` 字段**：

```toml
name = "lsieun-web-worldview"
compatibility_date = "2026-07-20"

[assets]
directory = "./dist"
```

- `name` 必须与仓库、项目文件夹名称一致。
- `compatibility_date` 全矩阵锁定为 `2026-07-20`。
- `[assets].directory` 固定为 `./dist`。
- 构建命令：`npm run build`；输出目录：`dist`。
- 地图与字体均为本地资源，部署后无需额外配置 CDN 或跨域。

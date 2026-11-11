/**
 * lsieun-web-worldview — Eleventy 配置
 * 遵循 lsieun-web-auxiliary 契约：HTML-Only、本地自托管、扁平化路由、单一职责。
 */
export default function (eleventyConfig) {
    // 1. 静态资源与本地字体直通映射
    eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
    eleventyConfig.addPassthroughCopy({ "src/favicon.svg": "favicon.svg" });
    eleventyConfig.addPassthroughCopy({ "node_modules/@fontsource-variable/inter": "assets/fonts/inter" });
    eleventyConfig.addPassthroughCopy({ "node_modules/@fontsource-variable/outfit": "assets/fonts/outfit" });
    eleventyConfig.addPassthroughCopy({ "node_modules/@fontsource-variable/jetbrains-mono": "assets/fonts/jetbrains-mono" });

    // 2. ECharts 自托管（全球舆图渲染）
    eleventyConfig.addPassthroughCopy({ "node_modules/echarts/dist/echarts.min.js": "assets/js/echarts.min.js" });

    // 3. 栏目集合：按 order 升序，索引页据此渲染
    const byOrder = (a, b) => (a.data.order ?? 100) - (b.data.order ?? 100);
    eleventyConfig.addCollection("historyEntries", (api) => api.getFilteredByTag("history").sort(byOrder));
    eleventyConfig.addCollection("geoEntries", (api) => api.getFilteredByTag("geo").sort(byOrder));
    eleventyConfig.addCollection("figureEntries", (api) => api.getFilteredByTag("figure").sort(byOrder));

    // 4. 纪年与坐标百分比过滤器
    //    负数年份按“前 256”输出，用于全站统一纪年书写
    eleventyConfig.addFilter("cnYear", (year) => {
        if (year === undefined || year === null || year === "") return "";
        const n = Number(year);
        return n < 0 ? `前 ${Math.abs(n)}` : `${n}`;
    });

    //    将年份映射为 0–100 的百分比，用于生命线 / 时间轴的定位
    eleventyConfig.addFilter("pct", (value, min, max) => {
        if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || max === min) return 0;
        const ratio = ((value - min) / (max - min)) * 100;
        return Math.min(100, Math.max(0, Number(ratio.toFixed(2))));
    });

    // 5. 忽略资源目录，避免模板引擎二次解析
    eleventyConfig.ignores.add("src/assets/**");

    // 6. 路由：/content/<栏目>/<页面> → /<栏目>/<页面>.html，首页与 404 保持根路径
    eleventyConfig.addGlobalData("permalink", () => {
        return (data) => {
            const stem = data.page.filePathStem;
            if (stem === "/index") return "/index.html";
            if (stem === "/404") return "/404.html";
            if (stem.startsWith("/content/")) return `${stem.replace("/content", "")}.html`;
            return `${stem}.html`;
        };
    });

    return {
        dir: {
            input: "src",
            output: "dist",
            includes: "_includes",
            layouts: "_layouts"
        },
        templateFormats: ["html", "njk"],
        htmlTemplateEngine: "njk"
    };
}

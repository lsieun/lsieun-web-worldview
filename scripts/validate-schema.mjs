/**
 * scripts/validate-schema.mjs — 数据层 schema 约束
 *
 * 用法：
 *   node scripts/validate-schema.mjs          # 只校验，不修复
 *   node scripts/validate-schema.mjs --fix     # 自动修复（可自动修的部分）
 *
 * 集成：eleventy.config.js 的 eleventy.before 钩子自动调用
 *       校验失败 → 抛出异常 → Eleventy 中断构建
 *
 * 设计原则：
 *   - 必填字段 = EntityLoader 已经在校验的字段（name/title/year 等）
 *   - 类型严格检查（number 不能写字符串，数组不能写对象）
 *   - 枚举值白名单（region/category/dynasty 必须是已知值）
 *   - 长度上限（title ≤ 50 字，summary ≤ 100 字）
 *   - 多余字段：warn 而非 error（存量清理需要时间）
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../src/_data");
const AUTO_FIX = process.argv.includes("--fix");

/* ===========================================================
 * Schema 定义
 * =========================================================== */

// 已知 region 值（国家/地区代码）
const REGION_VALUES = new Set([
    // 中国
    "cn",
    // 世界主要国家
    "us", "gb", "fr", "de", "it", "es", "pt", "nl", "be", "ch", "at", "se", "no", "dk", "fi", "pl", "ru",
    "jp", "kr", "sg", "in", "cn-tw", "cn-hk",
    "mx", "br", "ar", "ca", "au", "nz", "za", "eg", "tr", "ir", "sa", "il",
    // 新增
    "mk", "gr", "north-america",
    // 跨区域
    "global", "europe", "asia", "americas", "africa", "oceania",
]);

// 已知 event category（中外对比页面筛选按钮来源）
const EVENT_CATEGORIES = new Set([
    "general",   // 通用（朝代、战争、政治、改革、外交、宗教、探索）
    "treaty",    // 条约（特指中外不平等条约）
    "science",   // 科技
    "art",       // 艺术（文学、绘画、建筑、音乐、文艺复兴）
    "ai",        // AI 与计算机（单列以便未来扩展）
]);

// 已知 dynasty（来自 _data/china/dynasties/）
const DYNASTY_VALUES = new Set(); // 运行时从文件动态加载

// 已知旧字段（deprecated）—— per-type 配置，出现在该类型文件中 → warn
// 这些字段曾是早期数据模型的一部分，现已从 schema 移除（功能由新字段替代或不再使用）
const DEPRECATED_FIELDS = {
    figure: new Set(["tags", "activePlaces", "origin", "title", "note"]),
    event:  new Set(["tags", "activePlaces", "origin", "era"]),
};

// Schema: 每个实体类的字段约束
const SCHEMAS = {
    figure: {
        // 必填
        name:     { type: "string",  required: true,  minLen: 1, maxLen: 40 },
        summary:  { type: "string",  required: true,  minLen: 1, maxLen: 200 },
        // 可选（字段在 CrowdViewBuilder / WorldContext 中实际读取）
        en:       { type: "string",  required: false, maxLen: 60 },
        birth:    { type: "number",  required: false, desc: "年份，负数=公元前" },
        death:    { type: "number",  required: false, desc: "年份，负数=公元前" },
        birthApprox: { type: "boolean", required: false, desc: "生年是否近似" },
        deathApprox: { type: "boolean", required: false, desc: "卒年是否近似" },
        careerStart: { type: "number",  required: false, desc: "起家年份" },
        careerApprox:{ type: "boolean", required: false, desc: "起家年份是否近似" },
        pinyin:   { type: "string",  required: false, desc: "拼音辅助标注" },
        region:   { type: "enum",    required: false, values: REGION_VALUES },
        dynasty:  { type: "enum",    required: false, values: DYNASTY_VALUES },
        parents:  { type: "array",   required: false, itemType: "string" },
        milestones: { type: "array", required: false, itemType: "string" },
        notes:    { type: "string",  required: false },
        source:   { type: "string",  required: false },
        _allowExtra: false,
    },

    event: {
        // 必填
        title:    { type: "string",  required: true,  minLen: 1, maxLen: 50 },
        year:     { type: "number",  required: true,  desc: "年份，负数=公元前" },
        // 可选
        key:      { type: "boolean", required: false, desc: "是否关键事件（视觉强调）" },
        axis:     { type: "boolean", required: false, desc: "是否时间轴轴事件（world/event 必填）" },
        dynasty:  { type: "enum",    required: false, values: DYNASTY_VALUES },
        category: { type: "enum",    required: false, values: EVENT_CATEGORIES },
        region:   { type: "enum",    required: false, values: REGION_VALUES },
        desc:     { type: "string",  required: false, maxLen: 200 },
        note:     { type: "string",  required: false, maxLen: 200 },
        figures:  { type: "array",   required: false, itemType: "string" },
        places:   { type: "array",   required: false, itemType: "string" },
        seq:      { type: "number",  required: false },
        _allowExtra: false,
    },

    dynasty: {
        name:     { type: "string",  required: true },
        start:    { type: "number",  required: true },
        end:      { type: "number",  required: true },
        order:    { type: "number",  required: true },
        type:     { type: "enum",    required: false, values: new Set(["dynasty", "transition"]) },
        parent:   { type: "string",  required: false },
        topics:   { type: "array",   required: false },
        rulers:   { type: "array",   required: false },
        _allowExtra: true, // dynasty 有复杂嵌套结构，暂不限制
    },

    view: {
        // view 结构因 type 而异，_validateViews 已覆盖 type 专属校验
        title:    { type: "string",  required: false },
        type:     { type: "string",  required: false },
        _allowExtra: true,
    },

    region: {
        name:     { type: "string",  required: true },
        bbox:     { type: "array",   required: true },
        _allowExtra: true,
    },

    place: {
        name:     { type: "string",  required: true },
        lon:      { type: "number",  required: true },
        lat:      { type: "number",  required: true },
        region:   { type: "string",  required: false },
        _allowExtra: true,
    },
};

// 目录 → schema 类型映射
const DIRS = [
    { dir: "china/figures",    type: "figure" },
    { dir: "china/events",     type: "event" },
    { dir: "china/dynasties",  type: "dynasty" },
    { dir: "china/views",      type: "view" },
    { dir: "china/regions",    type: "region" },
    { dir: "china/places",     type: "place" },
    { dir: "world/figures",    type: "figure" },
    { dir: "world/events",     type: "event" },
    { dir: "world/views",      type: "view" },
];

/* ===========================================================
 * 校验引擎
 * =========================================================== */

let errorCount = 0;
let warnCount = 0;
const autoFixes = [];

function report(file, field, level, msg) {
    const tag = level === "error" ? "❌" : "⚠️";
    if (level === "error") errorCount++; else warnCount++;
    console.log(`  ${tag}  ${file}${field ? "." + field : ""}: ${msg}`);
}

function typeCheck(value, expected) {
    switch (expected) {
        case "string": return typeof value === "string";
        case "number": return typeof value === "number" && Number.isFinite(value);
        case "boolean": return typeof value === "boolean";
        case "array": return Array.isArray(value);
        case "enum": return typeof value === "string";
        default: return true;
    }
}

function validateFile(filePath, type) {
    const schema = SCHEMAS[type];
    const rel = path.relative(DATA_DIR, filePath);
    let data;
    try {
        data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (e) {
        report(rel, null, "error", `JSON 解析失败: ${e.message}`);
        return null;
    }

    const fixes = {};
    let needsFix = false;

    // 1. 必填字段
    for (const [field, rule] of Object.entries(schema)) {
        if (field.startsWith("_")) continue;
        if (rule.required && (data[field] === undefined || data[field] === null)) {
            report(rel, field, "error", `必填字段缺失`);
        }
    }

    // 2. 类型 + 值校验
    for (const [field, value] of Object.entries(data)) {
        if (field === "id") continue; // id 由文件名注入，schema 不定义
        const rule = schema[field];
        if (!rule) continue; // 多余字段后面单独处理

        // deprecated 字段 → warn（数据仍合法，但建议迁移）
        if (rule.deprecated) {
            report(rel, field, "warn", `deprecated: ${rule.desc || "旧字段待清理"}`);
        }

        // 类型
        if (!typeCheck(value, rule.type)) {
            report(rel, field, "error", `类型应为 ${rule.type}，实际 ${Array.isArray(value) ? "array" : typeof value}`);
            continue;
        }

        // 字符串长度
        if (rule.type === "string") {
            if (rule.minLen !== undefined && value.length < rule.minLen) {
                report(rel, field, "error", `长度 < ${rule.minLen}`);
            }
            if (rule.maxLen !== undefined && value.length > rule.maxLen) {
                report(rel, field, "warn", `长度 ${value.length} > ${rule.maxLen}（建议截断）`);
            }
        }

        // 枚举值
        if (rule.type === "enum" && rule.values && !rule.values.has(value)) {
            report(rel, field, "error", `值 "${value}" 不在允许列表中: ${[...rule.values].join("/")}`);
        }

        // 数组项类型
        if (rule.type === "array" && rule.itemType) {
            for (let i = 0; i < value.length; i++) {
                if (!typeCheck(value[i], rule.itemType)) {
                    report(rel, `${field}[${i}]`, "error", `项类型应为 ${rule.itemType}`);
                }
            }
        }
    }

    // 3. 多余字段
    if (!schema._allowExtra) {
        const known = new Set([...Object.keys(schema), "id"]);
        const deprecatedSet = DEPRECATED_FIELDS[type] || new Set();
        for (const field of Object.keys(data)) {
            if (!known.has(field)) {
                // 自动修复候选：id 字段（应该删除，因为文件名就是 id）
                if (field === "id") {
                    fixes.id = undefined; // 标记删除
                    needsFix = true;
                    report(rel, field, "warn", `多余字段 "id"（文件名已提供，可自动删除）`);
                } else if (deprecatedSet.has(field)) {
                    // 已知旧字段，warn 提示清理
                    report(rel, field, "warn", `旧字段 "${field}" 待清理（非 schema 字段）`);
                } else {
                    report(rel, field, "warn", `未知字段 "${field}"（检查是否拼写错误）`);
                }
            }
        }
    }

    return { data, fixes, needsFix };
}

/* ===========================================================
 * 主流程
 * =========================================================== */

export function runSchemaValidation() {
    console.log("━━━ Schema 校验 ━━━\n");

    // 动态加载 dynasty 值（同时包含 slug=文件名 和 name=中文名）
    const dynastyFiles = fs.readdirSync(path.join(DATA_DIR, "china/dynasties"))
        .filter(f => f.endsWith(".json"));
    for (const f of dynastyFiles) {
        const slug = f.replace(/\.json$/, "");
        DYNASTY_VALUES.add(slug); // slug: qin, eastern-han
        const j = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "china/dynasties", f), "utf8"));
        if (j.name) DYNASTY_VALUES.add(j.name); // 中文名: 秦, 东汉
    }

    const allFiles = [];
    for (const { dir, type } of DIRS) {
        const abs = path.join(DATA_DIR, dir);
        if (!fs.existsSync(abs)) continue;
        for (const f of fs.readdirSync(abs).filter(f => f.endsWith(".json"))) {
            allFiles.push({ path: path.join(abs, f), type });
        }
    }

    console.log(`扫描 ${allFiles.length} 个 JSON 文件...\n`);

    for (const { path, type } of allFiles) {
        const result = validateFile(path, type);
        if (!result) continue;

        if (AUTO_FIX && result.needsFix) {
            const newData = { ...result.data };
            for (const [k, v] of Object.entries(result.fixes)) {
                if (v === undefined) delete newData[k];
                else newData[k] = v;
            }
            fs.writeFileSync(path, JSON.stringify(newData, null, 2) + "\n", "utf8");
            autoFixes.push(path);
        }
    }

    console.log(`\n━━━ 校验结果 ━━━`);
    console.log(`❌ Error: ${errorCount}`);
    console.log(`⚠️  Warn:  ${warnCount}`);
    if (AUTO_FIX && autoFixes.length) {
        console.log(`🔧 自动修复: ${autoFixes.length} 个文件`);
    }

    if (errorCount > 0) {
        console.log(`\n🔴 构建被中断：存在 ${errorCount} 个 schema 错误`);
        throw new Error(`[schema] 存在 ${errorCount} 个错误，构建中断`);
    }
    if (warnCount > 0) {
        console.log(`\n🟡 警告不中断构建，但建议清理`);
    } else {
        console.log(`\n🟢 全部通过`);
    }
}

// 直接执行时跑校验，import 时只导出函数（函数声明已带 export）
const isDirectRun = process.argv[1]?.includes("validate-schema");
if (isDirectRun) {
    runSchemaValidation();
}

/**
 * validators.js — 数据加载与契约校验
 *
 * readEntities：从目录读取 JSON → 加 id 字段 → 返回 { entities, sources }
 * ensureRef / ensureArray / ensureNumber：构建期断言，失败抛 Error 让 Eleventy 中断构建并指出文件名
 *
 * 所有函数保持原 world.js 的签名与行为，零改动。
 */
import fs from "node:fs";
import path from "node:path";

/**
 * 从 `${dataDir}/${dir}/` 读取全部 .json 文件，每个文件的 basename（去扩展名）作为 id。
 * @param {string} dir 子目录名，如 "figures"、"events"
 * @param {string} dataDir _data 目录的绝对路径
 * @returns {{ entities: Record<string, any>, sources: Record<string, string> }}
 */
export function readEntities(dir, dataDir) {
    const abs = path.join(dataDir, dir);
    const entities = {};
    const sources = {};
    if (!fs.existsSync(abs)) return { entities, sources };

    for (const file of fs.readdirSync(abs).sort()) {
        if (!file.endsWith(".json")) continue;
        const id = file.slice(0, -".json".length);
        const source = `${dir}/${file}`;
        let data;
        try {
            data = JSON.parse(fs.readFileSync(path.join(abs, file), "utf8"));
        } catch (error) {
            throw new Error(`[world] ${source} 不是合法 JSON：${error.message}`);
        }
        entities[id] = { ...data, id };
        sources[id] = source;
    }
    return { entities, sources };
}

/**
 * 断言 collection 中存在 id，不存在则抛带 kind/source/field 的错误。
 */
export function ensureRef(collection, kind, source, field, id) {
    if (!Object.prototype.hasOwnProperty.call(collection, id)) {
        throw new Error(`[world] ${source} 的 ${field} 引用了不存在的${kind}「${id}」`);
    }
}

/**
 * 断言 value 是数组；undefined 视为空数组返回。
 */
export function ensureArray(value, source, field) {
    if (value === undefined) return [];
    if (!Array.isArray(value)) {
        throw new Error(`[world] ${source} 的 ${field} 应为数组`);
    }
    return value;
}

/**
 * 断言 value 是有限数字。
 */
export function ensureNumber(value, source, field) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`[world] ${source} 的 ${field} 应为数字`);
    }
    return value;
}

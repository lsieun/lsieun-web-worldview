/**
 * compare.js — 中外对比页全局数据入口
 *
 * 职责：把中国与世界两套数据按时间轴合并，输出模板层可用的对比区块。
 *   1. 读 china/dynasties + world/eras → 按 start 排序，生成 section
 *   2. 每个 section 内，从 china/events 和 world/events 筛选落在 [start, end] 区间的事件
 *   3. 世界事件若没有 region 字段，默认为对应 era（如 renaissance → "italy"）
 *
 * 输出给模板：
 *   compare.sections[]   — { id, label, start, end, events: { china: [...], world: [...] } }
 *   compare.toc[]        — 左右导航共用，按 start 排序，标注来源（china/world）
 */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)));

function readDirEntities(subdir) {
    const abs = path.join(DATA_DIR, subdir);
    const entities = {};
    if (!fs.existsSync(abs)) return entities;
    for (const file of fs.readdirSync(abs).sort()) {
        if (!file.endsWith(".json")) continue;
        const id = file.slice(0, -5);
        try {
            entities[id] = { ...JSON.parse(fs.readFileSync(path.join(abs, file), "utf8")), id };
        } catch (e) {
            console.warn(`[compare] 跳过非法 JSON: ${subdir}/${file}`);
        }
    }
    return entities;
}

function cnYear(year) {
    if (year === undefined || year === null) return "";
    const n = Number(year);
    return n < 0 ? `前 ${Math.abs(n)}` : `${n}`;
}

export default function () {
    /* ---------- 读取 ---------- */
    const dynasties = readDirEntities("china/dynasties");
    const eras = readDirEntities("world/eras");
    const chinaEvents = readDirEntities("china/events");
    const worldEvents = readDirEntities("world/events");

    /* ---------- 导航条目：朝代 + 时期，按 start 排序 ---------- */
    const toc = [
        ...Object.values(dynasties).map((d) => ({
            id: `china-${d.id}`,
            kind: "china",
            label: d.name,
            start: d.start,
            end: d.end
        })),
        ...Object.values(eras).map((e) => ({
            id: `world-${e.id}`,
            kind: "world",
            label: e.name,
            start: e.start,
            end: e.end
        }))
    ].sort((a, b) => a.start - b.start);

    /* ---------- 对比区块：按中国朝代分段，每段对齐同期世界时期 ---------- */
    const sections = Object.values(dynasties)
        .sort((a, b) => a.order - b.order)
        .map((d) => {
            // 中国事件：落在 [start, end] 区间
            const cnEvents = Object.values(chinaEvents)
                .filter((ev) => ev.year >= d.start && ev.year <= d.end)
                .sort((a, b) => a.year - b.year)
                .map((ev) => ({
                    year: ev.year,
                    title: ev.title,
                    desc: ev.desc || ev.note || ""
                }));

            // 世界事件：落在同一个 [start, end] 区间
            const wlEvents = Object.values(worldEvents)
                .filter((ev) => ev.year >= d.start && ev.year <= d.end)
                .sort((a, b) => a.year - b.year)
                .map((ev) => ({
                    year: ev.year,
                    title: ev.title,
                    region: ev.region || ev.era || "",
                    desc: ev.desc || ev.note || ""
                }));

            return {
                id: `china-${d.id}`,
                label: d.name,
                start: d.start,
                end: d.end,
                startLabel: cnYear(d.start),
                endLabel: cnYear(d.end),
                summary: d.summary || "",
                worldLabel: (() => {
                    // 找重叠的世界时期
                    const overlaps = Object.values(eras)
                        .filter((e) => e.start <= d.end && e.end >= d.start)
                        .sort((a, b) => a.start - b.start);
                    return overlaps.map((e) => `${e.name}(${cnYear(e.start)}-${cnYear(e.end)})`).join(" / ");
                })(),
                events: { china: cnEvents, world: wlEvents }
            };
        });

    return { sections, toc };
}

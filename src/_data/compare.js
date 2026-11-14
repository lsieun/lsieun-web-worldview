/**
 * compare.js v2 — 中外对比页
 *
 * 核心改动：不分朝代段，一条连续时间轴，世纪刻度，事件按年份交错排列。
 *
 * 输出：
 *   compare.centuries[] — 世纪刻度（-2100, -2000, ..., 0, 100, ..., 2000, 2026）
 *   compare.rows[]      — 事件行：[{ year, china:[...], world:[...] }, ...]
 *   compare.toc         — 导航（左 TOC: 中国朝代 | 右 TOC: 世界时期）
 *   compare.minYear / maxYear — 范围
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
        } catch { /* skip */ }
    }
    return entities;
}

function cnYear(year) {
    if (year === undefined || year === null) return "";
    const n = Number(year);
    return n < 0 ? `前 ${Math.abs(n)}` : `${n}`;
}

/** 把年份转成"几个世纪"标签，如 -2100 → "前21世纪"，2000 → "21世纪" */
function centuryLabel(year) {
    const n = Number(year);
    if (n === 0) return "公元元年";
    const abs = Math.abs(n);
    const cen = Math.floor((abs - 1) / 100) + 1;
    return n < 0 ? `前${cen}世纪` : `${cen}世纪`;
}

export default function () {
    /* ---------- 1. 读取 ---------- */
    const dynasties = readDirEntities("china/dynasties");
    const eras = readDirEntities("world/eras");
    const chinaEvents = readDirEntities("china/events");
    const worldEvents = readDirEntities("world/events");

    /* ---------- 2. 合并所有事件 → 按年份分组 ---------- */
    // 每一个 year 对应一个行，里面有 china[] 和 world[]
    const yearMap = new Map();

    function addToYear(year, side, ev) {
        if (!yearMap.has(year)) yearMap.set(year, { year, china: [], world: [] });
        yearMap.get(year)[side].push(ev);
    }

    for (const ev of Object.values(chinaEvents)) {
        addToYear(ev.year, "china", {
            title: ev.title,
            desc: ev.desc || ev.note || ""
        });
    }

    for (const ev of Object.values(worldEvents)) {
        addToYear(ev.year, "world", {
            title: ev.title,
            region: ev.region || ev.era || "",
            desc: ev.desc || ev.note || ""
        });
    }

    // 排序后输出
    const rows = [...yearMap.values()]
        .sort((a, b) => a.year - b.year)
        .map((r) => ({
            year: r.year,
            yearLabel: cnYear(r.year),
            china: r.china,
            world: r.world,
            id: `yr-${r.year}`
        }));

    /* ---------- 3. 世纪刻度 ---------- */
    const allYears = rows.map((r) => r.year);
    let minYear = Math.min(...allYears, -2100);
    let maxYear = Math.max(...allYears, 2026);

    // 向下/向上对齐到整百年
    if (minYear % 100 !== 0) minYear = Math.floor(minYear / 100) * 100;
    if (maxYear % 100 !== 0) maxYear = Math.ceil(maxYear / 100) * 100;

    const centuries = [];
    for (let y = minYear; y <= maxYear; y += 100) {
        centuries.push({ year: y, label: centuryLabel(y) });
    }

    /* ---------- 4. 导航 TOC ---------- */
    // 左：中国朝代（去掉魏蜀吴三个子朝代，只保留三国父级）
    //     只保留有事件的朝代 → 锚点指向该朝代范围内最早事件的 year row
    const skipChina = new Set(["cao-wei", "shu-han", "eastern-wu", "xin"]); // 跳过子朝代 + 新朝并入两汉
    const chinaToc = Object.values(dynasties)
        .filter((d) => !skipChina.has(d.id))
        .map((d) => {
            // 找范围内最早的事件年份
            const firstEvtYear = rows.find((r) => r.year >= d.start && r.year <= d.end);
            return {
                id: `china-${d.id}`,
                kind: "china",
                label: d.name,
                start: d.start,
                end: d.end,
                anchor: firstEvtYear ? firstEvtYear.id : (d.start >= minYear ? `yr-${Math.max(d.start, minYear)}` : null)
            };
        })
        .filter((t) => t.anchor)
        .sort((a, b) => a.start - b.start);

    // 右：世界时期
    const worldToc = Object.values(eras)
        .map((e) => {
            const firstEvtYear = rows.find((r) => r.year >= e.start && r.year <= e.end);
            return {
                id: `world-${e.id}`,
                kind: "world",
                label: e.name,
                start: e.start,
                end: e.end,
                anchor: firstEvtYear ? firstEvtYear.id : (e.start >= minYear ? `yr-${Math.max(e.start, minYear)}` : null)
            };
        })
        .filter((t) => t.anchor)
        .sort((a, b) => a.start - b.start);

    /* ---------- 5. 交错 stream：世纪刻度 + 事件行 ---------- */
    // 把 centuries 和 rows 合并成一个 stream，按 year 排序
    // century 放在对应年份行的上方
    const stream = [];
    let ci = 0;
    for (const r of rows) {
        while (ci < centuries.length && centuries[ci].year <= r.year) {
            // 这个世纪刻度是否真的有事件落在它之后？避免尾部多余刻度
            if (centuries[ci].year <= maxYear) {
                stream.push({ kind: "century", year: centuries[ci].year, label: centuries[ci].label, id: `century-${centuries[ci].year}` });
            }
            ci++;
        }
        stream.push({ kind: "row", ...r });
    }

    // 尾部剩余世纪刻度
    while (ci < centuries.length) {
        stream.push({ kind: "century", year: centuries[ci].year, label: centuries[ci].label, id: `century-${centuries[ci].year}` });
        ci++;
    }

    return { stream, chinaToc, worldToc, minYear, maxYear };
}

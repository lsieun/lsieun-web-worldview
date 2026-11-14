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
            desc: ev.desc || ev.note || "",
            key: !!ev.key,
            seq: ev.seq
        });
    }

    for (const ev of Object.values(worldEvents)) {
        addToYear(ev.year, "world", {
            title: ev.title,
            region: ev.region || ev.era || "",
            desc: ev.desc || ev.note || "",
            key: !!ev.key,
            seq: ev.seq
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

    /* ---------- 3. 刻度：50 年一格 ---------- */
    const allYears = rows.map((r) => r.year);
    let minYear = Math.min(...allYears, -2100);
    let maxYear = Math.max(...allYears, 2026);

    // 向下/向上对齐到 50
    if (minYear % 10 !== 0) minYear = Math.floor(minYear / 10) * 10;
    if (maxYear % 10 !== 0) maxYear = Math.ceil(maxYear / 10) * 10;

    // tick：10 年一小格，整百年大字刻度
    const ticks = [];
    for (let y = minYear; y <= maxYear; y += 10) {
        ticks.push({
            year: y,
            label: cnYear(y),
            century: centuryLabel(y),
            major: (y % 100 === 0),   // 整百年 = 大刻度
            mid:   (y % 50 === 0 && y % 100 !== 0)  // 50年 = 中刻度
        });
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

    /* ---------- 5. 构建 stream：tick + 独立事件（只留 key:true 的重要事件） ---------- */
    const PX_PER_YEAR = 12.0;      // 1 年 = 12px，10年 = 120px，50年 = 600px
    const EVENT_HEIGHT = 18;       // 每个事件的视觉高度
    const EVENT_MIN_GAP = 3;       // 两个事件之间最小间距

    /* 同年份同 side 事件先合并成一条（用"；"连接） */
    const mergedByKey = new Map();  // "china:-206" → [{title:"鸿门宴；秦朝灭亡...", key:true}]

    for (const row of rows) {
        // 中国（同年份事件按 seq 排序，无 seq 排最后）
        const chinaKey = `china:${row.year}`;
        const chinaTitles = row.china.filter(ev => ev.key)
            .sort((a, b) => (a.seq ?? 999) - (b.seq ?? 999))
            .map(ev => ev.title);
        if (chinaTitles.length > 0) {
            mergedByKey.set(chinaKey, {
                kind: "event", side: "china",
                year: row.year, yearLabel: row.yearLabel,
                title: chinaTitles.join("；"),
                key: true
            });
        }
        // 世界（同样按 seq 排序）
        const worldKey = `world:${row.year}`;
        const worldItems = row.world.filter(ev => ev.key)
            .sort((a, b) => (a.seq ?? 999) - (b.seq ?? 999));
        const worldTitles = worldItems.map(ev => ev.title + (ev.region ? `(${ev.region})` : ""));
        if (worldTitles.length > 0) {
            mergedByKey.set(worldKey, {
                kind: "event", side: "world",
                year: row.year, yearLabel: row.yearLabel,
                title: worldTitles.join("；"),
                key: true
            });
        }
    }

    const allEvents = Array.from(mergedByKey.values())
        .sort((a, b) => a.year - b.year);
    console.log(`[compare] merged events: ${allEvents.length} (china: ${allEvents.filter(e=>e.side==='china').length}, world: ${allEvents.filter(e=>e.side==='world').length})`);

    // tick 保持精确年份 top（不受堆叠影响）
    const stream = [];
    let ti = 0;
    for (const ev of allEvents) {
        while (ti < ticks.length && ticks[ti].year <= ev.year) {
            stream.push({ kind: "tick", year: ticks[ti].year, label: ticks[ti].label, century: ticks[ti].century, major: ticks[ti].major, mid: ticks[ti].mid, id: `tick-${ticks[ti].year}` });
            ti++;
        }
        stream.push(ev);
    }
    while (ti < ticks.length) {
        stream.push({ kind: "tick", year: ticks[ti].year, label: ticks[ti].label, century: ticks[ti].century, id: `tick-${ticks[ti].year}` });
        ti++;
    }

    // tick: 精确 top
    // event: idealTop = 年份位置，displayTop 做堆叠调整
    for (const item of stream) {
        item.idealTop = Math.round((item.year - minYear) * PX_PER_YEAR);
    }

    // 堆叠调整：只和 idealTop 邻近的事件比较
    // 避免公元前大量事件的堆叠影响公元后的事件
    // 策略：维护两个 side 的 bottom 列表，新事件只和 idealTop < 自己的最近事件比较
    const chinaStack = [];  // [{idealTop, bottom}]
    const worldStack = [];

    for (const item of stream) {
        if (item.kind === "tick") {
            item.displayTop = item.idealTop;
            continue;
        }
        // event: 找同 side 中 idealTop < 自己的最后一个
        const stack = item.side === "china" ? chinaStack : worldStack;
        // 移除所有 idealTop >= 当前事件的（它们在后面处理）
        while (stack.length > 0 && stack[stack.length-1].idealTop >= item.idealTop) {
            stack.pop();
        }
        const prevBottom = stack.length > 0 ? stack[stack.length-1].bottom : -Infinity;
        item.displayTop = Math.max(item.idealTop, prevBottom + EVENT_MIN_GAP);
        stack.push({ idealTop: item.idealTop, bottom: item.displayTop + EVENT_HEIGHT });
    }

    // 总高
    const maxEventBottom = allEvents.reduce((m, ev) => Math.max(m, ev.displayTop + EVENT_HEIGHT), 0);
    const maxTickTop = Math.round((maxYear - minYear) * PX_PER_YEAR);
    const totalHeight = Math.max(maxEventBottom, maxTickTop) + 200;

    return { stream, chinaToc, worldToc, minYear, maxYear, pxPerYear: PX_PER_YEAR, totalHeight, eventHeight: EVENT_HEIGHT };
}

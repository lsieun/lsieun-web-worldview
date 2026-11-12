/**
 * world.js — 实体库拼装器
 *
 * 把 figures / events / places / regions / views 五个目录下的独立 JSON
 * 校验引用并拼装为页面可直接使用的数据：
 *   world.timelines[viewId] → 与旧 timeline 契约一致，供 person-timeline-page.html 复用
 *   world.figures / places / regions / views → 原始实体（含反向索引），供单人页、地图页复用
 *
 * 任何悬空引用都会让构建失败，并指出文件名与字段。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DATA_DIR = path.dirname(fileURLToPath(import.meta.url));

function readEntities(dir) {
    const abs = path.join(DATA_DIR, dir);
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

function ensureRef(collection, kind, source, field, id) {
    if (!Object.prototype.hasOwnProperty.call(collection, id)) {
        throw new Error(`[world] ${source} 的 ${field} 引用了不存在的${kind}「${id}」`);
    }
}

function ensureArray(value, source, field) {
    if (value === undefined) return [];
    if (!Array.isArray(value)) {
        throw new Error(`[world] ${source} 的 ${field} 应为数组`);
    }
    return value;
}

function ensureNumber(value, source, field) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`[world] ${source} 的 ${field} 应为数字`);
    }
    return value;
}

function formatYear(year) {
    return year < 0 ? `前 ${Math.abs(year)}` : String(year);
}

function elapsedYears(start, end) {
    // 公元前与公元之间没有公元 0 年。
    return end - start - (start < 0 && end > 0 ? 1 : 0);
}

function buildReignView(view, dynasties, figures, events, dynastySources, figureSources) {
    const dynasty = dynasties[view.dynasty];
    const source = dynastySources[dynasty.id];
    const treeIds = new Set(ensureArray(view.figures, `views/${view.id}.json`, "figures"));

    const regencies = ensureArray(dynasty.regencies, source, "regencies").map((regency) => {
        ensureRef(figures, "人物", source, "regencies", regency.figure);
        const start = ensureNumber(regency.start, source, "regencies.start");
        const end = ensureNumber(regency.end, source, "regencies.end");
        if (start > end) throw new Error(`[world] ${source} 的摄政年段起止倒置`);
        return {
            id: regency.figure,
            name: figures[regency.figure].name,
            label: regency.label || "辅政",
            note: regency.note || "",
            start,
            end,
            startLabel: formatYear(start),
            endLabel: formatYear(end)
        };
    });

    const orders = new Set();
    const rulerIds = new Set();
    const eventIds = new Set();
    let formalCount = 0;
    let eventCount = 0;
    const rulers = ensureArray(dynasty.rulers, source, "rulers").map((ruler) => {
        ensureRef(figures, "人物", source, "rulers", ruler.figure);
        if (rulerIds.has(ruler.figure)) {
            throw new Error(`[world] ${source} 的 rulers 中「${ruler.figure}」重复，多段在位请写入 terms`);
        }
        rulerIds.add(ruler.figure);

        const status = ruler.status || "formal";
        if (!["formal", "interim"].includes(status)) {
            throw new Error(`[world] ${source} 的 ${ruler.figure} 使用了未知 status「${status}」`);
        }
        if (status === "formal") {
            if (!Number.isInteger(ruler.order) || ruler.order < 1) {
                throw new Error(`[world] ${source} 的 ${ruler.figure} 缺少有效帝序`);
            }
            if (orders.has(ruler.order)) throw new Error(`[world] ${source} 的帝序 ${ruler.order} 重复`);
            orders.add(ruler.order);
            formalCount += 1;
        } else if (ruler.order !== undefined) {
            throw new Error(`[world] ${source} 的过渡人物 ${ruler.figure} 不应设置帝序`);
        }

        const terms = ensureArray(ruler.terms, source, `rulers.${ruler.figure}.terms`).map((term) => {
            const start = ensureNumber(term.start, source, `rulers.${ruler.figure}.terms.start`);
            const end = ensureNumber(term.end, source, `rulers.${ruler.figure}.terms.end`);
            if (start > end) throw new Error(`[world] ${source} 的 ${ruler.figure} 在位年段起止倒置`);
            const years = elapsedYears(start, end);
            const termEvents = ensureArray(term.events, source, `rulers.${ruler.figure}.terms.events`).map((eventId) => {
                ensureRef(events, "事件", source, `rulers.${ruler.figure}.terms.events`, eventId);
                if (eventIds.has(eventId)) {
                    throw new Error(`[world] ${source} 的事件「${eventId}」被重复分配到多个在位区块`);
                }
                eventIds.add(eventId);
                const event = events[eventId];
                if (event.year < start || event.year > end) {
                    throw new Error(`[world] ${source} 的事件「${eventId}」不在 ${ruler.figure} 的在位年段内`);
                }
                eventCount += 1;
                return {
                    id: event.id,
                    year: event.year,
                    yearLabel: formatYear(event.year),
                    era: event.era || "",
                    title: event.title,
                    desc: event.desc || ""
                };
            }).sort((a, b) => a.year - b.year);
            const overlappingRegencies = regencies.filter((regency) => regency.start <= end && regency.end >= start);
            return {
                start,
                end,
                startLabel: formatYear(start),
                endLabel: formatYear(end),
                durationLabel: term.durationLabel || (years === 0 ? "不足一年" : `约 ${years} 年`),
                events: termEvents,
                regencies: overlappingRegencies
            };
        });
        if (!terms.length) throw new Error(`[world] ${source} 的 ${ruler.figure} 至少需要一段 terms`);

        const figure = figures[ruler.figure];
        return {
            id: figure.id,
            name: figure.name,
            summary: figure.summary || "",
            title: ruler.title || figure.name,
            status,
            order: ruler.order,
            note: ruler.note || "",
            terms,
            treeIncluded: treeIds.has(figure.id)
        };
    }).sort((a, b) => a.terms[0].start - b.terms[0].start || (a.order ?? 999) - (b.order ?? 999));

    const rulerById = new Map(rulers.map((ruler) => [ruler.id, ruler]));
    const nodes = new Map();
    for (const id of treeIds) {
        ensureRef(figures, "人物", `views/${view.id}.json`, "figures", id);
        const figure = figures[id];
        const parents = ensureArray(figure.parents, figureSources[id], "parents").filter((parentId) => treeIds.has(parentId));
        if (parents.length > 1) {
            throw new Error(`[world] views/${view.id}.json 的世系节点「${id}」目前只支持一个树内父节点`);
        }
        const ruler = rulerById.get(id);
        nodes.set(id, {
            id,
            name: figure.name,
            summary: figure.summary || "",
            parents,
            children: [],
            hasRuler: Boolean(ruler),
            order: ruler?.order,
            title: ruler?.title || figure.name,
            status: ruler?.status || "kin",
            note: ruler?.note || "",
            reignLabel: ruler ? ruler.terms.map((term) => `${term.startLabel} — ${term.endLabel}`).join("、") : "未即位 · 世系连接"
        });
    }

    const generations = new Map();
    function generationOf(id, trail = new Set()) {
        if (generations.has(id)) return generations.get(id);
        if (trail.has(id)) throw new Error(`[world] views/${view.id}.json 的世系关系存在环，涉及「${id}」`);
        const node = nodes.get(id);
        const parentId = node.parents[0];
        if (!parentId) {
            generations.set(id, 0);
            return 0;
        }
        trail.add(id);
        const generation = generationOf(parentId, trail) + 1;
        trail.delete(id);
        generations.set(id, generation);
        return generation;
    }

    const treeRoots = [];
    for (const node of nodes.values()) {
        node.generation = generationOf(node.id);
        const parentId = node.parents[0];
        if (parentId) nodes.get(parentId).children.push(node);
        else treeRoots.push(node);
    }
    const compareNodes = (a, b) => (a.order ?? 999) - (b.order ?? 999) || a.name.localeCompare(b.name, "zh-Hans-CN");
    function sortTree(node) {
        node.children.sort(compareNodes);
        node.children.forEach(sortTree);
    }
    treeRoots.sort(compareNodes);
    treeRoots.forEach(sortTree);

    return {
        id: view.id,
        title: view.title,
        href: view.href,
        meta: { watermark: "史", ...view.meta },
        dynasty: { id: dynasty.id, name: dynasty.name, start: dynasty.start, end: dynasty.end },
        formalCount,
        eventCount,
        rulers,
        regencies,
        treeRoots,
        treeCount: nodes.size
    };
}

/* ---------- 帝系与群臣：按生卒重叠打包的泳道 ---------- */
const CROWD = {
    ppy: 3.6,          // 纵向像素 / 年
    top: 56,           // 绘图区顶部留白
    axisX: 70,         // 年份标签右对齐基线
    axisLine: 82,      // 年份轴脊线
    bandX: 92,         // 帝系条左缘
    bandW: 60,         // 帝系条宽度
    laneX0: 172,       // 第一条泳道左缘
    lanePitch: 24,     // 泳道间距
    barWidth: 4,       // 生命线宽度
    bottomPad: 28,
    minRulerHeight: 3, // 极短在位的最小可见高度
    labelMinHeight: 14, // 低于此高度不写单字
    labelGap: 60       // 时间标签达成 60px 间距才出现
};

function chooseTickInterval(ppy) {
    for (const value of [10, 20, 25, 50, 100]) {
        if (value * ppy >= CROWD.labelGap) return value;
    }
    return 100;
}

function round1(value) {
    return Math.round(value * 10) / 10;
}

function shortTitle(title) {
    return String(title || "").replace(/^西汉/, "").replace(/^汉/, "").slice(0, 1);
}

function yearLabel(year, approx) {
    return (approx ? "约" : "") + formatYear(year);
}

function ageLabel(year, birth) {
    return `${year - birth} 岁`;
}

function buildCrowdView(view, dynasties, figures, figureSources, events, eventSources, dynastySources) {
    const viewSource = `views/${view.id}.json`;
    const dynasty = dynasties[view.dynasty];
    if (!dynasty) throw new Error(`[world] ${viewSource} 缺少有效 dynasty`);
    const dynastySource = dynastySources[dynasty.id];

    const groups = ensureArray(view.groups, viewSource, "groups").map((group) => {
        if (!group.id || !group.name) throw new Error(`[world] ${viewSource} 的 groups 每项都需要 id 与 name`);
        return {
            id: group.id,
            name: group.name,
            desc: group.desc || "",
            people: [],
            laneStart: 0,
            laneCount: 0,
            x: 0,
            width: 0
        };
    });
    const groupById = new Map(groups.map((group) => [group.id, group]));
    if (groupById.size !== groups.length) throw new Error(`[world] ${viewSource} 的 groups 存在重复 id`);

    const range = view.range || { start: dynasty.start, end: dynasty.end };
    const start = ensureNumber(range.start, viewSource, "range.start");
    const end = ensureNumber(range.end, viewSource, "range.end");
    if (start > end) throw new Error(`[world] ${viewSource} 的 range 起止倒置`);

    const seen = new Set();
    const people = ensureArray(view.cast, viewSource, "cast").map((item) => {
        ensureRef(figures, "人物", viewSource, "cast", item.figure);
        const figure = figures[item.figure];
        if (seen.has(figure.id)) throw new Error(`[world] ${viewSource} 的 cast 中「${figure.id}」重复`);
        seen.add(figure.id);
        ensureNumber(figure.birth, figureSources[figure.id], "birth");
        ensureNumber(figure.death, figureSources[figure.id], "death");
        const group = groupById.get(item.group);
        if (!group) throw new Error(`[world] ${viewSource} 的 cast 中「${figure.id}」归属了不存在的分组「${item.group}」`);
        if (figure.birth < start || figure.death > end) {
            throw new Error(`[world] ${viewSource} 的「${figure.id}」生卒超出视图时间范围`);
        }
        const careerStart = figure.careerStart === undefined || figure.careerStart === null
            ? null
            : ensureNumber(figure.careerStart, figureSources[figure.id], "careerStart");
        if (careerStart !== null && (careerStart < figure.birth || careerStart > figure.death)) {
            throw new Error(`[world] ${viewSource} 的「${figure.id}」起家年份不在生卒区间内`);
        }
        return {
            id: figure.id,
            name: figure.name,
            summary: figure.summary || "",
            birth: figure.birth,
            death: figure.death,
            birthLabel: yearLabel(figure.birth, figure.birthApprox),
            deathLabel: yearLabel(figure.death, figure.deathApprox),
            careerStart,
            careerApprox: Boolean(figure.careerApprox),
            careerLabel: careerStart === null
                ? "起家年份无载"
                : `起家 ${yearLabel(careerStart, figure.careerApprox)}`,
            role: item.role || "",
            group: group.id,
            groupName: group.name,
            lane: 0,
            x: 0,
            y: 0,
            h: 0,
            preH: 0,
            postY: 0,
            postH: 0,
            careerY: null,
            events: []
        };
    });
    if (!people.length) throw new Error(`[world] ${viewSource} 的 cast 为空`);

    // 事件：只收本视图显式点名的事件，逐年挂到对应人物身上
    const personById = new Map(people.map((person) => [person.id, person]));
    const usedEvents = new Set();
    for (const eventId of ensureArray(view.events, viewSource, "events")) {
        ensureRef(events, "事件", viewSource, "events", eventId);
        if (usedEvents.has(eventId)) throw new Error(`[world] ${viewSource} 的事件「${eventId}」重复`);
        usedEvents.add(eventId);
        const event = events[eventId];
        const eventSource = eventSources[eventId];
        const year = ensureNumber(event.year, eventSource, "year");
        if (year < start || year > end) {
            throw new Error(`[world] ${eventSource} 的年份不在视图时间范围内`);
        }
        const matched = ensureArray(event.figures, eventSource, "figures")
            .filter((figureId) => personById.has(figureId));
        if (!matched.length) throw new Error(`[world] ${eventSource} 未关联本视图中的任何人物`);
        for (const personId of matched) {
            const person = personById.get(personId);
            if (year < person.birth || year > person.death) {
                throw new Error(`[world] ${eventSource} 的年份不在「${personId}」生卒区间内`);
            }
            person.events.push({
                id: event.id,
                year,
                yearLabel: formatYear(year),
                age: year - person.birth,
                ageLabel: ageLabel(year, person.birth),
                title: event.title,
                desc: event.desc || ""
            });
        }
    }
    people.forEach((person) => person.events.sort((a, b) => a.year - b.year));

    // 泳道打包：组内按生年排序，逐个放入第一条「上一位已去世」的泳道
    let nextLane = 0;
    for (const group of groups) {
        group.people = people
            .filter((person) => person.group === group.id)
            .sort((a, b) => a.birth - b.birth || a.death - b.death);
        const laneEnds = [];
        for (const person of group.people) {
            let lane = laneEnds.findIndex((lastDeath) => lastDeath < person.birth);
            if (lane === -1) {
                laneEnds.push(person.death);
                lane = laneEnds.length - 1;
            } else {
                laneEnds[lane] = person.death;
            }
            person.lane = nextLane + lane;
        }
        group.laneStart = nextLane;
        group.laneCount = laneEnds.length;
        nextLane += laneEnds.length + 1; // 组间留一道空隙
    }
    const totalLanes = Math.max(...people.map((person) => person.lane)) + 1;

    const yOf = (year) => round1(CROWD.top + (year - start) * CROWD.ppy);
    for (const person of people) {
        person.y = yOf(person.birth);
        person.h = round1((person.death - person.birth) * CROWD.ppy);
        person.x = round1(CROWD.laneX0 + person.lane * CROWD.lanePitch + (CROWD.lanePitch - CROWD.barWidth) / 2);
        // 仕宦线：起家前用细淡线，起家后为实线
        if (person.careerStart === null) {
            person.careerY = null;
            person.preH = person.h;
            person.postY = person.y;
            person.postH = person.h;
        } else {
            person.careerY = yOf(person.careerStart);
            person.preH = round1(person.careerY - person.y);
            person.postY = person.careerY;
            person.postH = round1(person.h - person.preH);
        }
    }

    const rightEdge = CROWD.laneX0 + totalLanes * CROWD.lanePitch;
    for (const person of people) {
        person.events.forEach((event) => {
            event.y = yOf(event.year);
            const toLeft = person.x + 96 > rightEdge;
            event.labelAnchor = toLeft ? "end" : "start";
            event.labelX = round1(person.x + (toLeft ? -8 : CROWD.barWidth + 8));
        });
    }
    for (const group of groups) {
        group.x = CROWD.laneX0 + group.laneStart * CROWD.lanePitch;
        group.width = group.laneCount * CROWD.lanePitch;
    }

    // 帝王年段（一个 ruler 可有多段 terms）
    const rulers = [];
    for (const ruler of ensureArray(dynasty.rulers, dynastySource, "rulers")) {
        const rulerSource = `${dynastySource} rulers.${ruler.figure}`;
        const figure = figures[ruler.figure];
        for (const term of ensureArray(ruler.terms, rulerSource, "terms")) {
            const termStart = Math.max(ensureNumber(term.start, rulerSource, "terms.start"), start);
            const termEnd = Math.min(ensureNumber(term.end, rulerSource, "terms.end"), end);
            if (termEnd < termStart) continue;
            const height = Math.max(round1((termEnd - termStart) * CROWD.ppy), CROWD.minRulerHeight);
            const years = elapsedYears(termStart, termEnd);
            rulers.push({
                id: `${ruler.figure}-${term.start}`,
                figure: ruler.figure,
                name: figure.name,
                title: ruler.title || figure.name,
                short: shortTitle(ruler.title || figure.name),
                status: ruler.status || "formal",
                order: ruler.order,
                start: termStart,
                end: termEnd,
                y: yOf(termStart),
                h: height,
                isTiny: height < CROWD.labelMinHeight,
                showLabel: height >= CROWD.labelMinHeight,
                lifeLabel: termEnd === termStart
                    ? formatYear(termStart)
                    : `${formatYear(termStart)} — ${formatYear(termEnd)}`,
                reignLabel: `在位 ${term.durationLabel || (years === 0 ? "不足一年" : `${years} 年`)}`,
                alive: people
                    .filter((person) => person.death >= termStart && person.birth <= termEnd)
                    .map((person) => person.name)
            });
        }
    }
    // 极短在位的细标最后绘制，避免被相邻年段覆盖
    rulers.sort((a, b) => Number(a.isTiny) - Number(b.isTiny) || a.start - b.start);

    const tickInterval = chooseTickInterval(CROWD.ppy);
    const minorInterval = tickInterval === 10 ? 5 : 10;
    const ticks = [];
    for (let year = Math.ceil(start / minorInterval) * minorInterval; year <= end; year += minorInterval) {
        const major = year % tickInterval === 0;
        ticks.push({
            year,
            major,
            label: major ? (year === 0 ? "公元" : formatYear(year)) : "",
            y: yOf(year)
        });
    }

    const plotWidth = CROWD.laneX0 + totalLanes * CROWD.lanePitch + 20;
    const plotHeight = CROWD.top + (end - start) * CROWD.ppy + CROWD.bottomPad;

    return {
        id: view.id,
        title: view.title || "帝系与群臣",
        href: view.href,
        meta: { watermark: "汉", ...view.meta },
        dynasty: { id: dynasty.id, name: dynasty.name, start: dynasty.start, end: dynasty.end },
        range: { start, end },
        groups,
        people,
        rulers,
        ticks,
        totalLanes,
        plot: {
            width: Math.round(plotWidth),
            height: Math.round(plotHeight),
            ppy: CROWD.ppy,
            top: CROWD.top,
            bottom: CROWD.bottomPad,
            axisX: CROWD.axisX,
            axisLine: CROWD.axisLine,
            bandX: CROWD.bandX,
            bandW: CROWD.bandW,
            laneX0: CROWD.laneX0,
            lanePitch: CROWD.lanePitch,
            barWidth: CROWD.barWidth,
            laneCenter: Math.round(CROWD.laneX0 + (totalLanes * CROWD.lanePitch) / 2),
            endY: yOf(end)
        }
    };
}

export default function () {
    const { entities: regions, sources: regionSources } = readEntities("regions");
    const { entities: places, sources: placeSources } = readEntities("places");
    const { entities: figures, sources: figureSources } = readEntities("figures");
    const { entities: events, sources: eventSources } = readEntities("events");
    const { entities: views } = readEntities("views");
    const { entities: dynasties, sources: dynastySources } = readEntities("dynasties");

    // ---------- 朝代 ----------
    for (const dynasty of Object.values(dynasties)) {
        const source = dynastySources[dynasty.id];
        if (!dynasty.name) throw new Error(`[world] ${source} 缺少 name`);
        const start = ensureNumber(dynasty.start, source, "start");
        const end = ensureNumber(dynasty.end, source, "end");
        ensureNumber(dynasty.order, source, "order");
        if (start > end) throw new Error(`[world] ${source} 的 start 晚于 end`);
        for (const topic of ensureArray(dynasty.topics, source, "topics")) {
            if (!topic.title || !topic.href) {
                throw new Error(`[world] ${source} 的 topics 每项都需要 title 与 href`);
            }
        }
    }

    // ---------- 区域 ----------
    for (const region of Object.values(regions)) {
        const source = regionSources[region.id];
        const bbox = ensureArray(region.bbox, source, "bbox");
        if (bbox.length !== 4 || bbox.some((n) => typeof n !== "number")) {
            throw new Error(`[world] ${source} 的 bbox 应为 [west, south, east, north] 四个数字`);
        }
        if (!region.name) throw new Error(`[world] ${source} 缺少 name`);
    }

    // ---------- 地点 ----------
    for (const place of Object.values(places)) {
        const source = placeSources[place.id];
        if (!place.name) throw new Error(`[world] ${source} 缺少 name`);
        ensureNumber(place.lon, source, "lon");
        ensureNumber(place.lat, source, "lat");
        ensureRef(regions, "区域", source, "region", place.region);
    }

    // ---------- 人物 ----------
    for (const figure of Object.values(figures)) {
        const source = figureSources[figure.id];
        if (!figure.name) throw new Error(`[world] ${source} 缺少 name`);
        if (figure.birth !== undefined) ensureNumber(figure.birth, source, "birth");
        if (figure.death !== undefined) ensureNumber(figure.death, source, "death");
        if (figure.birth !== undefined && figure.death !== undefined && figure.birth > figure.death) {
            throw new Error(`[world] ${source} 的 birth 晚于 death`);
        }
        for (const parentId of ensureArray(figure.parents, source, "parents")) {
            ensureRef(figures, "人物", source, "parents", parentId);
            if (parentId === figure.id) throw new Error(`[world] ${source} 的 parents 不能引用自身`);
        }
        if (figure.origin) ensureRef(places, "地点", source, "origin", figure.origin);
        for (const placeId of ensureArray(figure.activePlaces, source, "activePlaces")) {
            ensureRef(places, "地点", source, "activePlaces", placeId);
        }
        for (const eventId of ensureArray(figure.milestones, source, "milestones")) {
            ensureRef(events, "事件", source, "milestones", eventId);
        }
    }

    // ---------- 事件 ----------
    for (const event of Object.values(events)) {
        const source = eventSources[event.id];
        ensureNumber(event.year, source, "year");
        if (!event.title) throw new Error(`[world] ${source} 缺少 title`);
        for (const figureId of ensureArray(event.figures, source, "figures")) {
            ensureRef(figures, "人物", source, "figures", figureId);
        }
        for (const placeId of ensureArray(event.places, source, "places")) {
            ensureRef(places, "地点", source, "places", placeId);
        }
    }

    // ---------- 视图 ----------
    for (const view of Object.values(views)) {
        const source = `views/${view.id}.json`;
        if (view.dynasty) ensureRef(dynasties, "朝代", source, "dynasty", view.dynasty);
        if (view.type === "reign-crowd") {
            if (!view.dynasty) throw new Error(`[world] ${source} 缺少 dynasty`);
            for (const group of ensureArray(view.groups, source, "groups")) {
                if (!group.id || !group.name) throw new Error(`[world] ${source} 的 groups 每项都需要 id 与 name`);
            }
            for (const item of ensureArray(view.cast, source, "cast")) {
                ensureRef(figures, "人物", source, "cast", item.figure);
                ensureNumber(figures[item.figure].birth, figureSources[item.figure], "birth");
                ensureNumber(figures[item.figure].death, figureSources[item.figure], "death");
            }
            for (const eventId of ensureArray(view.events, source, "events")) {
                ensureRef(events, "事件", source, "events", eventId);
            }
            continue;
        }
        if (view.type === "dynasty-reigns") {
            for (const figureId of ensureArray(view.figures, source, "figures")) {
                ensureRef(figures, "人物", source, "figures", figureId);
            }
            continue;
        }
        const groupIds = new Set();
        for (const group of ensureArray(view.groups, source, "groups")) {
            if (!group.id || !group.name) throw new Error(`[world] ${source} 的 groups 每项都需要 id 与 name`);
            if (groupIds.has(group.id)) throw new Error(`[world] ${source} 的 groups 中「${group.id}」重复`);
            groupIds.add(group.id);
        }
        const castIds = new Set();
        for (const item of ensureArray(view.cast, source, "cast")) {
            ensureRef(figures, "人物", source, "cast", item.figure);
            ensureNumber(figures[item.figure].birth, figureSources[item.figure], "birth");
            ensureNumber(figures[item.figure].death, figureSources[item.figure], "death");
            if (!groupIds.has(item.group)) {
                throw new Error(`[world] ${source} 的 cast 中「${item.figure}」归属了不存在的分组「${item.group}」`);
            }
            castIds.add(item.figure);
        }
        for (const eventId of ensureArray(view.events, source, "events")) {
            ensureRef(events, "事件", source, "events", eventId);
        }
        for (const eventId of ensureArray(view.personalEvents, source, "personalEvents")) {
            ensureRef(events, "事件", source, "personalEvents", eventId);
        }
        for (const figureId of ensureArray(view.defaults, source, "defaults")) {
            if (!castIds.has(figureId)) {
                throw new Error(`[world] ${source} 的 defaults 中「${figureId}」不在 cast 里`);
            }
        }
    }

    // ---------- 反向索引 ----------
    for (const figure of Object.values(figures)) {
        const related = Object.values(events)
            .filter((event) => ensureArray(event.figures, "", "figures").includes(figure.id))
            .sort((a, b) => a.year - b.year);
        figure.events = related.map((event) => event.id);
        figure.milestones = ensureArray(figure.milestones, "", "milestones").map((eventId) => ({
            id: eventId,
            year: events[eventId].year,
            title: events[eventId].title
        }));
    }

    for (const place of Object.values(places)) {
        const related = Object.values(events)
            .filter((event) => ensureArray(event.places, "", "places").includes(place.id))
            .sort((a, b) => a.year - b.year);
        place.events = related.map((event) => event.id);
        place.figures = [...new Set(related.flatMap((event) => ensureArray(event.figures, "", "figures")))];
    }

    // ---------- 朝代与专题索引 ----------
    const dynastyList = Object.values(dynasties)
        .map((dynasty) => ({ ...dynasty, topics: [...ensureArray(dynasty.topics, "", "topics")] }))
        .sort((a, b) => a.order - b.order);

    for (const view of Object.values(views)) {
        if (!view.dynasty) continue;
        const dynasty = dynastyList.find((item) => item.id === view.dynasty);
        dynasty.topics.push({
            title: view.title || view.meta?.title || view.id,
            href: view.href || `/figures/${view.id}.html`,
            meta: view.topicMeta || (view.type === "dynasty-reigns" ? "帝王世系" : "人物年龄"),
            summary: view.summary || view.meta?.subtitle || ""
        });
    }

    const topicCount = dynastyList.reduce((total, dynasty) => total + dynasty.topics.length, 0);

    // ---------- 视图拼装 ----------
    const timelines = {};
    const reignViews = {};
    const crowdViews = {};
    for (const view of Object.values(views)) {
        if (view.type === "reign-crowd") {
            crowdViews[view.id] = buildCrowdView(view, dynasties, figures, figureSources, events, eventSources, dynastySources);
            continue;
        }
        if (view.type === "dynasty-reigns") {
            reignViews[view.id] = buildReignView(view, dynasties, figures, events, dynastySources, figureSources);
            continue;
        }
        const cast = ensureArray(view.cast, "", "cast");
        const castIds = new Set(cast.map((item) => item.figure));

        const people = cast
            .map((item) => {
                const figure = figures[item.figure];
                return {
                    id: figure.id,
                    name: figure.name,
                    birth: figure.birth,
                    death: figure.death,
                    birthLabel: formatYear(figure.birth),
                    deathLabel: formatYear(figure.death),
                    group: item.group,
                    role: item.role || ""
                };
            })
            .sort((a, b) => a.birth - b.birth);

        const axisEvents = ensureArray(view.events, "", "events")
            .map((eventId) => events[eventId])
            .sort((a, b) => a.year - b.year)
            .map((event) => ({
                year: event.year,
                title: event.title,
                desc: event.desc || "",
                axis: Boolean(event.axis),
                key: Boolean(event.key),
                era: event.era,
                focus: ensureArray(event.figures, "", "figures").filter((figureId) => castIds.has(figureId))
            }));

        const personalEvents = ensureArray(view.personalEvents, "", "personalEvents")
            .flatMap((eventId) => {
                const event = events[eventId];
                return ensureArray(event.figures, "", "figures")
                    .filter((figureId) => castIds.has(figureId))
                    .map((figureId) => ({
                        year: event.year,
                        person: figureId,
                        title: event.title,
                        desc: event.desc || ""
                    }));
            })
            .sort((a, b) => a.year - b.year);

        const range = view.range || {};
        const start = range.start ?? Math.min(...people.map((p) => p.birth));
        const end = range.end ?? Math.max(...people.map((p) => p.death));

        timelines[view.id] = {
            start,
            end,
            meta: { key: view.id, watermark: "史", title: view.title, ...view.meta },
            groups: ensureArray(view.groups, "", "groups"),
            people,
            events: axisEvents,
            personalEvents,
            defaultPeople: ensureArray(view.defaults, "", "defaults").filter((id) => castIds.has(id))
        };
    }

    return { figures, places, regions, views, dynasties: dynastyList, topicCount, timelines, reignViews, crowdViews };
}

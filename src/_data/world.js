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
        const birth = ensureNumber(figure.birth, source, "birth");
        const death = ensureNumber(figure.death, source, "death");
        if (birth > death) {
            throw new Error(`[world] ${source} 的 birth 晚于 death`);
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
        const groupIds = new Set();
        for (const group of ensureArray(view.groups, source, "groups")) {
            if (!group.id || !group.name) throw new Error(`[world] ${source} 的 groups 每项都需要 id 与 name`);
            if (groupIds.has(group.id)) throw new Error(`[world] ${source} 的 groups 中「${group.id}」重复`);
            groupIds.add(group.id);
        }
        const castIds = new Set();
        for (const item of ensureArray(view.cast, source, "cast")) {
            ensureRef(figures, "人物", source, "cast", item.figure);
            if (!groupIds.has(item.group)) {
                throw new Error(`[world] ${source} 的 cast 中「${item.figure}」归属了不存在的分组「${item.group}」`);
            }
            castIds.add(item.figure);
        }
        if (view.dynasty) ensureRef(dynasties, "朝代", source, "dynasty", view.dynasty);
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
            meta: "人物年龄",
            summary: view.summary || view.meta?.subtitle || ""
        });
    }

    const topicCount = dynastyList.reduce((total, dynasty) => total + dynasty.topics.length, 0);

    // ---------- 视图拼装 ----------
    const timelines = {};
    for (const view of Object.values(views)) {
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

    return { figures, places, regions, views, dynasties: dynastyList, topicCount, timelines };
}

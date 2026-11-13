/**
 * EntityLoader.js — 实体加载器
 *
 * 职责：
 * 1. 从六个子目录读取所有 JSON 实体（regions / places / figures / events / dynasties / views）
 * 2. 对每一类做字段级校验（引用完整性、类型、数值范围）
 * 3. 建立反向索引（figure.events / place.events / place.figures / figure.milestones）
 * 4. 对 views 做类型专属校验（不同 view.type 有不同的必填字段）
 *
 * 返回一个填满的 WorldContext 实例。
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readEntities, ensureArray, ensureNumber, ensureRef } from "./validators.js";
import { WorldContext } from "./WorldContext.js";

export class EntityLoader {
    constructor() {
        const DATA_DIR = path.dirname(fileURLToPath(import.meta.url));
        this.dataDir = path.resolve(DATA_DIR, ".."); // world/ 的上级 = _data/
    }

    load() {
        const ctx = new WorldContext();

        /* ---------- 1. 读取 ---------- */
        const regionResult  = readEntities("regions",  this.dataDir);
        const placeResult   = readEntities("places",   this.dataDir);
        const figureResult  = readEntities("figures",  this.dataDir);
        const eventResult   = readEntities("events",   this.dataDir);
        const viewResult    = readEntities("views",    this.dataDir);
        const dynastyResult = readEntities("dynasties",this.dataDir);

        ctx.regions   = regionResult.entities;
        ctx.places    = placeResult.entities;
        ctx.figures   = figureResult.entities;
        ctx.events    = eventResult.entities;
        ctx.views     = viewResult.entities;
        ctx.dynasties = dynastyResult.entities;

        ctx.sources = {
            ...regionResult.sources,
            ...placeResult.sources,
            ...figureResult.sources,
            ...eventResult.sources,
            ...dynastyResult.sources,
            // views 没加进 sources（原代码也没加），保持一致
        };

        /* ---------- 2. 逐类校验 ---------- */
        this._validateDynasties(ctx);
        this._validateRegions(ctx);
        this._validatePlaces(ctx);
        this._validateFigures(ctx);
        this._validateEvents(ctx);
        this._validateViews(ctx);

        /* ---------- 3. 反向索引 ---------- */
        this._buildReverseIndices(ctx);

        return ctx;
    }

    /* ---------- 逐类校验 ---------- */

    _validateDynasties(ctx) {
        for (const dynasty of Object.values(ctx.dynasties)) {
            const source = ctx.sources[dynasty.id];
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
    }

    _validateRegions(ctx) {
        for (const region of Object.values(ctx.regions)) {
            const source = ctx.sources[region.id];
            const bbox = ensureArray(region.bbox, source, "bbox");
            if (bbox.length !== 4 || bbox.some((n) => typeof n !== "number")) {
                throw new Error(`[world] ${source} 的 bbox 应为 [west, south, east, north] 四个数字`);
            }
            if (!region.name) throw new Error(`[world] ${source} 缺少 name`);
        }
    }

    _validatePlaces(ctx) {
        for (const place of Object.values(ctx.places)) {
            const source = ctx.sources[place.id];
            if (!place.name) throw new Error(`[world] ${source} 缺少 name`);
            ensureNumber(place.lon, source, "lon");
            ensureNumber(place.lat, source, "lat");
            ensureRef(ctx.regions, "区域", source, "region", place.region);
        }
    }

    _validateFigures(ctx) {
        for (const figure of Object.values(ctx.figures)) {
            const source = ctx.sources[figure.id];
            if (!figure.name) throw new Error(`[world] ${source} 缺少 name`);
            if (figure.birth !== undefined) ensureNumber(figure.birth, source, "birth");
            if (figure.death !== undefined) ensureNumber(figure.death, source, "death");
            if (figure.birth !== undefined && figure.death !== undefined && figure.birth > figure.death) {
                throw new Error(`[world] ${source} 的 birth 晚于 death`);
            }
            for (const parentId of ensureArray(figure.parents, source, "parents")) {
                ensureRef(ctx.figures, "人物", source, "parents", parentId);
                if (parentId === figure.id) throw new Error(`[world] ${source} 的 parents 不能引用自身`);
            }
            if (figure.origin) ensureRef(ctx.places, "地点", source, "origin", figure.origin);
            for (const placeId of ensureArray(figure.activePlaces, source, "activePlaces")) {
                ensureRef(ctx.places, "地点", source, "activePlaces", placeId);
            }
            for (const eventId of ensureArray(figure.milestones, source, "milestones")) {
                ensureRef(ctx.events, "事件", source, "milestones", eventId);
            }
        }
    }

    _validateEvents(ctx) {
        for (const event of Object.values(ctx.events)) {
            const source = ctx.sources[event.id];
            ensureNumber(event.year, source, "year");
            if (!event.title) throw new Error(`[world] ${source} 缺少 title`);
            for (const figureId of ensureArray(event.figures, source, "figures")) {
                ensureRef(ctx.figures, "人物", source, "figures", figureId);
            }
            for (const placeId of ensureArray(event.places, source, "places")) {
                ensureRef(ctx.places, "地点", source, "places", placeId);
            }
        }
    }

    _validateViews(ctx) {
        for (const view of Object.values(ctx.views)) {
            const source = `views/${view.id}.json`;
            if (view.dynasty) ensureRef(ctx.dynasties, "朝代", source, "dynasty", view.dynasty);

            switch (view.type) {
                case "reign-crowd": {
                    if (!view.dynasty) throw new Error(`[world] ${source} 缺少 dynasty`);
                    for (const group of ensureArray(view.groups, source, "groups")) {
                        if (!group.id || !group.name) throw new Error(`[world] ${source} 的 groups 每项都需要 id 与 name`);
                    }
                    for (const item of ensureArray(view.cast, source, "cast")) {
                        ensureRef(ctx.figures, "人物", source, "cast", item.figure);
                        ensureNumber(ctx.figures[item.figure].birth, ctx.sources[item.figure], "birth");
                        ensureNumber(ctx.figures[item.figure].death, ctx.sources[item.figure], "death");
                    }
                    for (const eventId of ensureArray(view.events, source, "events")) {
                        ensureRef(ctx.events, "事件", source, "events", eventId);
                    }
                    break;
                }
                case "dynasty-reigns": {
                    for (const figureId of ensureArray(view.figures, source, "figures")) {
                        ensureRef(ctx.figures, "人物", source, "figures", figureId);
                    }
                    break;
                }
                case "family-tree": {
                    if (!view.dynasty) throw new Error(`[world] ${source} 缺少 dynasty`);
                    for (const figureId of ensureArray(view.figures, source, "figures")) {
                        ensureRef(ctx.figures, "人物", source, "figures", figureId);
                    }
                    for (const roleId of Object.keys(view.roles || {})) {
                        ensureRef(ctx.figures, "人物", source, "roles", roleId);
                    }
                    for (const orderId of Object.keys(view.orders || {})) {
                        ensureRef(ctx.figures, "人物", source, "orders", orderId);
                    }
                    break;
                }
                default: {
                    /* 普通时间轴视图 */
                    const groupIds = new Set();
                    for (const group of ensureArray(view.groups, source, "groups")) {
                        if (!group.id || !group.name) throw new Error(`[world] ${source} 的 groups 每项都需要 id 与 name`);
                        if (groupIds.has(group.id)) throw new Error(`[world] ${source} 的 groups 中「${group.id}」重复`);
                        groupIds.add(group.id);
                    }
                    const castIds = new Set();
                    for (const item of ensureArray(view.cast, source, "cast")) {
                        ensureRef(ctx.figures, "人物", source, "cast", item.figure);
                        ensureNumber(ctx.figures[item.figure].birth, ctx.sources[item.figure], "birth");
                        ensureNumber(ctx.figures[item.figure].death, ctx.sources[item.figure], "death");
                        if (!groupIds.has(item.group)) {
                            throw new Error(`[world] ${source} 的 cast 中「${item.figure}」归属了不存在的分组「${item.group}」`);
                        }
                        castIds.add(item.figure);
                    }
                    for (const eventId of ensureArray(view.events, source, "events")) {
                        ensureRef(ctx.events, "事件", source, "events", eventId);
                    }
                    for (const eventId of ensureArray(view.personalEvents, source, "personalEvents")) {
                        ensureRef(ctx.events, "事件", source, "personalEvents", eventId);
                    }
                    for (const figureId of ensureArray(view.defaults, source, "defaults")) {
                        if (!castIds.has(figureId)) {
                            throw new Error(`[world] ${source} 的 defaults 中「${figureId}」不在 cast 里`);
                        }
                    }
                }
            }
        }
    }

    /* ---------- 反向索引 ---------- */

    _buildReverseIndices(ctx) {
        /* figure.events — 所有涉及此人物的事件 id */
        for (const figure of Object.values(ctx.figures)) {
            const related = Object.values(ctx.events)
                .filter((event) => ensureArray(event.figures, "", "figures").includes(figure.id))
                .sort((a, b) => a.year - b.year);
            figure.events = related.map((event) => event.id);
            figure.milestones = ensureArray(figure.milestones, "", "milestones").map((eventId) => ({
                id: eventId,
                year: ctx.events[eventId].year,
                title: ctx.events[eventId].title
            }));
        }

        /* place.events + place.figures */
        for (const place of Object.values(ctx.places)) {
            const related = Object.values(ctx.events)
                .filter((event) => ensureArray(event.places, "", "places").includes(place.id))
                .sort((a, b) => a.year - b.year);
            place.events = related.map((event) => event.id);
            place.figures = [...new Set(related.flatMap((event) => ensureArray(event.figures, "", "figures")))];
        }
    }
}

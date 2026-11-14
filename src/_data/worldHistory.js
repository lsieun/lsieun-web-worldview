/**
 * worldHistory.js — 世界史册全局数据入口
 *
 * 职责：组装世界史册所有数据，供模板层 worldHistory.xxx 访问。
 *   1. 读取 world/eras（世界时期定义）+ figures + events + views
 *   2. 对 views 做引用校验 + 用 TimelineBuilder 拼装为 timelines
 *   3. 对 eras 排序、挂 topic 计数
 *
 * 与 _data/world.js 独立，互不干扰。模板层用 worldHistory.eras / worldHistory.timelines。
 */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { TimelineBuilder } from "./core/builders/TimelineBuilder.js";
import { ensureArray } from "./core/validators.js";

const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)));

/** 从 `${DATA_DIR}/${subdir}/` 读取全部 .json → { entities: {id→data}, sources: {id→path} } */
function readWorldEntities(subdir) {
    const abs = path.join(DATA_DIR, subdir);
    const entities = {};
    if (!fs.existsSync(abs)) return entities;
    for (const file of fs.readdirSync(abs).sort()) {
        if (!file.endsWith(".json")) continue;
        const id = file.slice(0, -5);
        const data = JSON.parse(fs.readFileSync(path.join(abs, file), "utf8"));
        entities[id] = { ...data, id };
    }
    return entities;
}

function sortByOrder(arr) { return [...arr].sort((a, b) => (a.order ?? 99) - (b.order ?? 99)); }

export default function () {
    /* ---------- 1. 读取四个世界实体目录 ---------- */
    const eras    = readWorldEntities("world/eras");
    const figures = readWorldEntities("world/figures");
    const events  = readWorldEntities("world/events");
    const views   = readWorldEntities("world/views");

    /* ---------- 2. 简单引用校验 ---------- */
    for (const view of Object.values(views)) {
        for (const item of ensureArray(view.cast, "", "cast")) {
            if (!figures[item.figure]) throw new Error(`[world-history] views/${view.id}.json 的 cast 引用了不存在的人物「${item.figure}」`);
        }
        for (const eventId of ensureArray(view.events, "", "events")) {
            if (!events[eventId]) throw new Error(`[world-history] views/${view.id}.json 的 events 引用了不存在的事件「${eventId}」`);
        }
        for (const eventId of ensureArray(view.personalEvents, "", "personalEvents")) {
            if (!events[eventId]) throw new Error(`[world-history] views/${view.id}.json 的 personalEvents 引用了不存在的事件「${eventId}」`);
        }
    }

    /* ---------- 3. 组装伪 WorldContext（TimelineBuilder 需要 figures + events 字典） ---------- */
    const ctx = { figures, events, views, eras, dynasties: {} };

    /* ---------- 4. 用 TimelineBuilder 拼装 timeline ---------- */
    const timelineBuilder = new TimelineBuilder();
    const timelines = {};
    for (const view of Object.values(views)) {
        timelines[view.id] = timelineBuilder.build(view, ctx);
    }

    /* ---------- 5. eras 排序 + 挂专题 ---------- */
    const eraList = sortByOrder(Object.values(eras));
    for (const era of eraList) {
        era.topics = [];
        for (const view of Object.values(views)) {
            if (view.era === era.id) {
                era.topics.push({
                    title: view.title,
                    href: view.href || `/world-history/${view.id}.html`,
                    meta: view.topicMeta || "专题"
                });
            }
        }
    }

    return {
        eras: eraList,
        figures,
        events,
        timelines
    };
}

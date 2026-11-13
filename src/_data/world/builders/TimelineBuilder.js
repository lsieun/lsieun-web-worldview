/**
 * TimelineBuilder.js — 普通人物时间轴
 *
 * 对应原 world.js 主流程中"视图拼装"区块的 default 分支（view.type 非
 * reign-crowd / dynasty-reigns / family-tree 时走这里）。
 *
 * 把 cast → people、events → axisEvents、personalEvents 按人物挂载，
 * 计算 range（cast 人物生卒的 min/max，或 view.range 覆盖）。
 */
import { ViewBuilder } from "./ViewBuilder.js";
import { ensureArray } from "../validators.js";
import { formatYear } from "../utils.js";

export class TimelineBuilder extends ViewBuilder {
    build(view, ctx) {
        const cast = ensureArray(view.cast, "", "cast");
        const castIds = new Set(cast.map((item) => item.figure));

        const people = cast
            .map((item) => {
                const figure = ctx.figures[item.figure];
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
            .map((eventId) => ctx.events[eventId])
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
                const event = ctx.events[eventId];
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

        return {
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
}

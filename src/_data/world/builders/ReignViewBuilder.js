/**
 * ReignViewBuilder.js — 帝王世系视图
 *
 * 对应原 world.js 的 buildReignView 函数（76-251 行）。
 * 包含：
 *   - dynasty.rulers 的帝序 / terms / events 校验与打包
 *   - dynasty.regencies 的临朝轨打包
 *   - 世系树（复用 WorldContext.buildLineage，替换原复制粘贴的环检测 + 代计算）
 */
import { ViewBuilder } from "./ViewBuilder.js";
import { ensureArray, ensureNumber, ensureRef } from "../validators.js";
import { formatYear, elapsedYears } from "../utils.js";

export class ReignViewBuilder extends ViewBuilder {
    build(view, ctx) {
        const dynasty = ctx.dynasties[view.dynasty];
        const source = ctx.sources[dynasty.id];
        const treeIds = new Set(ensureArray(view.figures, `views/${view.id}.json`, "figures"));

        /* ---------- 1. 临朝轨 ---------- */
        const regencies = ensureArray(dynasty.regencies, source, "regencies").map((regency) => {
            ensureRef(ctx.figures, "人物", source, "regencies", regency.figure);
            const start = ensureNumber(regency.start, source, "regencies.start");
            const end = ensureNumber(regency.end, source, "regencies.end");
            if (start > end) throw new Error(`[world] ${source} 的摄政年段起止倒置`);
            return {
                id: regency.figure,
                name: ctx.figures[regency.figure].name,
                label: regency.label || "辅政",
                note: regency.note || "",
                start,
                end,
                startLabel: formatYear(start),
                endLabel: formatYear(end)
            };
        });

        /* ---------- 2. 帝系条 ---------- */
        const orders = new Set();
        const rulerIds = new Set();
        const eventIds = new Set();
        let formalCount = 0;
        let eventCount = 0;

        const rulers = ensureArray(dynasty.rulers, source, "rulers").map((ruler) => {
            ensureRef(ctx.figures, "人物", source, "rulers", ruler.figure);
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
                    ensureRef(ctx.events, "事件", source, `rulers.${ruler.figure}.terms.events`, eventId);
                    if (eventIds.has(eventId)) {
                        throw new Error(`[world] ${source} 的事件「${eventId}」被重复分配到多个在位区块`);
                    }
                    eventIds.add(eventId);
                    const event = ctx.events[eventId];
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

            const figure = ctx.figures[ruler.figure];
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

        /* ---------- 3. 世系树（复用通用方法） ---------- */
        const lineageSource = `views/${view.id}.json`;
        const { nodes, treeRoots } = ctx.buildLineage(
            treeIds,
            lineageSource,
            /* nodeBuilder */ (figure, id) => {
                const ruler = rulerById.get(id);
                const nodeHref = ruler ? `${view.href}#timeline-${id}` : "";
                return {
                    id,
                    name: figure.name,
                    summary: figure.summary || "",
                    hasRuler: Boolean(ruler),
                    order: ruler?.order,
                    title: ruler?.title || figure.name,
                    status: ruler?.status || "kin",
                    note: ruler?.note || "",
                    reignLabel: ruler ? ruler.terms.map((term) => `${term.startLabel} — ${term.endLabel}`).join("、") : "未即位 · 世系连接",
                    tooltipEvents: ruler ? ruler.terms.flatMap((term) => (term.events || []).map((ev) => `${ev.yearLabel || ev.year} ${ev.title}`)).slice(0, 6) : [],
                    href: nodeHref
                };
            },
            /* compareFn */ (a, b) => (a.order ?? 999) - (b.order ?? 999) || a.name.localeCompare(b.name, "zh-Hans-CN")
        );

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
}

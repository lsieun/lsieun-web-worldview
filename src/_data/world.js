/**
 * world.js — 实体库拼装器（总入口）
 *
 * 职责：组装，不实现。
 *   1. EntityLoader 读取全部 JSON 实体 → 逐类校验 → 建立反向索引 → 返回 WorldContext
 *   2. DynastyRegistry 组装朝代主题索引（dynastyList + topicCount）
 *   3. 遍历 views，按 view.type 分派到对应 Builder
 *   4. 汇总输出，对模板层的契约零变化
 *
 * 详细模块见 world/ 子目录。
 */
import { EntityLoader } from "./world/EntityLoader.js";
import { DynastyRegistry } from "./world/DynastyRegistry.js";
import { TimelineBuilder } from "./world/builders/TimelineBuilder.js";
import { ReignViewBuilder } from "./world/builders/ReignViewBuilder.js";
import { FamilyViewBuilder } from "./world/builders/FamilyViewBuilder.js";
import { CrowdViewBuilder } from "./world/builders/CrowdViewBuilder.js";

/* ---------- 视图分派 ---------- */
const timelineBuilder  = new TimelineBuilder();
const reignBuilder     = new ReignViewBuilder();
const familyBuilder    = new FamilyViewBuilder();
const crowdBuilder     = new CrowdViewBuilder();

function buildView(view, ctx) {
    switch (view.type) {
        case "reign-crowd":   return crowdBuilder.build(view, ctx);
        case "dynasty-reigns":return reignBuilder.build(view, ctx);
        case "family-tree":   return familyBuilder.build(view, ctx);
        default:              return timelineBuilder.build(view, ctx);
    }
}

/* ---------- Eleventy _data 入口 ---------- */
export default function () {
    /* 1. 加载 + 校验 + 反向索引 */
    const ctx = new EntityLoader().load();

    /* 2. 朝代主题索引 */
    const { dynastyList, topicCount } = new DynastyRegistry(ctx).build();

    /* 3. 视图拼装（按 type 分派到 Builder） */
    const timelines = {};
    const reignViews = {};
    const crowdViews = {};
    const familyViews = {};

    for (const view of Object.values(ctx.views)) {
        const result = buildView(view, ctx);
        switch (view.type) {
            case "reign-crowd":
                crowdViews[view.id] = result;
                break;
            case "dynasty-reigns":
                reignViews[view.id] = result;
                break;
            case "family-tree":
                familyViews[view.id] = result;
                break;
            default:
                timelines[view.id] = result;
        }
    }

    /* 4. 汇总输出 */
    return {
        figures:    ctx.figures,
        places:     ctx.places,
        regions:    ctx.regions,
        views:      ctx.views,
        dynasties:  dynastyList,
        topicCount,
        timelines,
        reignViews,
        crowdViews,
        familyViews
    };
}

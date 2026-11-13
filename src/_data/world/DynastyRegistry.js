/**
 * DynastyRegistry.js — 朝代主题索引
 *
 * 把 views 里声明了 dynasty 的专题挂到对应 dynasty.topics 下，
 * 并统计 topicCount。
 *
 * 对应原 world.js 主流程的"朝代与专题索引"区块。
 */
import { ensureArray } from "./validators.js";

export class DynastyRegistry {
    /**
     * @param {import("./WorldContext.js").WorldContext} ctx
     */
    constructor(ctx) {
        this.ctx = ctx;
    }

    /**
     * @returns {{ dynastyList: any[], topicCount: number }}
     */
    build() {
        const dynastyList = Object.values(this.ctx.dynasties)
            .map((dynasty) => ({ ...dynasty, topics: [...ensureArray(dynasty.topics, "", "topics")] }))
            .sort((a, b) => a.order - b.order);

        for (const view of Object.values(this.ctx.views)) {
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
        return { dynastyList, topicCount };
    }
}

/**
 * DynastyRegistry.js — 朝代主题索引
 *
 * 把 views 里声明了 dynasty 的专题挂到对应 dynasty.topics 下，
 * 并统计 topicCount。
 *
 * 支持一级子朝代：带 parent 的朝代（如曹魏/蜀汉/东吴之于三国）
 * 不进入顶层 dynastyList，而是作为父朝代的 subgroups 渲染；
 * 挂在子朝代上的专题随子朝代一起出现在父朝代分组内。
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
        const all = Object.values(this.ctx.dynasties)
            .map((dynasty) => ({ ...dynasty, topics: [...ensureArray(dynasty.topics, "", "topics")] }));
        const byId = new Map(all.map((dynasty) => [dynasty.id, dynasty]));

        /* ---------- 子朝代挂到父朝代（仅一级） ---------- */
        for (const dynasty of all) {
            if (!dynasty.parent) continue;
            const parent = byId.get(dynasty.parent);
            if (!parent) {
                throw new Error(`[world] 朝代「${dynasty.id}」的 parent「${dynasty.parent}」不存在`);
            }
            if (parent.parent) {
                throw new Error(`[world] 朝代「${dynasty.id}」的 parent「${dynasty.parent}」自身是子朝代，暂不支持两级嵌套`);
            }
            parent.subgroups = parent.subgroups || [];
            parent.subgroups.push(dynasty);
        }
        for (const parent of byId.values()) {
            if (parent.subgroups) parent.subgroups.sort((a, b) => a.order - b.order);
        }

        const dynastyList = all.filter((dynasty) => !dynasty.parent)
            .sort((a, b) => a.order - b.order);

        for (const view of Object.values(this.ctx.views)) {
            if (!view.dynasty) continue;
            const dynasty = byId.get(view.dynasty);
            if (!dynasty) {
                throw new Error(`[world] 视图「${view.id}」的 dynasty「${view.dynasty}」不存在`);
            }
            dynasty.topics.push({
                title: view.title || view.meta?.title || view.id,
                href: view.href || `/figures/${view.id}.html`,
                meta: view.topicMeta || (view.type === "dynasty-reigns" ? "帝王世系" : "人物年龄"),
                summary: view.summary || view.meta?.subtitle || ""
            });
        }

        const topicCount = all.reduce((total, dynasty) => total + dynasty.topics.length, 0);
        return { dynastyList, topicCount };
    }
}

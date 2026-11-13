/**
 * WorldContext.js — 实体库上下文
 *
 * 持有六张大表 + sources 映射，为所有 builder 提供统一访问接口。
 * 封装"读表"和"断言引用"两个高频操作，消除长参数列表。
 *
 * 同时提供世系树的通用构建方法（环检测 + 代计算 + 父子关联 + 排序），
 * 原 buildReignView 和 buildFamilyView 里那段复制粘贴的逻辑只保留一份在这里。
 */
import { ensureArray } from "./validators.js";

export class WorldContext {
    constructor() {
        /** @type {Record<string, any>} */
        this.figures = {};
        /** @type {Record<string, any>} */
        this.events = {};
        /** @type {Record<string, any>} */
        this.places = {};
        /** @type {Record<string, any>} */
        this.regions = {};
        /** @type {Record<string, any>} */
        this.views = {};
        /** @type {Record<string, any>} */
        this.dynasties = {};

        /** @type {Record<string, string>} id → source path (如 "figures/liubang.json") */
        this.sources = {};
    }

    /* ---------- 便捷查询 ---------- */

    figure(id)   { return this.figures[id]; }
    event(id)    { return this.events[id]; }
    place(id)    { return this.places[id]; }
    dynasty(id)  { return this.dynasties[id]; }
    sourceOf(id) { return this.sources[id]; }

    /**
     * 断言 collection 中存在 id，不存在则抛带 kind/source/field 的错误。
     * @param {Record<string, any>} collection 表名
     * @param {string} kind 实体中文名（如 "人物"、"事件"）
     * @param {string} source 出错文件路径
     * @param {string} field 出错字段名
     * @param {string} id 被引用的 id
     */
    assertRef(collection, kind, source, field, id) {
        if (!Object.prototype.hasOwnProperty.call(collection, id)) {
            throw new Error(`[world] ${source} 的 ${field} 引用了不存在的${kind}「${id}」`);
        }
    }

    /* ---------- 世系树通用构建 ----------
     *
     * 给定一组 figureIds（子集或全部），按 figure.parents 字段构建树。
     * 返回 nodes Map + treeRoots 数组。每个 node 附带 generation、children。
     *
     * @param {Set<string>} figureIds 参与树构建的人物 id 集合
     * @param {string} source 出错文件路径（用于环检测报错）
     * @param {function} [nodeBuilder] 可选：对每个节点补充额外字段
     *     (figure, id) => node 对象
     * @param {function} [compareFn] 可选：兄弟节点比较函数
     *     默认按 figure.name localeCompare
     * @returns {{ nodes: Map<string, any>, treeRoots: any[] }}
     */
    buildLineage(figureIds, source, nodeBuilder, compareFn) {
        const ids = figureIds instanceof Set ? figureIds : new Set(figureIds);
        const nodes = new Map();

        /* 第一遍：创建所有节点，收集父节点（只保留树内父节点） */
        for (const id of ids) {
            const figure = this.figures[id];
            if (!figure) {
                throw new Error(`[world] ${source} 的世系节点「${id}」不存在于人物表`);
            }
            const parents = ensureArray(figure.parents, this.sources[id], "parents")
                .filter((parentId) => ids.has(parentId));
            if (parents.length > 1) {
                throw new Error(`[world] ${source} 的世系节点「${id}」目前只支持一个树内父节点`);
            }
            const base = nodeBuilder ? nodeBuilder(figure, id) : { id, name: figure.name };
            nodes.set(id, {
                ...base,
                parents,
                children: [],
                generation: 0
            });
        }

        /* 第二遍：代计算 + 环检测 */
        const generations = new Map();
        const generationOf = (id, trail = new Set()) => {
            if (generations.has(id)) return generations.get(id);
            if (trail.has(id)) {
                throw new Error(`[world] ${source} 的世系关系存在环，涉及「${id}」`);
            }
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
        };

        const treeRoots = [];
        for (const node of nodes.values()) {
            node.generation = generationOf(node.id);
            const parentId = node.parents[0];
            if (parentId) {
                nodes.get(parentId).children.push(node);
            } else {
                treeRoots.push(node);
            }
        }

        /* 第三遍：排序 */
        const compareNodes = compareFn || ((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
        const sortTree = (node) => {
            node.children.sort(compareNodes);
            node.children.forEach(sortTree);
        };
        treeRoots.sort(compareNodes);
        treeRoots.forEach(sortTree);

        return { nodes, treeRoots };
    }
}

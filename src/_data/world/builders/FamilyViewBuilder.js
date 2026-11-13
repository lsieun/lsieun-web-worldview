/**
 * FamilyViewBuilder.js — 家族世系谱牒长卷
 *
 * 对应原 world.js 的 buildFamilyView 函数（254-428 行）。
 * 在基础世系树之上额外计算：
 *   - siblingRank：同父内的长幼序号（1..N，跨父各自从 1 开始）
 *   - branch：始祖之下的第一代分支（供长卷分色）
 *   - scroll 坐标：谱牒长卷的卡片布局坐标与圆角连线
 */
import { ViewBuilder } from "./ViewBuilder.js";
import { ensureArray, ensureRef } from "../validators.js";
import { formatYear } from "../utils.js";

export class FamilyViewBuilder extends ViewBuilder {
    build(view, ctx) {
        const viewSource = `views/${view.id}.json`;
        const dynasty = ctx.dynasties[view.dynasty];
        if (!dynasty) throw new Error(`[world] ${viewSource} 缺少有效 dynasty`);
        const dynastySource = ctx.sources[dynasty.id];
        const figureIds = new Set(ensureArray(view.figures, viewSource, "figures"));
        const roles = view.roles && typeof view.roles === "object" ? view.roles : {};
        const orders = view.orders && typeof view.orders === "object" ? view.orders : {};

        /* rulerById：dynasty.rulers → Map<figureId, ruler> */
        const rulerById = new Map();
        for (const ruler of ensureArray(dynasty.rulers, dynastySource, "rulers")) {
            rulerById.set(ruler.figure, ruler);
        }

        /* ---------- 1. 基础世系树 ---------- */
        const { nodes, treeRoots } = ctx.buildLineage(
            figureIds,
            viewSource,
            /* nodeBuilder */ (figure, id) => {
                const ruler = rulerById.get(id);
                const terms = ruler ? ensureArray(ruler.terms, dynastySource, `rulers.${id}.terms`) : [];
                return {
                    id,
                    name: figure.name,
                    birth: figure.birth,
                    emperor: Boolean(ruler),
                    order: ruler?.order,
                    imperialLabel: ruler ? (ruler.order ? `第 ${ruler.order} 位皇帝` : "过渡人物") : "",
                    siblingRank: null,
                    status: ruler?.status || "kin",
                    title: figure.name,
                    detail: ruler ? ruler.title : (roles[id] || "宗室宗亲"),
                    reignLabel: ruler
                        ? terms.map((term) => `${formatYear(term.start)} — ${formatYear(term.end)}`).join("、")
                        : "宗室支系",
                    href: ruler && view.emperorHref
                        ? `${view.emperorHref}#timeline-${id}`
                        : ""
                };
            },
            /* compareFn */ (a, b) =>
                (orders[a.id] ?? 999) - (orders[b.id] ?? 999) ||
                (a.birth ?? 9999) - (b.birth ?? 9999) ||
                (a.order ?? 999) - (b.order ?? 999) ||
                a.name.localeCompare(b.name, "zh-Hans-CN")
        );

        /* ---------- 2. 同父长幼序 ---------- */
        const assignSiblingRanks = (node) => {
            node.children.forEach((child, index) => {
                child.siblingRank = index + 1;
                assignSiblingRanks(child);
            });
        };
        treeRoots.forEach(assignSiblingRanks);

        /* ---------- 3. 支系（始祖之下第一代分支） ---------- */
        const branchOf = (node) => {
            const visited = new Set();
            let current = node;
            while (current.parents.length && current.generation > 1) {
                if (visited.has(current.id)) break;
                visited.add(current.id);
                current = nodes.get(current.parents[0]);
            }
            return current.generation === 1 ? current.id : "root";
        };
        for (const node of nodes.values()) node.branch = branchOf(node);

        /* ---------- 4. 谱牒长卷坐标 ---------- */
        const scroll = { column: 250, row: 68, nodeWidth: 200, nodeHeight: 58, pad: 40 };
        let scrollLeafCursor = 0;
        const assignScrollCoordinates = (node) => {
            node.scrollX = scroll.pad + node.generation * scroll.column;
            if (!node.children.length) {
                node.scrollY = scroll.pad + scrollLeafCursor * scroll.row;
                scrollLeafCursor += 1;
            } else {
                node.children.forEach(assignScrollCoordinates);
                node.scrollY = (node.children[0].scrollY + node.children[node.children.length - 1].scrollY) / 2;
            }
        };
        treeRoots.forEach(assignScrollCoordinates);

        const scrollEdges = [];
        for (const node of nodes.values()) {
            for (const child of node.children) {
                const x1 = node.scrollX + scroll.nodeWidth;
                const y1 = node.scrollY + scroll.nodeHeight / 2;
                const x2 = child.scrollX;
                const y2 = child.scrollY + scroll.nodeHeight / 2;
                const mid = (x1 + x2) / 2;
                let path;
                if (Math.abs(y2 - y1) < 1) {
                    path = `M${x1} ${y1} H${x2}`;
                } else {
                    const radius = Math.min(10, Math.abs(y2 - y1) / 2, (x2 - x1) / 2);
                    const direction = y2 > y1 ? 1 : -1;
                    path = `M${x1} ${y1} H${mid - radius} Q${mid} ${y1} ${mid} ${y1 + direction * radius}`
                        + ` V${y2 - direction * radius} Q${mid} ${y2} ${mid + radius} ${y2} H${x2}`;
                }
                scrollEdges.push({ from: node.id, to: child.id, branch: node.branch, path });
            }
        }

        const generationsMax = nodes.size ? Math.max(...[...nodes.values()].map((node) => node.generation)) + 1 : 0;
        const maxGeneration = generationsMax - 1;
        const numerals = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
        const scrollGenerations = Array.from({ length: generationsMax }, (_, index) => ({
            index,
            label: `${numerals[index] || index + 1}世`,
            x: scroll.pad + index * scroll.column,
            width: scroll.nodeWidth
        }));
        const scrollWidth = scroll.pad * 2 + maxGeneration * scroll.column + scroll.nodeWidth;
        const scrollHeight = scroll.pad * 2 + Math.max(scrollLeafCursor - 1, 0) * scroll.row + scroll.nodeHeight;

        return {
            id: view.id,
            title: view.title,
            href: view.href,
            meta: { watermark: "史", ...view.meta },
            dynasty: { id: dynasty.id, name: dynasty.name, start: dynasty.start, end: dynasty.end },
            nodeCount: nodes.size,
            emperorCount: [...nodes.values()].filter((node) => node.emperor).length,
            generationCount: generationsMax,
            scrollMap: {
                width: scrollWidth,
                height: scrollHeight,
                nodeWidth: scroll.nodeWidth,
                nodeHeight: scroll.nodeHeight,
                generations: scrollGenerations,
                edges: scrollEdges
            },
            treeRoots
        };
    }
}

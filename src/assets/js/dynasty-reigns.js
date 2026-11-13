/*
 * dynasty-reigns.js — 朝代帝系双视图联动
 *
 * 无 JS 时两个完整视图按文档流展示；有 JS 时启用单面板切换。
 * hash 同时记录视图与人物，支持深链及浏览器前进、后退。
 */
(function () {
    const root = document.querySelector('[data-reign-root]');
    if (!root) return;

    const panels = new Map(
        Array.from(root.querySelectorAll('[data-reign-panel]')).map((panel) => [panel.dataset.reignPanel, panel])
    );
    /* 平铺模式不再需要 reign-switch 按钮，但保留 panel 检查确保两个视图都存在 */
    if (!panels.has('kinship') || !panels.has('timeline')) return;

    const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dynastyTitle = document.querySelector('h1')?.textContent?.trim() || '历代皇帝';
    let activeView = 'timeline';

    const kinshipPanel = panels.get('kinship');
    const chartShell = kinshipPanel.querySelector('[data-tree-chart-shell]');
    const chartEl = kinshipPanel.querySelector('[data-tree-chart]');
    const chartStatus = kinshipPanel.querySelector('[data-tree-status]');

    /* ---------- 页面级初始视角（来自 frontmatter treeView） ----------
     * ECharts tree 的 center 用来定位**根节点**在画布上的位置。
     * 竖向（TB）树把根放顶部，centerY 用小百分比（5%~15%）给下方子孙留空间。
     * 横向（LR）树把根放左侧，centerX 用小百分比。
     * centerPerson 是初始渲染完成后，把指定**任意节点**平移到画布中心的视口操作。 */
    const treeCenterX = root.dataset.treeCenterX || '50%';
    const treeCenterY = root.dataset.treeCenterY || '10%';
    const initialCenter = [treeCenterX, treeCenterY];
    /** @type {string} 用户声明的初始聚焦人物 id */
    const initialCenterPerson = root.dataset.treeCenterPerson || '';
    /** @type {number|null} 用户显式声明的初始缩放；null 表示自动计算 */
    const userZoom = root.dataset.treeZoom ? parseFloat(root.dataset.treeZoom) : null;

    let chart = null;
    let chartData = [];
    let chartTarget = '';
    let chartColors = null;
    let chartMetrics = { leaves: 1, levels: 1 };
    let initialZoom = userZoom || 1.2;
    let overviewMode = false;
    let roamLabelTimer = null;
    let chartNodeById = new Map();
    let controlsReady = false;
    const LABEL_HIDE_ZOOM = 0.7;
    const LABEL_SHOW_ZOOM = 0.75;

    function directChild(element, className) {
        return Array.from(element.children).find((child) => child.classList.contains(className));
    }

    function readChartNode(branch, parent = '') {
        const article = directChild(branch, 'kh-node');
        const childList = Array.from(branch.children).find((child) => child.tagName === 'UL');
        const hasRuler = article.classList.contains('is-emperor') || article.classList.contains('is-interim');
        const rankText = article.querySelector('.kh-order').textContent.trim();
        let events = [];
        const rawEvents = article.dataset.events || '';
        if (rawEvents) events = rawEvents.split('||').filter(Boolean);
        const node = {
            name: article.dataset.treePerson,
            person: article.dataset.treePerson,
            parent,
            title: article.querySelector('.kh-identity h4').textContent.trim(),
            detail: article.querySelector('.kh-identity p').textContent.trim(),
            reign: article.querySelector('.kh-reign').textContent.trim(),
            order: Number.parseInt(rankText, 10) || null,
            hasRuler,
            href: article.dataset.nodeHref || '',
            note: article.dataset.note || '',
            summary: article.dataset.summary || '',
            events,
            children: childList
                ? Array.from(childList.children).map((child) => readChartNode(child, article.dataset.treePerson))
                : []
        };
        chartNodeById.set(node.person, node);
        return node;
    }

    function measureChartTree(nodes, depth = 1) {
        return nodes.reduce((metrics, node) => {
            metrics.leaves += node.children.length ? 0 : 1;
            metrics.levels = Math.max(metrics.levels, depth);
            const children = measureChartTree(node.children, depth + 1);
            metrics.leaves += children.leaves;
            metrics.levels = Math.max(metrics.levels, children.levels);
            return metrics;
        }, { leaves: 0, levels: 0 });
    }

    function readChartColors() {
        const style = getComputedStyle(document.documentElement);
        const color = (name) => style.getPropertyValue(name).trim();
        return {
            bg: color('--color-bg-base'),
            surface: color('--color-surface'),
            surfaceRaised: color('--color-surface-raised'),
            ink: color('--color-ink'),
            inkSoft: color('--color-ink-soft'),
            muted: color('--color-muted'),
            line: color('--color-line'),
            lineStrong: color('--color-line-strong'),
            brass: color('--color-brass'),
            fontBody: color('--font-body'),
            fontSerif: color('--font-serif'),
            fontMono: color('--font-mono')
        };
    }

    function lineageFor(person) {
        const lineage = new Set();
        const visited = new Set();
        let current = chartNodeById.get(person);
        while (current && !visited.has(current.person)) {
            lineage.add(current.person);
            visited.add(current.person);
            current = chartNodeById.get(current.parent);
        }
        return lineage;
    }

    function styledChartData(person) {
        const lineage = person ? lineageFor(person) : new Set();
        function styleNode(node) {
            const isTarget = node.person === person;
            const inLineage = lineage.has(node.person);
            return {
                ...node,
                symbolSize: node.hasRuler ? [156, 38] : [132, 32],
                itemStyle: {
                    color: node.hasRuler ? chartColors.surfaceRaised : chartColors.surface,
                    borderColor: inLineage ? chartColors.brass : (node.hasRuler ? chartColors.line : chartColors.lineStrong),
                    borderWidth: isTarget ? 3 : (inLineage ? 2 : 1),
                    shadowBlur: isTarget ? 10 : 0,
                    shadowColor: chartColors.brass
                },
                lineStyle: {
                    color: inLineage ? chartColors.brass : chartColors.lineStrong,
                    width: inLineage ? 2 : 1
                },
                children: node.children.map(styleNode)
            };
        }
        return chartData.map(styleNode);
    }

    function chartLabel(params) {
        const data = params.data;
        if (!data.hasRuler) {
            /* 宗亲节点砍到 1 行 */
            return `{kin|宗}{title|${data.title}}`;
        }
        /* 皇帝节点砍到 1 行（帝序 + 谥号 + 真名）。
           在位年段移到 tooltip，框改扁后整体紧凑、字体不挤 */
        return `{order|${data.order || '◇'}}{title|${data.title}}{name|${data.detail}}`;
    }

    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, (character) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[character]);
    }

    function chartTooltip(params) {
        const d = params.data;
        /* 宗亲节点：简要信息 */
        if (!d.hasRuler) {
            return `<div style="max-width:240px;font-family:${chartColors.fontBody};font-size:13px;line-height:1.6;color:${chartColors.ink}">`
                + `<strong style="font-family:${chartColors.fontSerif};font-size:14px;color:${chartColors.ink}">${escapeHtml(d.title)}</strong>`
                + `<div style="margin-top:4px;color:${chartColors.muted};font-size:12px">未即位 · 世系连接节点</div>`
                + (d.href ? `<a style="display:block;margin-top:8px;color:${chartColors.brass};font-size:12px;text-decoration:none" href="${escapeHtml(d.href)}">查看纪年 ↓</a>` : '')
                + '</div>';
        }
        /* 皇帝节点：丰富信息 */
        const rulerNote = d.note ? truncateHtml(d.note, 110) : '';
        const summary = d.summary ? truncateHtml(d.summary, 70) : '';
        const eventsHtml = d.events && d.events.length
            ? `<div style="margin-top:10px"><div style="color:${chartColors.muted};font-size:11px;letter-spacing:.08em;margin-bottom:4px">任内关键事件</div>`
                + d.events.map((ev) => `<div style="font-size:12px;color:${chartColors.ink};line-height:1.5">· ${escapeHtml(ev)}</div>`).join('')
                + `</div>`
            : '';
        return `<div style="max-width:300px;font-family:${chartColors.fontBody};font-size:13px;line-height:1.6;color:${chartColors.ink}">`
            + `<div style="color:${chartColors.brass};font-family:${chartColors.fontMono};font-size:11px;font-weight:600;letter-spacing:.06em">第 ${d.order || '—'} 位皇帝</div>`
            + `<strong style="display:block;margin-top:2px;font-family:${chartColors.fontSerif};font-size:16px;color:${chartColors.ink};font-weight:600">${escapeHtml(d.title)}</strong>`
            + `<div style="margin-top:2px;color:${chartColors.muted};font-size:12px">${escapeHtml(d.detail)}</div>`
            + `<div style="margin-top:6px;color:${chartColors.muted};font-family:${chartColors.fontMono};font-size:11px">${escapeHtml(d.reign)}</div>`
            + (rulerNote ? `<div style="margin-top:10px;font-size:12.5px;color:${chartColors.ink-soft};line-height:1.7">${escapeHtml(rulerNote)}</div>` : '')
            + eventsHtml
            + (summary ? `<div style="margin-top:10px;padding-top:8px;border-top:1px solid ${chartColors.line};font-size:12px;color:${chartColors.muted};font-style:italic">${escapeHtml(summary)}</div>` : '')
            + (d.href ? `<a style="display:block;margin-top:10px;color:${chartColors.brass};font-size:12px;text-decoration:none;font-weight:500" href="${escapeHtml(d.href)}">查看纪年详情 ↓</a>` : '')
            + '</div>';
    }

    function truncateHtml(text, maxLen) {
        if (!text) return '';
        return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
    }

    function buildChartOption(data, settings = {}) {
        const forExport = Boolean(settings.forExport);
        return {
            backgroundColor: forExport ? chartColors.bg : chartColors.surface,
            animation: forExport ? false : !reduceMotion(),
            aria: {
                enabled: true,
                description: `${dynastyTitle} 血缘世系树。数字表示皇帝即位顺序，连线只表示父母与子女关系，未即位宗亲用于连接世系。`
            },
            title: forExport ? {
                text: `${dynastyTitle} · 血缘世系`,
                subtext: '数字为帝序 · 连线仅表示亲属关系 · 未即位宗亲不计入帝序',
                left: 36,
                top: 26,
                textStyle: { color: chartColors.ink, fontFamily: chartColors.fontSerif, fontSize: 26, fontWeight: 600 },
                subtextStyle: { color: chartColors.muted, fontFamily: chartColors.fontBody, fontSize: 14 }
            } : undefined,
            tooltip: forExport ? { show: false } : {
                confine: true,
                appendToBody: true,
                backgroundColor: chartColors.surfaceRaised,
                borderColor: chartColors.lineStrong,
                borderWidth: 1,
                padding: [12, 14],
                textStyle: { color: chartColors.ink, fontFamily: chartColors.fontBody, fontSize: 13 },
                formatter: chartTooltip
            },
            series: [{
                id: 'kinship',
                name: '血缘世系',
                type: 'tree',
                data,
                layout: 'orthogonal',
                orient: 'TB',
                left: forExport ? 60 : 24,
                right: forExport ? 60 : 24,
                top: forExport ? 120 : 24,
                bottom: forExport ? 60 : 24,
                symbol: 'roundRect',
                symbolSize: [156, 38],
                roam: !forExport,
                center: settings.center || initialCenter,
                zoom: settings.zoom || initialZoom,
                scaleLimit: { min: 0.12, max: 5 },
                nodeScaleRatio: settings.overview ? 1 : 0.01,
                initialTreeDepth: -1,
                expandAndCollapse: false,
                edgeShape: 'polyline',
                edgeForkPosition: '50%',
                nodeGap: 36,
                levelGap: 64,
                lineStyle: { color: chartColors.lineStrong, width: 1 },
                label: {
                    show: !settings.overview,
                    position: 'inside',
                    formatter: chartLabel,
                    rich: {
                        rank: {
                            color: chartColors.brass,
                            fontFamily: chartColors.fontMono,
                            fontSize: 12,
                            fontWeight: 600,
                            padding: [0, 5, 0, 0]
                        },
                        crown: {
                            color: chartColors.brass,
                            fontSize: 13,
                            padding: [0, 2, 0, 0]
                        },
                        order: {
                            color: chartColors.surfaceRaised,
                            backgroundColor: chartColors.brass,
                            borderRadius: 10,
                            width: 20,
                            height: 20,
                            align: 'center',
                            fontFamily: chartColors.fontMono,
                            fontSize: 10,
                            fontWeight: 600,
                            lineHeight: 20
                        },
                        kin: {
                            color: chartColors.muted,
                            borderColor: chartColors.lineStrong,
                            borderWidth: 1,
                            borderRadius: 3,
                            width: 20,
                            height: 20,
                            align: 'center',
                            fontSize: 9,
                            lineHeight: 20
                        },
                        title: {
                            color: chartColors.ink,
                            fontFamily: chartColors.fontSerif,
                            fontSize: 14,
                            fontWeight: 600,
                            lineHeight: 20,
                            padding: [0, 0, 0, 4]
                        },
                        name: {
                            color: chartColors.muted,
                            fontFamily: chartColors.fontBody,
                            fontSize: 11,
                            lineHeight: 20,
                            padding: [0, 0, 0, 4]
                        },
                        reign: { color: chartColors.muted, fontFamily: chartColors.fontMono, fontSize: 10, lineHeight: 16 }
                    }
                },
                emphasis: {
                    focus: 'ancestor',
                    itemStyle: { borderColor: chartColors.brass, borderWidth: 2 }
                },
                select: { disabled: true }
            }]
        };
    }

    function resizeChart() {
        if (!chart || kinshipPanel.hidden || !chartEl.clientWidth || !chartEl.clientHeight) return;
        chart.resize();
    }

    function calculateInitialZoom() {
        const widthZoom = (chartMetrics.leaves * 225) / Math.max(chartEl.clientWidth, 1);
        const heightZoom = (chartMetrics.levels * 108) / Math.max(chartEl.clientHeight, 1);
        return Math.min(3, Math.max(1.15, widthZoom, heightZoom));
    }

    /* 全图：按叶子数与层数估算内容尺寸，缩到一屏；此时节点随缩放等比变小 */
    function calculateFitZoom() {
        const contentWidth = chartMetrics.leaves * 225;
        const contentHeight = chartMetrics.levels * 108;
        const availableWidth = Math.max(chartEl.clientWidth - 48, 1);
        const availableHeight = Math.max(chartEl.clientHeight - 48, 1);
        const fit = Math.min(availableWidth / contentWidth, availableHeight / contentHeight);
        return Math.min(1, Math.max(0.12, fit));
    }

    function currentChartZoom() {
        return chart?.getOption().series[0].zoom || initialZoom;
    }

    function currentChartCenter() {
        return chart?.getOption().series[0].center || initialCenter;
    }

    /* 缩小到卡片会互相压字时收起标签，只留节点方块；放大回阅读比例再显示 */
    function shouldHideLabels(zoom) {
        if (zoom < LABEL_HIDE_ZOOM) return true;
        if (zoom > LABEL_SHOW_ZOOM) return false;
        return overviewMode;
    }

    function applyChartView({ center, zoom, overview = overviewMode }) {
        overviewMode = overview;
        chart.setOption(buildChartOption(styledChartData(chartTarget), { center, zoom, overview }));
    }

    /** 把 center 的百分比或像素值统一转成画布像素。 */
    function centerToPixel(center, canvasW, canvasH) {
        const x = typeof center[0] === 'string'
            ? parseFloat(center[0]) / 100 * canvasW
            : center[0];
        const y = typeof center[1] === 'string'
            ? parseFloat(center[1]) / 100 * canvasH
            : center[1];
        return [x, y];
    }

    /**
     * 把指定人物节点平移到画布中心。
     * 不触发树的重新布局（只改 center，ECharts tree 的 roam 状态就存在 center 里）。
     *
     * 推导：
     *   Root 画布坐标 = center 像素值（ECharts tree 把根放在 center 位置）
     *   Node 画布坐标 = center + (node.layout - root.layout) * zoom
     *   目标：node 画布 = (w/2, h/2)
     *   所以：newCenter = (w/2, h/2) - (node.layout - root.layout) * zoom
     */
    /**
     * 自动把树的几何中心对齐画布水平中心。
     * ECharts orthogonal TB 布局按子树大小分配空间，左右通常不对称，
     * 直接用 centerX=50% 会让 root 在正中但整棵树偏左或偏右。
     *
     * 推导：
     *   所有节点 layout.x ∈ [Lmin, Lmax]
     *   treeLayoutCenter = (Lmin + Lmax) / 2
     *   rootCanvasX = centerX（center 就是 root 的画布位置）
     *   treeCanvasCenter = centerX + (treeLayoutCenter - rootLayoutX) * zoom
     *   令 treeCanvasCenter = w/2 → centerX = w/2 - (treeLayoutCenter - rootLayoutX) * zoom
     */
    /**
     * 自动把树的几何中心对齐画布水平中心。
     *
     * ECharts tree 的像素变换公式（从 View.ts 源码推导）：
     *   pixelX = (layoutX - centerOptionX) * zoom + (canvasW/2 - seriesLeft)
     *
     * 目标：让 tree 几何中心 layoutX=(Lmin+Lmax)/2 的 pixel 位置 = canvasW/2：
     *   (treeCenterLayout - centerOptionX) * zoom + (canvasW/2 - seriesLeft) = canvasW/2
     *   centerOptionX = treeCenterLayout - seriesLeft / zoom
     */
    function centerTreeHorizontally() {
        if (!chart) return;
        const opt = chart.getOption();
        const data = chart.getModel().getSeriesByIndex(0).getData();
        const w = chartEl.clientWidth;
        const zoom = opt.series[0].zoom;
        const seriesLeft = opt.series[0].left;

        const cur = opt.series[0].center;
        const curCX = typeof cur[0] === 'string' ? parseFloat(cur[0])/100*w : cur[0];
        const curCY = typeof cur[1] === 'string' ? parseFloat(cur[1])/100*chartEl.clientHeight : cur[1];

        // 找全局 X 范围（TB 树 layout.x 即为水平坐标）
        let Lmin = Infinity, Lmax = -Infinity;
        for (let i = 0; i < data.count(); i++) {
            const l = data.getItemLayout(i);
            if (!l) continue;
            if (l.x < Lmin) Lmin = l.x;
            if (l.x > Lmax) Lmax = l.x;
        }
        if (!isFinite(Lmin) || !isFinite(Lmax)) return;

        const treeCenterLayout = (Lmin + Lmax) / 2;
        const newCX = treeCenterLayout - seriesLeft / zoom;

        // 偏差 < 4px 不用折腾
        if (Math.abs(newCX - curCX) < 4) return;

        chart.setOption({ series: [{ center: [newCX, curCY] }] });
    }

    /**
     * 把指定人物节点平移到画布中心。
     *
     * ECharts tree 像素变换公式：
     *   pixelX = (layoutX - centerOptionX) * zoom + (canvasW/2 - seriesLeft)
     *   pixelY = (layoutY - centerOptionY) * zoom + (canvasH/2 - seriesTop)
     *
     * 目标：targetLayout 的 pixel = canvas center：
     *   centerOptionX = targetLayout.x - seriesLeft / zoom
     *   centerOptionY = targetLayout.y - seriesTop / zoom
     *
     * 适用于任意节点（包括根节点）。用户在 frontmatter 声明 centerPerson，
     * 就是希望那个人物出现在画布中心。
     */
    function centerChartPerson(person) {
        if (!chart || !person) return;

        const opt = chart.getOption();
        const data = chart.getModel().getSeriesByIndex(0).getData();
        const targetIdx = data.indexOfName(person);
        if (targetIdx < 0) return;
        const targetLayout = data.getItemLayout(targetIdx);
        if (!targetLayout) return;

        const seriesLeft = opt.series[0].left;
        const seriesTop = opt.series[0].top;
        const zoom = opt.series[0].zoom;

        // 用新公式直接算 centerOption
        const newCX = targetLayout.x - seriesLeft / zoom;
        const newCY = targetLayout.y - seriesTop / zoom;

        // 偏差 < 4px 不用折腾
        const curCenter = opt.series[0].center;
        const curCX = typeof curCenter[0] === 'string'
            ? parseFloat(curCenter[0])/100*chartEl.clientWidth : curCenter[0];
        const curCY = typeof curCenter[1] === 'string'
            ? parseFloat(curCenter[1])/100*chartEl.clientHeight : curCenter[1];
        if (Math.abs(newCX - curCX) < 4 && Math.abs(newCY - curCY) < 4) return;

        chart.setOption({ series: [{ center: [newCX, newCY] }] });
    }

    function updateChartFullscreen() {
        const active = document.fullscreenElement === chartShell || chartShell.classList.contains('is-expanded');
        const button = chartShell.querySelector('[data-tree-action="fullscreen"]');
        button.textContent = active ? '退出全屏' : '全屏';
        button.setAttribute('aria-pressed', String(active));
        requestAnimationFrame(resizeChart);
    }

    async function exitChartFullscreen() {
        try {
            if (document.fullscreenElement === chartShell) await document.exitFullscreen();
        } finally {
            chartShell.classList.remove('is-expanded');
            document.body.classList.remove('kh-fullscreen-fallback');
            updateChartFullscreen();
        }
    }

    async function toggleChartFullscreen() {
        if (document.fullscreenElement === chartShell || chartShell.classList.contains('is-expanded')) {
            await exitChartFullscreen();
            return;
        }
        // 先展开页面级全屏，原生 Fullscreen 被浏览器拦截或延迟时仍可使用。
        chartShell.classList.add('is-expanded');
        document.body.classList.add('kh-fullscreen-fallback');
        updateChartFullscreen();
        if (chartShell.requestFullscreen) {
            try {
                await chartShell.requestFullscreen();
                chartShell.classList.remove('is-expanded');
                document.body.classList.remove('kh-fullscreen-fallback');
            } catch {
                // 保留页面级全屏回退。
            }
        }
        updateChartFullscreen();
    }

    async function exportChart(button) {
        if (!chart) return;
        button.disabled = true;
        button.textContent = '导出中…';
        chartStatus.textContent = '正在生成完整世系树图片…';
        const width = Math.max(1800, chartMetrics.leaves * 240 + 160);
        const height = Math.max(1300, chartMetrics.levels * 120 + 200);
        const exportEl = document.createElement('div');
        exportEl.setAttribute('aria-hidden', 'true');
        exportEl.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;height:${height}px;pointer-events:none;`;
        document.body.appendChild(exportEl);
        let exportInstance = null;
        try {
            exportInstance = window.echarts.init(exportEl, null, { renderer: 'canvas' });
            exportInstance.setOption(buildChartOption(styledChartData(chartTarget), {
                forExport: true,
                center: ['50%', '50%'],
                zoom: 1
            }));
            const url = exportInstance.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: chartColors.bg });
            const link = document.createElement('a');
            link.href = url;
            link.download = `${dynastyTitle}-血缘世系.png`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            chartStatus.textContent = `已生成完整 PNG（${width * 2} × ${height * 2}）`;
        } catch {
            chartStatus.textContent = '图片导出失败，请重试。';
        } finally {
            exportInstance?.dispose();
            exportEl.remove();
            button.disabled = false;
            button.textContent = '导出 PNG';
        }
    }

    function setupChartControls() {
        if (controlsReady) return;
        controlsReady = true;
        chartShell.addEventListener('click', (event) => {
            const button = event.target.closest('[data-tree-action]');
            if (!button) return;
            const action = button.dataset.treeAction;
            if (action === 'fullscreen') {
                toggleChartFullscreen();
            } else if (action === 'export') {
                exportChart(button);
            } else if (action === 'reset') {
                initialZoom = calculateInitialZoom();
                applyChartView({ center: initialCenter, zoom: initialZoom, overview: false });
                chartStatus.textContent = '';
                requestAnimationFrame(() => centerTreeHorizontally());
            } else if (action === 'fit') {
                applyChartView({ center: ['50%', '50%'], zoom: calculateFitZoom(), overview: true });
                chartStatus.textContent = '已缩放到整棵世系；放大或拖动可查看细节。';
            } else if (action === 'zoom-in' || action === 'zoom-out') {
                const factor = action === 'zoom-in' ? 1.25 : 0.8;
                const zoom = Math.min(5, Math.max(0.12, currentChartZoom() * factor));
                applyChartView({ center: currentChartCenter(), zoom, overview: shouldHideLabels(zoom) });
            }
        });
        document.addEventListener('fullscreenchange', updateChartFullscreen);
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && chartShell.classList.contains('is-expanded')) exitChartFullscreen();
        });
        new ResizeObserver(resizeChart).observe(chartEl);
        new MutationObserver(() => {
            if (!chart) return;
            const current = chart.getOption().series[0];
            chartColors = readChartColors();
            chart.setOption(buildChartOption(styledChartData(chartTarget), {
                center: current.center,
                zoom: current.zoom,
                overview: overviewMode
            }));
        }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    }

    function ensureChart() {
        if (chart) return true;
        if (!chartShell || !chartEl || !window.echarts || kinshipPanel.hidden) return false;
        try {
            /* 先 unhide 再 init：hidden 状态下 clientWidth=0，ECharts 会按错误尺寸 layout */
            chartShell.hidden = false;
            chartNodeById = new Map();
            chartData = Array.from(kinshipPanel.querySelectorAll('.kh-roots > .kh-branch')).map((branch) => readChartNode(branch));
            chartMetrics = measureChartTree(chartData);
            chartColors = readChartColors();
            chart = window.echarts.init(chartEl, null, {
                renderer: 'canvas',
                devicePixelRatio: Math.max(window.devicePixelRatio || 1, 2)
            });
            initialZoom = userZoom ?? calculateInitialZoom();
            chart.setOption(buildChartOption(styledChartData(''), { center: initialCenter, zoom: initialZoom }));
            /* layout 完成后：先把整棵树的几何中心对齐画布中心，
             * 再对非根节点做 centerChartPerson（如果用户声明了）。
             * 根节点跳过 centerChartPerson，它已经被初始 center 放在顶部合适位置。 */
            requestAnimationFrame(() => {
                centerTreeHorizontally();
                if (initialCenterPerson && chartNodeById.has(initialCenterPerson)) {
                    centerChartPerson(initialCenterPerson);
                }
            });
            kinshipPanel.classList.add('is-chart-enhanced');
            setupChartControls();
            chart.on('click', (params) => {
                if (!params.data || !params.data.hasRuler) return;
                const person = params.data.person;
                if (document.fullscreenElement === chartShell || chartShell.classList.contains('is-expanded')) {
                    exitChartFullscreen().then(() => showView('timeline', { person, historyMode: 'push' }));
                } else {
                    showView('timeline', { person, historyMode: 'push' });
                }
            });
            // 滚轮/拖动缩放后按当前比例决定是否显示标签，避免缩小后文字互相重叠。
            chart.on('treeRoam', () => {
                clearTimeout(roamLabelTimer);
                roamLabelTimer = setTimeout(() => {
                    if (!chart) return;
                    const zoom = currentChartZoom();
                    if (shouldHideLabels(zoom) === overviewMode) return;
                    applyChartView({ center: currentChartCenter(), zoom, overview: shouldHideLabels(zoom) });
                }, 160);
            });
            return true;
        } catch {
            chart?.dispose();
            chart = null;
            chartShell.hidden = true;
            kinshipPanel.classList.remove('is-chart-enhanced');
            return false;
        }
    }

    root.classList.add('is-enhanced');

    function clearHighlights() {
        root.querySelectorAll('.is-target, .is-lineage').forEach((node) => {
            node.classList.remove('is-target', 'is-lineage');
        });
    }

    function highlightKinship(target) {
        const visited = new Set();
        let current = target;
        while (current && !visited.has(current.dataset.treePerson)) {
            const id = current.dataset.treePerson;
            visited.add(id);
            current.classList.add('is-lineage');
            const parentId = (current.dataset.parents || '').split(/\s+/).find(Boolean);
            current = parentId ? root.querySelector(`[data-tree-person="${parentId}"]`) : null;
        }
    }

    function personTarget(view, person) {
        if (!person) return null;
        return view === 'timeline'
            ? root.querySelector(`[data-reign-person="${person}"]`)
            : root.querySelector(`[data-tree-person="${person}"]`);
    }

    function writeHash(hash, mode) {
        if (!mode || window.location.hash === hash) return;
        if (mode === 'replace') history.replaceState(null, '', hash);
        else history.pushState(null, '', hash);
    }

    function showView(view, options = {}) {
        if (!panels.has(view)) return;
        const {
            person = '',
            historyMode = null,
            scroll = true,
            focus = Boolean(person)
        } = options;
        const target = personTarget(view, person);
        if (person && !target) return;

        activeView = view;
        /* 平铺模式：两个 panel 都显示，不再 hidden 切换 */
        ensureChart();
        /* 按钮已移除，跳过 active 状态切换 */

        clearHighlights();
        if (target) {
            target.classList.add('is-target');
            if (view === 'kinship') highlightKinship(target);
        }
        if (view === 'kinship' && chart) {
            chartTarget = person;
            chart.setOption({ series: [{ data: styledChartData(person) }] });
        }

        const hash = person
            ? `#${view === 'timeline' ? 'timeline' : 'tree'}-${person}`
            : `#${view === 'timeline' ? 'reign-timeline' : 'reign-kinship'}`;
        writeHash(hash, historyMode);

        if (!scroll) return;
        requestAnimationFrame(() => {
            const usingChart = view === 'kinship' && chart;
            if (usingChart && person) centerChartPerson(person);
            const destination = usingChart && person ? chartShell : (target || panels.get(view));
            destination.scrollIntoView({
                behavior: reduceMotion() ? 'auto' : 'smooth',
                block: 'start',
                inline: 'nearest'
            });
            if (focus && target) (usingChart ? chartEl : target).focus({ preventScroll: true });
        });
    }

    /* 按钮已移除，不再需要点击监听。双向定位通过 data-reign-link 跳转实现 */

    root.addEventListener('click', (event) => {
        const link = event.target.closest('[data-reign-link]');
        if (!link || !root.contains(link)) return;
        const view = link.dataset.reignLink;
        const person = link.dataset.person;
        if (!personTarget(view, person)) return;
        event.preventDefault();
        showView(view, { person, historyMode: 'push' });
    });

    function syncFromHash(scroll = true) {
        const hash = window.location.hash;
        let match = hash.match(/^#(timeline|tree)-(.+)$/);
        if (match) {
            const view = match[1] === 'timeline' ? 'timeline' : 'kinship';
            const person = decodeURIComponent(match[2]);
            if (personTarget(view, person)) {
                showView(view, { person, scroll });
                return;
            }
        }

        match = hash.match(/^#reign-(timeline|kinship)$/);
        if (match) {
            showView(match[1], { scroll });
            return;
        }
        showView('timeline', { scroll: false });
    }

    window.addEventListener('hashchange', () => syncFromHash(true));
    syncFromHash(true);
})();

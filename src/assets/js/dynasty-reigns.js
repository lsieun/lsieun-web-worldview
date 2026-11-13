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
    const buttons = Array.from(root.querySelectorAll('[data-reign-switch]'));
    if (!panels.has('kinship') || !panels.has('timeline') || !buttons.length) return;

    const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dynastyTitle = document.querySelector('h1')?.textContent?.trim() || '历代皇帝';
    let activeView = 'timeline';

    const kinshipPanel = panels.get('kinship');
    const chartShell = kinshipPanel.querySelector('[data-tree-chart-shell]');
    const chartEl = kinshipPanel.querySelector('[data-tree-chart]');
    const chartStatus = kinshipPanel.querySelector('[data-tree-status]');
    const initialCenter = ['50%', '15%'];
    let chart = null;
    let chartData = [];
    let chartTarget = '';
    let chartColors = null;
    let chartMetrics = { leaves: 1, levels: 1 };
    let initialZoom = 1.2;
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

    function styledChartData(person, zoom = 1) {
        const lineage = person ? lineageFor(person) : new Set();
        /* symbolSize 随 zoom 微调 */
        const scale = Math.max(0.55, Math.min(1.15, zoom));
        function styleNode(node) {
            const isTarget = node.person === person;
            const inLineage = lineage.has(node.person);
            const baseSize = node.hasRuler ? [156, 38] : [132, 32];
            return {
                ...node,
                symbolSize: [baseSize[0] * scale, baseSize[1] * scale],
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
                children: node.children.map((child) => styleNode(child))
            };
        }
        return chartData.map(styleNode);
    }

    function chartLabel(params) {
        const data = params.data;
        if (!data.hasRuler) {
            /* 宗亲节点：1 行 */
            return `{kin|宗}{title|${data.title}}`;
        }
        /* 皇帝节点：1 行（帝序圆 + 谥号 + 真名）。
           全部压到单行，symbolSize 配扁框，这样树形整体紧凑、一屏可装下整棵树。
           完整信息（在位年段、生卒年）都在 tooltip 里 */
        return `{order|${data.order || '◇'}}{title|${data.title}}{name|${data.detail}}`;
    }

    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, (character) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[character]);
    }

    function chartTooltip(params) {
        const data = params.data;
        const identity = data.hasRuler
            ? `${data.order ? `第 ${data.order} 位皇帝` : '过渡人物 · 未正式即位'} · ${data.detail}`
            : (data.detail || '宗室支系');
        const action = data.hasRuler
            ? '点击查看在位大事 →'
            : (data.href ? '点击查看帝系年表 →' : '');
        return `<div style="max-width:260px"><strong>${escapeHtml(data.title)}</strong>`
            + `<div style="margin-top:4px">${escapeHtml(identity)}</div>`
            + `<div style="margin-top:4px;color:${chartColors.muted}">${escapeHtml(data.reign)}</div>`
            + (action ? `<div style="margin-top:6px;color:${chartColors.brass}">${action}</div>` : '')
            + '</div>';
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
                backgroundColor: chartColors.surfaceRaised,
                borderColor: chartColors.lineStrong,
                textStyle: { color: chartColors.ink, fontFamily: chartColors.fontBody, fontSize: 12 },
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
                /* 间距稍留空间，既不挤也不松 */
                nodeGap: 36,
                levelGap: 64,
                lineStyle: { color: chartColors.lineStrong, width: 1 },
                label: {
                    show: !settings.overview,
                    position: 'inside',
                    formatter: chartLabel,
                    /* 单行，字号稍放大保证可辨识度 */
                    rich: {
                        order: {
                            color: chartColors.surfaceRaised,
                            backgroundColor: chartColors.brass,
                            borderRadius: 9,
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
                            padding: [0, 0, 0, 5]
                        }
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
        /* 默认适中阅读比例，不强制 fit 一屏（会挤成一团）。
           用户点"全图"按钮才缩到一屏 */
        return Math.max(1.15, Math.min(1.4, (chartMetrics.levels * 72) / Math.max(chartEl.clientHeight, 1)));
    }

    /* 全图：按叶子数与层数估算内容尺寸，缩到一屏；此时节点随缩放等比变小 */
    function calculateFitZoom() {
        const contentWidth = chartMetrics.leaves * 180;
        const contentHeight = chartMetrics.levels * 72;
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
        /* zoom 同时传给 styledChartData 让节点 symbolSize 随缩放动态调整，避免缩小时重叠 */
        chart.setOption(buildChartOption(styledChartData(chartTarget, zoom), { center, zoom, overview }));
    }

    function centerChartPerson(person) {
        if (!chart || !person) return;
        const data = chart.getModel().getSeriesByIndex(0).getData();
        const dataIndex = data.indexOfName(person);
        if (dataIndex < 0) return;
        const layout = data.getItemLayout(dataIndex);
        if (!layout) return;
        chart.setOption({ series: [{
            center: [layout.x, layout.y],
            zoom: Math.max(currentChartZoom(), initialZoom)
        }] });
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
            chartNodeById = new Map();
            chartData = Array.from(kinshipPanel.querySelectorAll('.kh-roots > .kh-branch')).map((branch) => readChartNode(branch));
            chartMetrics = measureChartTree(chartData);
            chartColors = readChartColors();
            chart = window.echarts.init(chartEl, null, {
                renderer: 'canvas',
                devicePixelRatio: Math.max(window.devicePixelRatio || 1, 2)
            });
            initialZoom = calculateInitialZoom();
            chart.setOption(buildChartOption(styledChartData('', initialZoom), { center: initialCenter, zoom: initialZoom }));
            /* ECharts tree 的 center 控制整个几何中心而非根节点位置，
               树左右不对称时根节点会偏移。渲染后手动定位根节点到画布顶部居中 */
            chart.once('rendered', () => {
                const data = chart.getModel().getSeriesByIndex(0).getData();
                const rootLayout = data.getItemLayout(0);
                if (rootLayout) {
                    const rootCenter = ['50%', '12%'];
                    chart.setOption({ series: [{ center: rootCenter }] });
                    initialCenter = rootCenter;
                }
            });
            chartShell.hidden = false;
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
        for (const [key, panel] of panels) panel.hidden = key !== view;
        if (view === 'kinship') ensureChart();
        buttons.forEach((button) => {
            const on = button.dataset.reignSwitch === view;
            button.classList.toggle('is-active', on);
            button.setAttribute('aria-pressed', String(on));
        });

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

    buttons.forEach((button) => {
        button.addEventListener('click', () => {
            const view = button.dataset.reignSwitch;
            if (view === activeView && !root.querySelector('.is-target')) return;
            showView(view, { historyMode: 'push' });
        });
    });

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

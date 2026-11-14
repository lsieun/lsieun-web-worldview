/**
 * confucius-journey.js — 孔子游历列国 · 专题脚本
 *
 * 依赖：
 *   qmap-core.js  — 通用 Q 版地图渲染器（Layer 0/1/2）
 *   china-map.js  — ECharts 地理图（Layer 0'：现代省级底图，作为备选模式）
 *
 * 两种模式：
 *   qsvg   — Q 版 SVG（默认，用 QMap.mount）
 *   echarts — ECharts 地理图（用 chinaMap.mount）
 *   偏好存 localStorage['pj-map-mode']
 */
(function () {
    'use strict';

    const dataEl = document.getElementById('pj-data');
    const mapContainer = document.getElementById('pj-map');
    const timeline = document.getElementById('pj-timeline');
    const detailPanel = document.getElementById('pj-detail-panel');
    const modeToggle = document.getElementById('pj-mode-toggle');

    if (!dataEl || !mapContainer || !timeline || !detailPanel) return;

    let raw;
    try { raw = JSON.parse(dataEl.textContent); } catch (e) { console.warn('[pj] data parse fail', e); return; }

    const { meta, states, journey, links } = raw;
    const allIds = journey.map((p) => p.id);
    let currentIdx = 0;

    let mode = (localStorage.getItem('pj-map-mode') || 'qsvg');
    let mapAPI = null; // 统一接口 { flyTo(idx), updateOverlay(idx) }

    /* ============================================================
     * 初始化
     * ============================================================ */
    function init() {
        if (mode === 'qsvg') initQSVG();
        else initECharts();
    }

    /* ---------- Q-SVG 模式 ---------- */
    function initQSVG() {
        const baseEl = document.getElementById('pj-qsvg-base');
        const featuresEl = document.getElementById('pj-qsvg-features');
        const periodEl = document.getElementById('pj-qsvg-period');
        if (!baseEl || !featuresEl || !periodEl) { initECharts(); return; }

        let base, features, period;
        try {
            base = JSON.parse(baseEl.textContent);
            features = JSON.parse(featuresEl.textContent);
            period = JSON.parse(periodEl.textContent);
        } catch (e) { initECharts(); return; }

        if (!window.QMap) { setTimeout(initQSVG, 100); return; }

        const qmap = window.QMap.mount(mapContainer, { base, features, period });
        if (!qmap) { initECharts(); return; }

        // 从 period.capitalMarkers 查 SVG 坐标 → 应用到 journey
        const capMap = {};
        (period.capitalMarkers || []).forEach((c) => { capMap[c.name] = c.svg; });

        const journeyWithSvg = journey.map((p) => {
            // 先精确匹配
            let svg = capMap[p.name];
            // 不行就模糊匹配（如 qufu-return → qufu）
            if (!svg) {
                const baseName = p.name.replace(/[^一-龥]/g, '');
                if (capMap[baseName]) svg = capMap[baseName];
            }
            return svg ? { ...p, x: svg[0], y: svg[1] } : p;
        });

        // 曲阜 return 复用曲阜坐标
        const qufu = journeyWithSvg.find((p) => p.id === 'qufu');
        const qufuR = journeyWithSvg.find((p) => p.id === 'qufu-return');
        if (qufu && qufuR) { qufuR.x = qufu.x; qufuR.y = qufu.y; }

        mapAPI = {
            type: 'qsvg',
            goTo(idx) { qmap.goToCity(allIds[idx], 2, 600); },
            updateOverlay(idx) {
                const doneIds = allIds.slice(0, idx + 1);
                const activeId = allIds[idx];

                // doneCoords = 前 idx+1 个点
                const doneCities = journeyWithSvg.slice(0, idx + 1);
                const pendingCities = journeyWithSvg.slice(idx);

                qmap.overlay({
                    cities: journeyWithSvg,
                    doneIds,
                    activeId,
                    trackDone: doneCities,
                    trackPending: pendingCities
                });
            }
        };

        // 城市点击联动
        window.addEventListener('qmap-city-click', (e) => {
            if (e.detail && typeof e.detail.index === 'number') goTo(e.detail.index);
        });

        goTo(0);
    }

    /* ---------- ECharts 模式 ---------- */
    function initECharts() {
        if (!window.chinaMap) { setTimeout(initECharts, 100); return; }

        const markers = journey.map((p, i) => ({
            id: p.id, name: p.name, coords: [p.lon, p.lat], order: i + 1, active: i === 0
        }));
        const stateLabels = states.map((s) => ({
            text: s.name, coords: [s.lon, s.lat], color: '#b85c2f', fontSize: 14
        }));
        const allCoords = journey.map((p) => [p.lon, p.lat]);

        const scheme = {
            center: meta.center, zoom: meta.zoom,
            markers, tracks: {
                done: { coords: [], width: 3 },
                pending: { coords: allCoords, width: 2 }
            },
            labels: stateLabels
        };

        const schemeEl = document.createElement('script');
        schemeEl.type = 'application/json';
        schemeEl.id = 'pj-map-data';
        schemeEl.textContent = JSON.stringify(scheme);
        mapContainer.parentElement.insertBefore(schemeEl, mapContainer.nextSibling);

        window.chinaMap.mount('pj-map');

        setTimeout(() => {
            const cm = mapContainer._cm;
            if (!cm) { setTimeout(arguments.callee, 100); return; }

            mapAPI = {
                type: 'echarts',
                goTo(idx) {
                    const point = journey[idx];
                    cm.api.flyTo([point.lon, point.lat], 6.2);
                },
                updateOverlay(idx) {
                    const doneIds = allIds.slice(0, idx + 1);
                    cm.api.updateJourney(doneIds, allIds, links);
                }
            };
            goTo(0);
        }, 800);
    }

    /* ============================================================
     * 统一 goTo
     * ============================================================ */
    function goTo(idx) {
        idx = Math.max(0, Math.min(idx, journey.length - 1));
        currentIdx = idx;
        const point = journey[idx];

        if (mapAPI) {
            try { mapAPI.updateOverlay(idx); } catch (e) {}
            try { mapAPI.goTo(idx); } catch (e) {}
        }

        // 时间轴
        timeline.querySelectorAll('.pj-tl-node').forEach((node, i) => {
            node.classList.toggle('is-active', i === idx);
            node.classList.toggle('is-done', i < idx);
        });

        // 详情面板
        const yearEl = detailPanel.querySelector('.pj-detail-year');
        const stateEl = detailPanel.querySelector('.pj-detail-state');
        const titleEl = detailPanel.querySelector('.pj-detail-title');
        const labelEl = detailPanel.querySelector('.pj-detail-label');
        const reasonEl = detailPanel.querySelector('.pj-detail-reason');
        const storyEl = detailPanel.querySelector('.pj-detail-story');
        if (yearEl) yearEl.textContent = cnYear(point.year);
        if (stateEl) stateEl.textContent = point.state;
        if (titleEl) titleEl.textContent = point.name;
        if (labelEl) labelEl.textContent = point.label;
        if (reasonEl) reasonEl.textContent = point.reason;
        if (storyEl) storyEl.textContent = point.story;

        // 时间轴居中滚动
        const node = timeline.children[idx];
        if (node) {
            const tlRect = timeline.getBoundingClientRect();
            const nodeRect = node.getBoundingClientRect();
            const offset = (nodeRect.left - tlRect.left) - tlRect.width / 2 + nodeRect.width / 2;
            timeline.scrollBy({ left: offset, behavior: 'smooth' });
        }
    }

    function cnYear(y) { return y < 0 ? `前 ${Math.abs(y)}` : `${y}`; }

    /* ============================================================
     * 事件绑定
     * ============================================================ */
    timeline.addEventListener('click', (e) => {
        const node = e.target.closest('.pj-tl-node');
        if (!node) return;
        goTo(Array.from(timeline.children).indexOf(node));
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft')  goTo(currentIdx - 1);
        if (e.key === 'ArrowRight') goTo(currentIdx + 1);
    });

    if (modeToggle) {
        modeToggle.textContent = mode === 'qsvg' ? '🗺 Q版' : '🌍 地理';
        modeToggle.addEventListener('click', () => {
            localStorage.setItem('pj-map-mode', mode === 'qsvg' ? 'echarts' : 'qsvg');
            location.reload();
        });
    }

    /* ============================================================
     * 启动
     * ============================================================ */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.pjJourney = { goTo, journey, meta };
})();

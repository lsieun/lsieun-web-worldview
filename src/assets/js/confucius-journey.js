/**
 * confucius-journey.js — 孔子游历列国页面（支持 ECharts 地理图 和 Q-SVG 两种模式）
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

    /* ============================================================
     * 地图模式：'echarts' | 'qsvg'
     * ============================================================ */
    const mode = (localStorage.getItem('pj-map-mode') || 'qsvg');
    let mapAPI = null; // 统一接口 { flyTo, updateJourney }

    function initMap() {
        if (mode === 'qsvg') {
            initQSVG();
        } else {
            initECharts();
        }
    }

    /* ---------- Q-SVG 模式 ---------- */
    function initQSVG() {
        // 读 SVG 底图数据（来自 confuciusMap.json，注入到 HTML）
        const mapDataEl = document.getElementById('pj-qsvg-data');
        if (!mapDataEl) { initECharts(); return; } // fallback

        let mapData;
        try { mapData = JSON.parse(mapDataEl.textContent); } catch (e) { initECharts(); return; }

        // 用 confuciusSvg.render 渲染
        if (!window.confuciusSvg) {
            setTimeout(initQSVG, 100);
            return;
        }

        // 把 journey 的 SVG 坐标注入 mapData.cities
        // city name → journey 匹配
        const cityMap = {};
        mapData.cities.forEach((c) => { cityMap[c.name] = c; });

        const journeyWithCoords = journey.map((p) => {
            const match = cityMap[p.name] || cityMap[p.name + '(return)'];
            // 如果没有精确匹配，用 lon/lat 大致估算坐标
            if (match) return { ...p, x: match.x, y: match.y };
            return p;
        });

        // 把 qufu-return 的坐标设为 qufu 的
        const qufu = journeyWithCoords.find((p) => p.id === 'qufu');
        const qufuReturn = journeyWithCoords.find((p) => p.id === 'qufu-return');
        if (qufu && qufuReturn) { qufuReturn.x = qufu.x; qufuReturn.y = qufu.y; }

        const api = window.confuciusSvg.render(mapContainer, mapData);

        mapAPI = {
            type: 'qsvg',
            flyTo(idx) {
                const point = journeyWithCoords[idx];
                if (point && api.svg._flyTo) {
                    api.svg._flyTo(point.x, point.y, 2, 600);
                }
            },
            updateJourney(idx) {
                const doneIds = allIds.slice(0, idx + 1);
                const activeId = allIds[idx];
                window.confuciusSvg.updateJourney(api.svg, journeyWithCoords, doneIds, activeId, links);
            }
        };

        // 城市点击联动
        window.addEventListener('pj-city-click', (e) => {
            if (e.detail && typeof e.detail.index === 'number') {
                goTo(e.detail.index);
            }
        });
    }

    /* ---------- ECharts 模式 ---------- */
    function initECharts() {
        const scheme = buildEChartsScheme();
        const schemeEl = document.createElement('script');
        schemeEl.type = 'application/json';
        schemeEl.id = 'pj-map-data';
        schemeEl.textContent = JSON.stringify(scheme);
        mapContainer.parentElement.insertBefore(schemeEl, mapContainer.nextSibling);

        if (!window.chinaMap) {
            setTimeout(initECharts, 100);
            return;
        }
        window.chinaMap.mount('pj-map');

        setTimeout(() => {
            const cm = mapContainer._cm;
            if (cm) {
                mapAPI = {
                    type: 'echarts',
                    flyTo(idx) {
                        const point = journey[idx];
                        cm.api.flyTo([point.lon, point.lat], 6.2);
                    },
                    updateJourney(idx) {
                        const doneIds = allIds.slice(0, idx + 1);
                        cm.api.updateJourney(doneIds, allIds, links);
                    }
                };
                goTo(0);
            } else {
                setTimeout(arguments.callee, 100);
            }
        }, 800);
    }

    function buildEChartsScheme() {
        const markers = journey.map((p, i) => ({
            id: p.id, name: p.name, coords: [p.lon, p.lat], order: i + 1, active: i === 0
        }));
        const stateLabels = states.map((s) => ({
            text: s.name, coords: [s.lon, s.lat], color: '#b85c2f', fontSize: 14
        }));
        const allCoords = journey.map((p) => [p.lon, p.lat]);
        return {
            center: meta.center, zoom: meta.zoom,
            markers, tracks: {
                done: { coords: [], width: 3 },
                pending: { coords: allCoords, width: 2 }
            },
            labels: stateLabels
        };
    }

    /* ============================================================
     * 统一的 goTo（联动入口）
     * ============================================================ */
    function goTo(idx) {
        idx = Math.max(0, Math.min(idx, journey.length - 1));
        currentIdx = idx;
        const point = journey[idx];

        if (mapAPI) {
            try { mapAPI.updateJourney(idx); } catch (e) {}
            try { mapAPI.flyTo(idx); } catch (e) {}
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

        // 时间轴滚动
        const node = timeline.children[idx];
        if (node) {
            const tlRect = timeline.getBoundingClientRect();
            const nodeRect = node.getBoundingClientRect();
            const offset = (nodeRect.left - tlRect.left) - tlRect.width / 2 + nodeRect.width / 2;
            timeline.scrollBy({ left: offset, behavior: 'smooth' });
        }
    }

    function cnYear(y) {
        if (y == null) return '';
        return y < 0 ? `前 ${Math.abs(y)}` : `${y}`;
    }

    /* ============================================================
     * 事件绑定
     * ============================================================ */
    timeline.addEventListener('click', (e) => {
        const node = e.target.closest('.pj-tl-node');
        if (!node) return;
        const idx = Array.from(timeline.children).indexOf(node);
        if (idx >= 0) goTo(idx);
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft')  goTo(currentIdx - 1);
        if (e.key === 'ArrowRight') goTo(currentIdx + 1);
    });

    // 模式切换
    if (modeToggle) {
        const updateLabel = () => {
            modeToggle.textContent = mode === 'qsvg' ? '🗺 Q版' : '🌍 地理';
        };
        updateLabel();
        modeToggle.addEventListener('click', () => {
            const next = mode === 'qsvg' ? 'echarts' : 'qsvg';
            localStorage.setItem('pj-map-mode', next);
            location.reload();
        });
    }

    /* ============================================================
     * 启动
     * ============================================================ */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMap);
    } else {
        initMap();
    }

    window.pjJourney = { goTo, journey, meta };
})();

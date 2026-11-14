/**
 * confucius-journey.js — 孔子游历列国页面
 *
 * 职责：
 *   1. 从 #pj-data 读取原始数据
 *   2. 构建 china-map.js 需要的 scheme
 *   3. 手动 mount 地图（因为容器没有 data-china-map 属性）
 *   4. 时间轴 ↔ 地图 ↔ 详情面板 三方联动
 */
(function () {
    'use strict';

    const dataEl = document.getElementById('pj-data');
    const mapContainer = document.getElementById('pj-map');
    const timeline = document.getElementById('pj-timeline');
    const detailPanel = document.getElementById('pj-detail-panel');

    if (!dataEl || !mapContainer || !timeline || !detailPanel) return;

    let raw;
    try { raw = JSON.parse(dataEl.textContent); } catch (e) { console.warn('[pj] data parse fail', e); return; }

    const { meta, states, journey, links } = raw;
    const allIds = journey.map((p) => p.id);

    /* ------------------------------------------------------------------
     * 1. 构建 china-map scheme
     * ------------------------------------------------------------------ */
    function buildScheme() {
        // markers：从 journey 生成
        const markers = journey.map((p, i) => ({
            id: p.id,
            name: p.name,
            coords: [p.lon, p.lat],
            order: i + 1,
            active: i === 0
        }));

        // stateLabels：诸侯国名（用 scatter + label 显示）
        const stateLabels = states.map((s) => ({
            text: s.name,
            coords: [s.lon, s.lat],
            color: '#b85c2f',
            fontSize: 15
        }));

        // 全部路径坐标
        const allCoords = journey.map((p) => [p.lon, p.lat]);

        return {
            center: meta.center,
            zoom: meta.zoom,
            markers,
            tracks: {
                done: { coords: [], width: 3 },
                pending: { coords: allCoords, width: 2 }
            },
            labels: stateLabels
        };
    }

    /* ------------------------------------------------------------------
     * 2. 初始化地图
     * ------------------------------------------------------------------ */
    function waitForEcharts() {
        if (window.echarts && window.chinaMap) {
            // 把 scheme 写到 data 属性（china-map.js mount 时会读这个）
            const scheme = buildScheme();
            const schemeEl = document.createElement('script');
            schemeEl.type = 'application/json';
            schemeEl.id = 'pj-map-data';
            schemeEl.textContent = JSON.stringify(scheme);
            mapContainer.parentElement.insertBefore(schemeEl, mapContainer.nextSibling);

            // 手动 mount（china-map.js 的 autoMount 不处理没有 data-china-map 的容器）
            window.chinaMap.mount('pj-map');

            // 等 mount 完成后设置初始状态
            setTimeout(() => {
                goTo(0);
            }, 600);
        } else {
            setTimeout(waitForEcharts, 80);
        }
    }

    /* ------------------------------------------------------------------
     * 3. 联动逻辑
     * ------------------------------------------------------------------ */
    let currentIdx = 0;

    function goTo(idx) {
        idx = Math.max(0, Math.min(idx, journey.length - 1));
        currentIdx = idx;
        const point = journey[idx];

        // 更新地图
        const cm = mapContainer._cm;
        if (cm) {
            const doneIds = allIds.slice(0, idx + 1);
            cm.api.updateJourney(doneIds, allIds, links);
            cm.api.flyTo([point.lon, point.lat], 6.2);
        }

        // 更新时间轴节点样式
        timeline.querySelectorAll('.pj-tl-node').forEach((node, i) => {
            node.classList.toggle('is-active', i === idx);
            node.classList.toggle('is-done', i < idx);
        });

        // 更新详情面板
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

        // 滚动时间轴使当前节点居中可见
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

    /* ------------------------------------------------------------------
     * 4. 事件绑定
     * ------------------------------------------------------------------ */
    timeline.addEventListener('click', (e) => {
        const node = e.target.closest('.pj-tl-node');
        if (!node) return;
        const idx = Array.from(timeline.children).indexOf(node);
        if (idx >= 0) goTo(idx);
    });

    // 键盘左右切换
    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft')  goTo(currentIdx - 1);
        if (e.key === 'ArrowRight') goTo(currentIdx + 1);
    });

    /* ------------------------------------------------------------------
     * 启动
     * ------------------------------------------------------------------ */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', waitForEcharts);
    } else {
        waitForEcharts();
    }

    window.pjJourney = { goTo, journey, meta };
})();

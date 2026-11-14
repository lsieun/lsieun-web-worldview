/**
 * confucius-svg.js — Q 版 SVG 地图渲染器
 * 负责：底图渲染、诸侯国色块、黄河长江、都城、轨迹线、缩放/飞行
 */
(function () {
    'use strict';

    const SVG_NS = 'http://www.w3.org/2000/svg';

    /* ============================================================
     * 渲染主入口
     * ============================================================ */
    function render(mapEl, mapData) {
        const { viewBox, base, regions, mountains, cities } = mapData;

        // 清空容器
        mapEl.innerHTML = '';

        // SVG 根元素
        const svg = create('svg', {
            viewBox,
            class: 'pj-qmap-svg',
            preserveAspectRatio: 'xMidYMid meet'
        });
        svg.style.width = '100%';
        svg.style.height = '100%';
        svg.style.cursor = 'grab';
        svg.dataset.viewBox = viewBox;
        mapEl.appendChild(svg);

        // defs（滤镜、渐变）
        const defs = create('defs', {});
        defs.innerHTML = `
            <filter id="pj-qmap-shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="1" dy="2" stdDeviation="2" flood-opacity="0.25" flood-color="#000"/>
            </filter>
            <filter id="pj-qmap-rough" x="-5%" y="-5%" width="110%" height="110%">
                <feTurbulence type="turbulence" baseFrequency="0.03" numOctaves="2" seed="42"/>
                <feDisplacementMap in="SourceGraphic" scale="3"/>
            </filter>
            <linearGradient id="pj-qmap-paper" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#f5efdf"/>
                <stop offset="50%" stop-color="#f2ead3"/>
                <stop offset="100%" stop-color="#ece3c9"/>
            </linearGradient>
            <linearGradient id="pj-qmap-yellow-river" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stop-color="#e6b53a"/>
                <stop offset="50%" stop-color="#d4982a"/>
                <stop offset="100%" stop-color="#e6b53a"/>
            </linearGradient>
            <linearGradient id="pj-qmap-yangtze" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stop-color="#6a8ca8"/>
                <stop offset="50%" stop-color="#4e6d8a"/>
                <stop offset="100%" stop-color="#6a8ca8"/>
            </linearGradient>
        `;
        svg.appendChild(defs);

        // 1. 纸张背景
        const paper = create('rect', {
            x: 0, y: 0, width: 800, height: 600,
            fill: 'url(#pj-qmap-paper)'
        });
        svg.appendChild(paper);

        // 2. 中原轮廓底色（浅墨绿）
        const outline = create('path', {
            d: base.outline,
            fill: '#d9cba0',
            opacity: 0.35,
            stroke: '#7a6c4a',
            'stroke-width': 2.5,
            'stroke-linejoin': 'round',
            filter: 'url(#pj-qmap-shadow)'
        });
        svg.appendChild(outline);

        // 3. 诸侯国色块（先画大块）
        const regionGroup = create('g', { class: 'pj-qmap-regions' });
        regions.forEach((r) => {
            const node = r.shape === 'poly'
                ? create('polygon', {
                    points: r.points,
                    fill: r.fill,
                    opacity: r.opacity,
                    stroke: r.fill,
                    'stroke-width': 1,
                    'stroke-opacity': 0.5
                  })
                : create('rect', {
                    x: r.x, y: r.y, width: r.w, height: r.h,
                    rx: 8, ry: 8,
                    fill: r.fill,
                    opacity: r.opacity,
                    stroke: r.fill,
                    'stroke-width': 1,
                    'stroke-opacity': 0.5
                  });
            node.dataset.regionId = r.id;
            regionGroup.appendChild(node);

            // 国名标签
            if (r.labelOffset) {
                const label = create('text', {
                    x: r.labelOffset[0],
                    y: r.labelOffset[1],
                    class: 'pj-qmap-region-label',
                    'text-anchor': 'middle',
                    'dominant-baseline': 'middle',
                    fill: '#3a2d1a',
                    'font-size': 16,
                    'font-weight': 700,
                    'font-family': 'var(--font-serif)',
                    'pointer-events': 'none'
                });
                label.textContent = r.name;
                regionGroup.appendChild(label);
            }
        });
        svg.appendChild(regionGroup);

        // 4. 河流（黄河 + 长江）
        const riverGroup = create('g', { class: 'pj-qmap-rivers' });
        const yellowRiver = create('path', {
            d: base.yellowRiver,
            fill: 'none',
            stroke: 'url(#pj-qmap-yellow-river)',
            'stroke-width': 10,
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
            opacity: 0.85
        });
        riverGroup.appendChild(yellowRiver);
        const yellowRiverLabel = create('text', {
            x: 300, y: 228,
            'text-anchor': 'middle',
            'dominant-baseline': 'middle',
            fill: '#8a6218',
            'font-size': 12,
            'font-family': 'var(--font-serif)',
            'font-weight': 600,
            'letter-spacing': '4px'
        });
        yellowRiverLabel.textContent = '黄 河';
        riverGroup.appendChild(yellowRiverLabel);

        const yangtze = create('path', {
            d: base.yangtze,
            fill: 'none',
            stroke: 'url(#pj-qmap-yangtze)',
            'stroke-width': 8,
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
            opacity: 0.8
        });
        riverGroup.appendChild(yangtze);
        const yangtzeLabel = create('text', {
            x: 320, y: 385,
            'text-anchor': 'middle',
            'dominant-baseline': 'middle',
            fill: '#2d4a5e',
            'font-size': 12,
            'font-family': 'var(--font-serif)',
            'font-weight': 600,
            'letter-spacing': '4px'
        });
        yangtzeLabel.textContent = '长 江';
        riverGroup.appendChild(yangtzeLabel);
        svg.appendChild(riverGroup);

        // 5. 山脉标签
        const mtnGroup = create('g', { class: 'pj-qmap-mountains' });
        mountains.forEach((m) => {
            const txt = create('text', {
                x: m.x, y: m.y,
                'text-anchor': 'middle',
                'dominant-baseline': 'middle',
                fill: '#5a4a2e',
                'font-size': m.fontSize || 14,
                'font-family': 'var(--font-serif)',
                'letter-spacing': '2px',
                opacity: 0.55,
                transform: m.rotate ? `rotate(${m.rotate}, ${m.x}, ${m.y})` : null
            });
            txt.textContent = m.text;
            mtnGroup.appendChild(txt);
        });
        svg.appendChild(mtnGroup);

        // 6. 轨迹线组（done + pending）
        const trackGroup = create('g', { class: 'pj-qmap-tracks' });
        trackGroup.innerHTML = `
            <path class="pj-qmap-track-pending" fill="none" stroke="#999" stroke-width="3"
                  stroke-dasharray="8,6" stroke-linecap="round" stroke-linejoin="round" opacity="0.6"/>
            <path class="pj-qmap-track-done" fill="none" stroke="#bf4d28" stroke-width="4"
                  stroke-linecap="round" stroke-linejoin="round"/>
        `;
        svg.appendChild(trackGroup);

        // 7. 都城标记点（先不画，由 updateJourney 负责）
        const cityGroup = create('g', { class: 'pj-qmap-cities' });
        svg.appendChild(cityGroup);

        // 8. 工具栏
        injectToolbar(mapEl, svg);

        return { svg, cityGroup, trackGroup, viewBox: { w: 800, h: 600 } };
    }

    /* ============================================================
     * 都城渲染 & 轨迹更新
     * ============================================================ */
    function updateJourney(svg, journey, doneIds, activeId, links) {
        const cityGroup = svg.querySelector('.pj-qmap-cities');
        const tracks = svg.querySelector('.pj-qmap-tracks');
        const pending = tracks.querySelector('.pj-qmap-track-pending');
        const done = tracks.querySelector('.pj-qmap-track-done');

        // 重建都城标记
        cityGroup.innerHTML = '';
        const doneSet = new Set(doneIds);

        journey.forEach((p, idx) => {
            const g = create('g', {
                class: 'pj-qmap-city' + (doneSet.has(p.id) ? ' is-done' : '') + (p.id === activeId ? ' is-active' : '')
            });

            // 活跃点用光晕圈
            if (p.id === activeId) {
                const ring = create('circle', {
                    cx: p.x, cy: p.y, r: 18,
                    fill: 'none',
                    stroke: '#bf4d28',
                    'stroke-width': 2,
                    opacity: 0.4,
                    class: 'pj-qmap-ring'
                });
                g.appendChild(ring);
            }

            // 主圆圈
            const circle = create('circle', {
                cx: p.x, cy: p.y, r: 8,
                fill: doneSet.has(p.id) || p.id === activeId ? '#bf4d28' : '#7a6c4a',
                stroke: '#fff',
                'stroke-width': 2
            });
            g.appendChild(circle);

            // 序号徽章（活跃时显示）
            if (p.id === activeId) {
                const badge = create('circle', {
                    cx: p.x, cy: p.y - 20, r: 12,
                    fill: '#bf4d28', stroke: '#fff', 'stroke-width': 1.5
                });
                g.appendChild(badge);
                const badgeText = create('text', {
                    x: p.x, y: p.y - 20,
                    'text-anchor': 'middle', 'dominant-baseline': 'middle',
                    fill: '#fff', 'font-size': 11, 'font-weight': 700,
                    'font-family': 'var(--font-mono)'
                });
                badgeText.textContent = idx + 1;
                g.appendChild(badgeText);
            }

            // 都城名
            const label = create('text', {
                x: p.x, y: p.y + 22,
                'text-anchor': 'middle',
                'dominant-baseline': 'middle',
                fill: doneSet.has(p.id) || p.id === activeId ? '#bf4d28' : '#5a4a2e',
                'font-size': 13,
                'font-weight': 600,
                'font-family': 'var(--font-serif)',
                'pointer-events': 'none'
            });
            label.textContent = p.name;
            g.appendChild(label);

            g.dataset.cityId = p.id;
            g.style.cursor = 'pointer';
            g.addEventListener('click', () => {
                const evt = new CustomEvent('pj-city-click', { detail: { id: p.id, index: idx } });
                window.dispatchEvent(evt);
            });

            cityGroup.appendChild(g);
        });

        // 构造轨迹坐标
        const doneSet2 = new Set(doneIds);
        let inPending = false;
        const doneCoords = [];
        const pendingCoords = [];
        let firstPending = false;

        journey.forEach((p) => {
            if (doneSet2.has(p.id) || (!inPending && p.id === activeId)) {
                doneCoords.push(`${p.x},${p.y}`);
                if (p.id === activeId) firstPending = true;
            } else {
                inPending = true;
                pendingCoords.push(`${p.x},${p.y}`);
            }
        });

        if (doneCoords.length >= 2) done.setAttribute('d', `M ${doneCoords.join(' L ')}`);
        else done.setAttribute('d', '');
        if (pendingCoords.length >= 2) pending.setAttribute('d', `M ${pendingCoords.join(' L ')}`);
        else pending.setAttribute('d', '');
    }

    /* ============================================================
     * 工具栏（缩放/还原）
     * ============================================================ */
    function injectToolbar(container, svg) {
        const bar = document.createElement('div');
        bar.className = 'pj-qmap-toolbar';
        bar.innerHTML = `
            <button class="pj-qmap-btn" data-act="zoom-out" title="缩小">−</button>
            <button class="pj-qmap-btn" data-act="zoom-in" title="放大">+</button>
            <button class="pj-qmap-btn" data-act="reset" title="还原">⟲</button>
        `;
        container.appendChild(bar);

        // 用 CSS transform 实现缩放平移
        const state = { scale: 1, tx: 0, ty: 0, dragging: false };
        let dragStart = null;

        const apply = () => {
            const inner = svg.querySelector('.pj-qmap-inner') || svg;
            inner.style.transform = `translate(${state.tx}px, ${state.ty}px) scale(${state.scale})`;
            inner.style.transformOrigin = 'center center';
        };

        svg.style.overflow = 'hidden';

        svg.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            state.scale = Math.max(0.5, Math.min(4, state.scale * delta));
            apply();
        }, { passive: false });

        svg.addEventListener('mousedown', (e) => {
            if (e.target.closest('.pj-qmap-city')) return;
            state.dragging = true;
            dragStart = { x: e.clientX - state.tx, y: e.clientY - state.ty };
            svg.style.cursor = 'grabbing';
        });
        window.addEventListener('mousemove', (e) => {
            if (!state.dragging) return;
            state.tx = e.clientX - dragStart.x;
            state.ty = e.clientY - dragStart.y;
            apply();
        });
        window.addEventListener('mouseup', () => {
            state.dragging = false;
            svg.style.cursor = 'grab';
        });

        bar.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-act]');
            if (!btn) return;
            const act = btn.dataset.act;
            if (act === 'zoom-in') state.scale = Math.min(4, state.scale * 1.25);
            if (act === 'zoom-out') state.scale = Math.max(0.5, state.scale / 1.25);
            if (act === 'reset') { state.scale = 1; state.tx = 0; state.ty = 0; }
            apply();
        });

        // flyTo：飞到某个点
        svg._flyTo = function (x, y, scale = 2, duration = 600) {
            // viewBox 映射：把 SVG 坐标转换为容器像素
            const rect = container.getBoundingClientRect();
            const vbW = 800, vbH = 600;
            const pxPerUnit = rect.width / vbW;
            const targetPx = { x: x * pxPerUnit, y: y * pxPerUnit };
            const centerPx = { x: rect.width / 2, y: rect.height / 2 };

            const dx = centerPx.x - targetPx.x;
            const dy = centerPx.y - targetPx.y;
            const newScale = scale;
            const newTx = state.tx + dx * (newScale / state.scale);
            const newTy = state.ty + dy * (newScale / state.scale);

            animateTransform(state, { scale: newScale, tx: newTx, ty: newTy }, duration);
        };

        function animateTransform(from, to, duration) {
            const start = performance.now();
            const _from = { scale: from.scale, tx: from.tx, ty: from.ty };
            function tick(t) {
                const p = Math.min(1, (t - start) / duration);
                const ease = 1 - Math.pow(1 - p, 3);
                state.scale = _from.scale + (to.scale - _from.scale) * ease;
                state.tx = _from.tx + (to.tx - _from.tx) * ease;
                state.ty = _from.ty + (to.ty - _from.ty) * ease;
                apply();
                if (p < 1) requestAnimationFrame(tick);
            }
            requestAnimationFrame(tick);
        }

        svg._state = state;
        svg._apply = apply;
    }

    /* ============================================================
     * 工具函数
     * ============================================================ */
    function create(tag, attrs) {
        const el = document.createElementNS(SVG_NS, tag);
        for (const [k, v] of Object.entries(attrs)) {
            if (v == null) continue;
            if (k === 'class') el.setAttribute('class', v);
            else el.setAttribute(k, v);
        }
        return el;
    }

    window.confuciusSvg = { render, updateJourney };
})();

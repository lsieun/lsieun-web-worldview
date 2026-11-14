/**
 * qmap-core.js — Q 版历史地图 · 通用渲染器
 *
 * 分层架构：
 *   Layer 0  base.json        中国轮廓 + viewBox + 锚点映射
 *   Layer 1  features.json    黄河/长江/山脉（通用地标）
 *   Layer 2  periods/*.json   时期专属色块 + 都城（可选）
 *   Layer 3  专题数据          由 overlay() 动态叠加
 *
 * 使用：
 *   const qmap = QMap.mount(container, {
 *     base: baseJson,
 *     features: featuresJson,
 *     period: periodJson,
 *     showRivers: true,
 *     showMountains: true,
 *     showRegions: true
 *   });
 *   qmap.overlay({ journey, doneIds, activeId });
 *   qmap.goTo(cityId);
 */
(function () {
    'use strict';

    const SVG_NS = 'http://www.w3.org/2000/svg';

    /* ============================================================
     * mount — 初始化底图（Layer 0 + 1 + 2）
     * ============================================================ */
    function mount(mapEl, opts) {
        opts = opts || {};
        const { base, features, period,
                showRivers = true, showMountains = true, showRegions = true } = opts;

        if (!base) { console.error('[qmap-core] mount() 缺少 base'); return null; }

        // 清空容器
        mapEl.innerHTML = '';

        // viewBox 从 base 读
        const vb = base.viewBox || '0 0 800 600';
        const vbW = parseInt(vb.split(' ')[2], 10) || 800;
        const vbH = parseInt(vb.split(' ')[3], 10) || 600;

        // SVG 根
        const svg = el('svg', {
            viewBox: vb,
            class: 'qmap-svg',
            preserveAspectRatio: 'xMidYMid meet'
        });
        svg.style.width = '100%';
        svg.style.height = '100%';
        svg.style.cursor = 'grab';
        mapEl.appendChild(svg);

        // defs（滤镜、渐变、从 CSS 变量读色）
        const palette = readPalette();
        const defs = el('defs', {});
        defs.innerHTML = buildDefsHTML(palette);
        svg.appendChild(defs);

        // z-group：从底到顶依次 append
        const layers = {
            paper:    el('g', { class: 'qmap-layer qmap-layer-paper' }),
            outline:  el('g', { class: 'qmap-layer qmap-layer-outline' }),
            regions:  el('g', { class: 'qmap-layer qmap-layer-regions' }),
            mountains:el('g', { class: 'qmap-layer qmap-layer-mountains' }),
            rivers:   el('g', { class: 'qmap-layer qmap-layer-rivers' }),
            tracks:   el('g', { class: 'qmap-layer qmap-layer-tracks' }),
            cities:   el('g', { class: 'qmap-layer qmap-layer-cities' })
        };
        Object.values(layers).forEach((g) => svg.appendChild(g));

        // --- Layer 0: 底色 + 轮廓 ---
        layers.paper.appendChild(el('rect', {
            x: 0, y: 0, width: vbW, height: vbH, fill: 'url(#qmap-paper)'
        }));
        layers.outline.appendChild(el('path', {
            d: base.outline,
            fill: palette.land,
            opacity: 0.35,
            stroke: palette.landStroke,
            'stroke-width': 2.5,
            'stroke-linejoin': 'round',
            filter: 'url(#qmap-shadow)'
        }));

        // --- Layer 1: 河流 ---
        if (showRivers && features && features.rivers) {
            features.rivers.forEach((r) => {
                const path = el('path', {
                    d: r.path,
                    fill: 'none',
                    stroke: r.stroke,
                    'stroke-width': r.width,
                    'stroke-linecap': 'round',
                    'stroke-linejoin': 'round',
                    opacity: 0.85
                });
                layers.rivers.appendChild(path);

                const label = el('text', {
                    x: r.labelAt[0], y: r.labelAt[1],
                    'text-anchor': 'middle',
                    'dominant-baseline': 'middle',
                    fill: palette.riverText,
                    'font-size': 12,
                    'font-family': 'var(--font-serif)',
                    'font-weight': 600,
                    'letter-spacing': '4px',
                    opacity: 0.7
                });
                label.textContent = r.labelText;
                layers.rivers.appendChild(label);
            });
        }

        // --- Layer 1: 山脉 ---
        if (showMountains && features && features.mountains) {
            features.mountains.forEach((m) => {
                const t = el('text', {
                    x: m.x, y: m.y,
                    'text-anchor': 'middle',
                    'dominant-baseline': 'middle',
                    fill: palette.mountainText,
                    'font-size': m.fontSize || 14,
                    'font-family': 'var(--font-serif)',
                    'letter-spacing': '2px',
                    opacity: 0.55,
                    transform: m.rotate ? `rotate(${m.rotate}, ${m.x}, ${m.y})` : null
                });
                t.textContent = m.text;
                layers.mountains.appendChild(t);
            });
        }

        // --- Layer 2: 时期 regions ---
        if (showRegions && period && period.regions) {
            const paletteMap = period.palette || {};
            period.regions.forEach((r) => {
                const fill = paletteMap[r.id] || r.fill || '#888';
                const node = r.shape === 'poly'
                    ? el('polygon', {
                        points: r.points,
                        fill,
                        opacity: r.opacity || 0.35,
                        stroke: fill,
                        'stroke-width': 1,
                        'stroke-opacity': 0.5
                      })
                    : el('rect', {
                        x: r.x, y: r.y, width: r.w, height: r.h,
                        rx: 8, ry: 8,
                        fill,
                        opacity: r.opacity || 0.35,
                        stroke: fill,
                        'stroke-width': 1,
                        'stroke-opacity': 0.5
                      });
                node.dataset.regionId = r.id;
                layers.regions.appendChild(node);

                if (r.labelOffset) {
                    const lbl = el('text', {
                        x: r.labelOffset[0], y: r.labelOffset[1],
                        class: 'qmap-region-label',
                        'text-anchor': 'middle',
                        'dominant-baseline': 'middle',
                        fill: palette.regionLabel,
                        'font-size': 16,
                        'font-weight': 700,
                        'font-family': 'var(--font-serif)',
                        'pointer-events': 'none'
                    });
                    lbl.textContent = r.name;
                    layers.regions.appendChild(lbl);
                }
            });
        }

        // --- 工具栏（缩放/拖拽/flyTo）---
        const viewport = injectViewport(mapEl, svg, vbW, vbH);

        // --- 对外 API ---
        const api = {
            svg,
            layers,
            vb: { w: vbW, h: vbH },

            /** 动态叠加专题层（轨迹 + 标记点） */
            overlay(data) {
                clearGroup(layers.tracks);
                clearGroup(layers.cities);
                if (!data) return;

                // 轨迹线
                if (data.trackDone && data.trackDone.length >= 2) {
                    const d = data.trackDone.map((p) => `${p.x},${p.y}`).join(' L ');
                    layers.tracks.appendChild(el('path', {
                        d: `M ${d}`,
                        class: 'qmap-track-done',
                        fill: 'none',
                        stroke: palette.seal,
                        'stroke-width': 4,
                        'stroke-linecap': 'round',
                        'stroke-linejoin': 'round'
                    }));
                }
                if (data.trackPending && data.trackPending.length >= 2) {
                    const d = data.trackPending.map((p) => `${p.x},${p.y}`).join(' L ');
                    layers.tracks.appendChild(el('path', {
                        d: `M ${d}`,
                        class: 'qmap-track-pending',
                        fill: 'none',
                        stroke: palette.pending,
                        'stroke-width': 3,
                        'stroke-dasharray': '8,6',
                        'stroke-linecap': 'round',
                        'stroke-linejoin': 'round',
                        opacity: 0.6
                    }));
                }

                // 标记点
                if (data.cities && data.cities.length) {
                    const doneSet = new Set(data.doneIds || []);
                    const activeId = data.activeId;

                    data.cities.forEach((city, idx) => {
                        const isDone = doneSet.has(city.id);
                        const isActive = city.id === activeId;
                        const cityFill = (isDone || isActive) ? palette.seal : palette.pendingPoint;

                        const g = el('g', {
                            class: 'qmap-city' + (isDone ? ' is-done' : '') + (isActive ? ' is-active' : '')
                        });

                        if (isActive) {
                            g.appendChild(el('circle', {
                                cx: city.x, cy: city.y, r: 18,
                                fill: 'none', stroke: palette.seal,
                                'stroke-width': 2, opacity: 0.4,
                                class: 'qmap-ring'
                            }));
                        }

                        g.appendChild(el('circle', {
                            cx: city.x, cy: city.y, r: 8,
                            fill: cityFill,
                            stroke: '#fff', 'stroke-width': 2
                        }));

                        if (isActive) {
                            g.appendChild(el('circle', {
                                cx: city.x, cy: city.y - 20, r: 12,
                                fill: palette.seal, stroke: '#fff', 'stroke-width': 1.5
                            }));
                            const bt = el('text', {
                                x: city.x, y: city.y - 20,
                                'text-anchor': 'middle', 'dominant-baseline': 'middle',
                                fill: '#fff', 'font-size': 11, 'font-weight': 700,
                                'font-family': 'var(--font-mono)'
                            });
                            bt.textContent = idx + 1;
                            g.appendChild(bt);
                        }

                        const cl = el('text', {
                            x: city.x, y: city.y + 22,
                            'text-anchor': 'middle', 'dominant-baseline': 'middle',
                            fill: (isDone || isActive) ? palette.seal : palette.mountainText,
                            'font-size': 13, 'font-weight': 600,
                            'font-family': 'var(--font-serif)',
                            'pointer-events': 'none'
                        });
                        cl.textContent = city.name;
                        g.appendChild(cl);

                        g.dataset.cityId = city.id;
                        g.style.cursor = 'pointer';
                        g.addEventListener('click', () => {
                            window.dispatchEvent(new CustomEvent('qmap-city-click', {
                                detail: { id: city.id, index: idx }
                            }));
                        });

                        layers.cities.appendChild(g);
                    });
                }
            },

            /** 飞行动画到某个 SVG 坐标 */
            goToPoint(x, y, scale = 2, duration = 600) {
                viewport.flyTo(x, y, scale, duration);
            },

            /** 飞行动画到某个专题 city（需要 overlay 过） */
            goToCity(cityId, scale = 2, duration = 600) {
                const node = svg.querySelector(`.qmap-city[data-city-id="${cityId}"]`);
                if (!node) return;
                const c = node.querySelector('circle');
                if (!c) return;
                const x = parseFloat(c.getAttribute('cx'));
                const y = parseFloat(c.getAttribute('cy'));
                viewport.flyTo(x, y, scale, duration);
            }
        };

        return api;
    }

    /* ============================================================
     * Viewport：缩放/拖拽/flyTo（用 CSS transform）
     * ============================================================ */
    function injectViewport(container, svg, vbW, vbH) {
        const state = { scale: 1, tx: 0, ty: 0 };

        function apply() {
            svg.style.transform = `translate(${state.tx}px, ${state.ty}px) scale(${state.scale})`;
            svg.style.transformOrigin = 'center center';
        }

        svg.style.cursor = 'grab';
        svg.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            state.scale = Math.max(0.5, Math.min(4, state.scale * delta));
            apply();
        }, { passive: false });

        let dragStart = null, dragging = false;
        svg.addEventListener('mousedown', (e) => {
            if (e.target.closest('.qmap-city')) return;
            dragging = true;
            dragStart = { x: e.clientX - state.tx, y: e.clientY - state.ty };
            svg.style.cursor = 'grabbing';
        });
        window.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            state.tx = e.clientX - dragStart.x;
            state.ty = e.clientY - dragStart.y;
            apply();
        });
        window.addEventListener('mouseup', () => { dragging = false; svg.style.cursor = 'grab'; });

        // 工具栏
        const bar = document.createElement('div');
        bar.className = 'qmap-toolbar';
        bar.innerHTML = `
            <button class="qmap-btn" data-act="zoom-out" title="缩小">−</button>
            <button class="qmap-btn" data-act="zoom-in" title="放大">+</button>
            <button class="qmap-btn" data-act="reset" title="还原">⟲</button>
        `;
        container.appendChild(bar);
        bar.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-act]');
            if (!btn) return;
            const act = btn.dataset.act;
            if (act === 'zoom-in') state.scale = Math.min(4, state.scale * 1.25);
            if (act === 'zoom-out') state.scale = Math.max(0.5, state.scale / 1.25);
            if (act === 'reset') { state.scale = 1; state.tx = 0; state.ty = 0; }
            apply();
        });

        // flyTo：把 SVG 坐标飞到容器中心并缩放
        function flyTo(sx, sy, scale, duration) {
            const rect = container.getBoundingClientRect();
            const pxPerUnit = rect.width / vbW;
            const targetPx = { x: sx * pxPerUnit, y: sy * pxPerUnit };
            const centerPx = { x: rect.width / 2, y: rect.height / 2 };
            const dx = centerPx.x - targetPx.x;
            const dy = centerPx.y - targetPx.y;
            const newScale = scale;
            const newTx = state.tx + dx * (newScale / state.scale);
            const newTy = state.ty + dy * (newScale / state.scale);
            animate(state, { scale: newScale, tx: newTx, ty: newTy }, duration);
        }

        function animate(from, to, duration) {
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

        return { flyTo, state, apply };
    }

    /* ============================================================
     * CSS 变量 → SVG 颜色
     * ============================================================ */
    function readPalette() {
        const css = getComputedStyle(document.documentElement);
        const read = (name, fallback) => {
            const v = css.getPropertyValue(name).trim();
            return v || fallback;
        };
        return {
            land:        read('--qmap-land',         '#d9cba0'),
            landStroke:  read('--qmap-land-stroke', '#7a6c4a'),
            regionLabel: read('--qmap-region-label','#3a2d1a'),
            riverText:   read('--qmap-river-text',   '#8a6218'),
            mountainText:read('--qmap-mountain-text', '#5a4a2e'),
            seal:        read('--color-seal',        '#bf4d28'),
            pending:     read('--qmap-pending',      '#999'),
            pendingPoint:read('--qmap-point-pending','#7a6c4a')
        };
    }

    function buildDefsHTML(p) {
        return `
            <filter id="qmap-shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="1" dy="2" stdDeviation="2" flood-opacity="0.25" flood-color="#000"/>
            </filter>
            <filter id="qmap-rough" x="-5%" y="-5%" width="110%" height="110%">
                <feTurbulence type="turbulence" baseFrequency="0.03" numOctaves="2" seed="42"/>
                <feDisplacementMap in="SourceGraphic" scale="3"/>
            </filter>
            <linearGradient id="qmap-paper" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#f5efdf"/>
                <stop offset="50%" stop-color="#f2ead3"/>
                <stop offset="100%" stop-color="#ece3c9"/>
            </linearGradient>
            <linearGradient id="qmap-yellow-river" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stop-color="#e6b53a"/>
                <stop offset="50%" stop-color="#d4982a"/>
                <stop offset="100%" stop-color="#e6b53a"/>
            </linearGradient>
            <linearGradient id="qmap-yangtze" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stop-color="#6a8ca8"/>
                <stop offset="50%" stop-color="#4e6d8a"/>
                <stop offset="100%" stop-color="#6a8ca8"/>
            </linearGradient>
        `;
    }

    /* ============================================================
     * 工具
     * ============================================================ */
    function el(tag, attrs) {
        const e = document.createElementNS(SVG_NS, tag);
        for (const [k, v] of Object.entries(attrs || {})) {
            if (v == null) continue;
            if (k === 'class') e.setAttribute('class', v);
            else e.setAttribute(k, v);
        }
        return e;
    }
    function clearGroup(g) { while (g.firstChild) g.removeChild(g.firstChild); }

    window.QMap = { mount };
})();

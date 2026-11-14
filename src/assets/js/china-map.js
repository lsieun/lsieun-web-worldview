/**
 * china-map.js — 通用中国省级地图（ECharts geo 组件 + 叠加层）
 * 约定：页面在 DOM 中放一个 <div id="{id}"> 容器，并在 <script id="{id}-data" type="application/json">
 *       里放 scheme（省份分组、分界线、标签、中心缩放）。
 * 自动：registerMap('china', GeoJSON)、主题切换重绘、窗口 resize、工具栏（缩放/还原/全屏）。
 *       平移 = 鼠标拖动；缩放 = 滚轮 / 工具栏按钮。
 *
 * 扩展支持：
 *   scheme.markers   — 标记点数组 [{ id, name, coords, order?, color? }]
 *   scheme.tracks    — 轨迹线 { done: {coords}, pending: {coords} }
 *   外部 API：container._cm = { chart, api }
 *     api.flyTo(coords, zoom)       — 飞到坐标
 *     api.highlightMarker(id)       — 高亮标记点
 *     api.clearHighlight()          — 清除高亮
 *     api.setTrackProgress(doneIds, allIds, links) — 根据已完成的点重绘轨迹
 */
(function () {
    /* ------------------------------------------------------------------
     * 初始化
     * ------------------------------------------------------------------ */
    function init(root) {
        const container = typeof root === 'string'
            ? document.getElementById(root)
            : root;
        if (!container) return null;

        const id = container.id || `china-map-${Math.random().toString(36).slice(2, 7)}`;
        const dataEl = document.getElementById(`${id}-data`);
        if (!dataEl) { console.warn(`[china-map] 缺少 #${id}-data`); return null; }
        if (!window.echarts) { console.warn(`[china-map] echarts 未加载`); return null; }

        let scheme;
        try { scheme = JSON.parse(dataEl.textContent); }
        catch (e) { console.warn(`[china-map] scheme 解析失败`, e); return null; }

        return { id, container, scheme };
    }

    /* ------------------------------------------------------------------
     * 主题感知：从 CSS 变量读色
     * ------------------------------------------------------------------ */
    function themeColors() {
        const dark = document.documentElement.getAttribute('data-theme') === 'dark';
        const css = getComputedStyle(document.documentElement);
        const read = (name, fallback) => {
            const v = css.getPropertyValue(name).trim();
            return v || fallback;
        };
        return {
            dark,
            land:     read('--map-land',     dark ? '#1a2634' : '#e8eef3'),
            landAlt:  read('--map-land-alt', dark ? '#243447' : '#dfe6ed'),
            border:   read('--map-border',   dark ? '#2a3d53' : '#c4ced6'),
            borderHi: read('--map-border-hi',dark ? '#4a6f92' : '#8a9aab'),
            ocean:    read('--map-ocean',    dark ? '#0f1a1e' : '#c8d3db'),
            text:     read('--color-ink',    dark ? '#ece7d8' : '#16231f'),
            textDim:  read('--color-muted',  dark ? '#8d9a92' : '#6d7c74'),
            line:     read('--map-line',     dark ? '#d8b36b' : '#b85c2f'),
            toolBtn:  dark ? '#8aa297' : '#5d6b64',
            toolBtnOn:dark ? '#d8b36b' : '#b85c2f'
        };
    }

    function resolveLegendColors(scheme) {
        const dark = document.documentElement.getAttribute('data-theme') === 'dark';
        const out = {};
        (scheme.legend || []).forEach((item) => {
            out[item.name] = dark
                ? (item.colorDark || item.color)
                : (item.colorLight || item.color);
        });
        return out;
    }

    /* ------------------------------------------------------------------
     * ECharts option 构造
     * ------------------------------------------------------------------ */
    function buildOption(scheme, palette) {
        const legendColors = resolveLegendColors(scheme);

        const regions = [];
        if (scheme.provinces) {
            for (const [name, group] of Object.entries(scheme.provinces)) {
                const color = legendColors[group] || palette.landAlt;
                regions.push({
                    name,
                    itemStyle: { areaColor: color, borderColor: palette.border },
                    emphasis: { disabled: true },
                    select: { disabled: true }
                });
            }
        }

        const series = [];

        // ---------- 原有 lines（分界线等） ----------
        const lineData = (scheme.lines || [])
            .filter((line) => !line.hide)
            .map((line) => ({ coords: line.coords }));
        const lineStyles = (scheme.lines || [])
            .filter((line) => !line.hide)
            .map((line) => ({
                color: palette.line,
                width: line.width || 2.2,
                opacity: line.opacity || 0.85
            }));

        if (lineData.length) {
            const firstStyle = lineStyles[0];
            series.push({
                id: 'overlays',
                name: '分界线',
                type: 'lines',
                coordinateSystem: 'geo',
                polyline: true,
                z: 4,
                silent: true,
                lineStyle: firstStyle,
                data: lineData.map((d, i) => ({
                    coords: d.coords,
                    lineStyle: lineStyles[i] || firstStyle
                }))
            });
        }

        // ---------- 轨迹线 tracks ----------
        if (scheme.tracks) {
            const trackDone = scheme.tracks.done;
            const trackPending = scheme.tracks.pending;

            if (trackPending && trackPending.coords && trackPending.coords.length >= 2) {
                series.push({
                    id: 'track-pending',
                    name: '待行经',
                    type: 'lines',
                    coordinateSystem: 'geo',
                    polyline: true,
                    z: 5,
                    silent: true,
                    lineStyle: {
                        color: trackPending.color || (palette.dark ? '#5a6e78' : '#a8b5bd'),
                        width: trackPending.width || 2,
                        opacity: trackPending.opacity || 0.5,
                        type: 'dashed',
                        dashOffset: 8
                    },
                    data: [{ coords: trackPending.coords }]
                });
            }

            if (trackDone && trackDone.coords && trackDone.coords.length >= 2) {
                series.push({
                    id: 'track-done',
                    name: '已行经',
                    type: 'lines',
                    coordinateSystem: 'geo',
                    polyline: true,
                    z: 5,
                    silent: true,
                    lineStyle: {
                        color: trackDone.color || (palette.dark ? '#e98a5a' : '#bf4d28'),
                        width: trackDone.width || 2.8,
                        opacity: trackDone.opacity || 0.95
                    },
                    data: [{ coords: trackDone.coords }]
                });
            }
        }

        // ---------- labels（纯文字标注） ----------
        const textData = [];
        (scheme.lines || []).forEach((line) => {
            if (!line.hide && line.labelPoint) {
                textData.push({
                    coords: line.labelPoint,
                    text: line.label || '',
                    color: palette.line,
                    fontSize: 13
                });
            }
        });
        (scheme.labels || []).forEach((lbl) => {
            textData.push({
                coords: lbl.coords,
                text: lbl.text,
                color: lbl.color || palette.text,
                fontSize: lbl.fontSize || 13,
                rotate: lbl.rotate || 0
            });
        });

        // ---------- markers（带序号的标记点） ----------
        if (scheme.markers && scheme.markers.length) {
            const markerDark = palette.dark ? '#e98a5a' : '#bf4d28';
            const markerDimDark = palette.dark ? '#5a6e78' : '#a8b5bd';
            const markerTextDark = palette.dark ? '#1a2634' : '#ffffff';

            const markerData = scheme.markers.map((m, idx) => {
                const isActive = m.active === true || m._active === true;
                const isDone = m._done === true;
                const baseColor = m.color || (isDone ? markerDark : (isActive ? markerDark : markerDimDark));
                const size = m.size || (isActive ? 12 : 8);
                return {
                    coords: m.coords,
                    name: m.name,
                    value: [m.coords[0], m.coords[1], idx],
                    _id: m.id,
                    _order: m.order || (idx + 1),
                    _active: isActive,
                    _done: isDone,
                    itemStyle: {
                        color: baseColor,
                        borderColor: '#fff',
                        borderWidth: 1.5
                    },
                    label: {
                        show: true,
                        formatter: m.order ? `{num|${m.order}}` : '',
                        position: 'top',
                        fontSize: 11,
                        fontWeight: 700,
                        distance: 4,
                        color: markerTextDark,
                        rich: {
                            num: {
                                fontSize: 10,
                                color: '#fff',
                                backgroundColor: baseColor,
                                padding: [2, 5],
                                borderRadius: 8,
                                fontWeight: 700,
                                lineHeight: 14
                            }
                        }
                    }
                };
            });

            // Active marker（当前停留点）用光晕效果
            const activeMarkers = markerData.filter((m) => m._active);
            if (activeMarkers.length) {
                series.push({
                    id: 'markers-active',
                    name: '当前位置',
                    type: 'effectScatter',
                    coordinateSystem: 'geo',
                    z: 8,
                    rippleEffect: {
                        brushType: 'stroke',
                        scale: 3,
                        period: 3
                    },
                    itemStyle: {
                        color: markerDark,
                        borderColor: '#fff',
                        borderWidth: 2
                    },
                    data: activeMarkers
                });
            }

            // All markers（作为可点击/可高亮的基础）
            series.push({
                id: 'markers',
                name: '标记点',
                type: 'scatter',
                coordinateSystem: 'geo',
                z: 7,
                symbolSize: (val, params) => {
                    const d = params.data;
                    return d._active ? 14 : (d._done ? 10 : 8);
                },
                itemStyle: {},
                label: { show: false },
                emphasis: {
                    disabled: false,
                    scale: 1.3,
                    itemStyle: {
                        color: '#fff',
                        borderColor: markerDark,
                        borderWidth: 3
                    }
                },
                data: markerData
            });
        }

        if (textData.length) {
            series.push({
                id: 'labels',
                name: '标签',
                type: 'scatter',
                coordinateSystem: 'geo',
                z: 6,
                symbol: 'none',
                label: {
                    show: true,
                    formatter: (params) => params.data.text,
                    position: 'right',
                    color: palette.text,
                    fontSize: 13,
                    fontWeight: 500,
                    fontFamily: 'Outfit, Noto Sans SC, system-ui, sans-serif'
                },
                data: textData.map((d) => ({
                    coords: d.coords,
                    text: d.text,
                    itemStyle: { color: d.color },
                    label: {
                        color: d.color || palette.text,
                        fontSize: d.fontSize || 13,
                        rotate: d.rotate || 0
                    }
                }))
            });
        }

        return {
            backgroundColor: 'transparent',
            tooltip: { show: false },
            geo: [geoComp(scheme, palette, regions)],
            series
        };
    }

    function geoComp(scheme, palette, regions) {
        return {
            map: 'china',
            roam: true,
            zoom: scheme.zoom || 1.2,
            center: scheme.center || [104, 35],
            scaleLimit: { min: 0.5, max: 6 },
            label: { show: false },
            itemStyle: {
                areaColor: palette.land,
                borderColor: palette.border,
                borderWidth: 0.9
            },
            emphasis: { disabled: true },
            select: { disabled: true },
            regions
        };
    }

    /* ------------------------------------------------------------------
     * 自定义工具栏（全屏按钮 + 重置按钮）
     * ------------------------------------------------------------------ */
    function injectToolbar(container, chart, palette) {
        const bar = document.createElement('div');
        bar.className = 'cm-toolbar';
        bar.innerHTML = `
            <button class="cm-btn cm-btn-zoom-out" title="缩小">
                <svg viewBox="0 0 24 24" width="16" height="16"><path d="M5 12h14" stroke="currentColor" stroke-width="2" fill="none"/></svg>
            </button>
            <button class="cm-btn cm-btn-zoom-in" title="放大">
                <svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" fill="none"/></svg>
            </button>
            <button class="cm-btn cm-btn-reset" title="还原">
                <svg viewBox="0 0 24 24" width="16" height="16"><path d="M4 12a8 8 0 1 0 2-5.5" stroke="currentColor" stroke-width="2" fill="none"/><path d="M4 4v5h5" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/></svg>
            </button>
            <button class="cm-btn cm-btn-fs" title="全屏">
                <svg viewBox="0 0 24 24" width="16" height="16"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/></svg>
            </button>
        `;
        container.appendChild(bar);

        const updateColor = () => {
            bar.querySelectorAll('.cm-btn').forEach((b) => {
                b.style.color = palette.toolBtn;
            });
        };
        updateColor();

        let currentZoom = 1.2;
        let currentCenter = [104, 35];

        chart.on('georoam', (params) => {
            if (params && params.zoom != null) currentZoom = params.zoom;
            if (params && params.center != null) currentCenter = params.center;
        });

        const getDefaultView = () => {
            const opt = chart.getOption();
            if (opt.geo && opt.geo[0]) {
                return { zoom: opt.geo[0].zoom, center: opt.geo[0].center };
            }
            return { zoom: 1.2, center: [104, 35] };
        };

        const applyView = (zoom, center) => {
            const opt = chart.getOption();
            if (opt.geo && opt.geo[0]) {
                opt.geo[0].zoom = zoom;
                opt.geo[0].center = center;
                chart.setOption(opt, false);
            }
        };

        bar.querySelector('.cm-btn-zoom-in').addEventListener('click', () => {
            const z = Math.min((currentZoom || 1) * 1.3, 6);
            applyView(z, currentCenter);
        });
        bar.querySelector('.cm-btn-zoom-out').addEventListener('click', () => {
            const z = Math.max((currentZoom || 1) / 1.3, 0.5);
            applyView(z, currentCenter);
        });
        bar.querySelector('.cm-btn-reset').addEventListener('click', () => {
            const def = getDefaultView();
            applyView(def.zoom, def.center);
        });

        const fsBtn = bar.querySelector('.cm-btn-fs');
        let isFullscreen = false;
        const enterFs = () => {
            const wrapper = container.closest('.china-map-block') || container.parentElement;
            if (wrapper.requestFullscreen) wrapper.requestFullscreen();
            else if (wrapper.webkitRequestFullscreen) wrapper.webkitRequestFullscreen();
            else {
                wrapper.classList.add('cm-fullscreen-fallback');
                document.documentElement.classList.add('cm-fullscreen-locked');
            }
            isFullscreen = true;
        };
        const exitFs = () => {
            if (document.fullscreenElement || document.webkitFullscreenElement) {
                if (document.exitFullscreen) document.exitFullscreen();
                else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
            } else {
                const wrapper = container.closest('.china-map-block') || container.parentElement;
                wrapper.classList.remove('cm-fullscreen-fallback');
                document.documentElement.classList.remove('cm-fullscreen-locked');
            }
            isFullscreen = false;
        };
        fsBtn.addEventListener('click', () => {
            isFullscreen ? exitFs() : enterFs();
        });
        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement) {
                const wrapper = container.closest('.china-map-block');
                if (!wrapper || !wrapper.classList.contains('cm-fullscreen-fallback')) {
                    isFullscreen = false;
                }
            }
        });

        return {
            bar,
            destroy: () => bar.remove(),
            updateColor
        };
    }

    /* ------------------------------------------------------------------
     * 主入口
     * ------------------------------------------------------------------ */
    function mount(target) {
        const boot = init(target);
        if (!boot) return;
        const { id, container, scheme } = boot;

        const geojsonUrl = scheme.geojsonUrl || '/assets/data/china-provinces.geojson';

        fetch(geojsonUrl)
            .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then((geoJson) => {
                try {
                    if (!window.echarts) throw new Error('echarts 未加载');
                    if (!window.echarts.getMap) throw new Error('echarts 版本不兼容');

                    if (!window.echarts.getMap('china')) {
                        window.echarts.registerMap('china', geoJson);
                    }

                    const chart = window.echarts.init(container, null, { renderer: 'canvas' });
                    if (!chart) throw new Error('echarts.init 返回空值');

                    container.dataset.chartId = id;

                    let toolbarApi = null;
                    let currentScheme = scheme;

                    const render = () => {
                        const palette = themeColors();
                        const option = buildOption(currentScheme, palette);
                        if (!option || !option.geo || !option.geo.length) {
                            throw new Error('buildOption 返回的 option 缺少 geo');
                        }

                        const curOpt = (() => { try { return chart.getOption() || {}; } catch (e) { return {}; } })();
                        const curGeo0 = curOpt.geo && curOpt.geo[0];
                        if (curGeo0 && curGeo0.center) {
                            option.geo[0].zoom = curGeo0.zoom ?? option.geo[0].zoom;
                            option.geo[0].center = curGeo0.center;
                        }

                        chart.setOption(option, true);

                        if (!toolbarApi) {
                            toolbarApi = injectToolbar(container, chart, palette);
                        } else {
                            toolbarApi.updateColor();
                        }
                    };
                    render();

                    const ro = new ResizeObserver(() => chart.resize());
                    ro.observe(container);

                    const onThemeChange = () => render();
                    document.addEventListener('themechanged', onThemeChange);

                    /* ---- 外部 API ---- */
                    const api = {
                        /** 飞到指定坐标 */
                        flyTo(coords, zoom, duration = 800) {
                            const opt = chart.getOption();
                            if (opt.geo && opt.geo[0]) {
                                opt.geo[0].center = coords;
                                if (zoom != null) opt.geo[0].zoom = zoom;
                                chart.setOption(opt, false);
                            }
                        },

                        /** 高亮某个 marker（通过 id） */
                        highlightMarker(markerId) {
                            const markers = currentScheme.markers || [];
                            let found = false;
                            markers.forEach((m) => {
                                if (m.id === markerId) {
                                    m._active = true;
                                    found = true;
                                } else {
                                    m._active = false;
                                }
                            });
                            return found;
                        },

                        /** 重新渲染（scheme 有更新后调用） */
                        refresh(newScheme) {
                            if (newScheme) currentScheme = newScheme;
                            render();
                        },

                        /**
                         * 根据"已完成的点"重绘轨迹
                         * @param {string[]} doneIds 已完成（到达过）的 marker id 列表
                         * @param {string[]} allIds 全部 marker id 列表（按顺序）
                         * @param {{from:string,to:string}[]} links 连接关系
                         */
                        updateJourney(doneIds, allIds, links) {
                            const markers = currentScheme.markers || [];
                            const doneSet = new Set(doneIds);

                            // 更新 markers 状态
                            let activeIdx = -1;
                            markers.forEach((m) => {
                                const idx = allIds.indexOf(m.id);
                                m._done = doneSet.has(m.id);
                                m._active = false;
                                if (idx >= 0 && !m._done && activeIdx < 0) {
                                    activeIdx = idx;
                                }
                            });
                            if (activeIdx >= 0 && markers[activeIdx]) {
                                markers[activeIdx]._active = true;
                            } else if (markers.length > 0) {
                                // 全部完成 → 高亮最后一个
                                markers[markers.length - 1]._active = true;
                            }

                            // 重建轨迹线
                            const coordsById = {};
                            markers.forEach((m) => { coordsById[m.id] = m.coords; });

                            const doneCoords = [];
                            const pendingCoords = [];
                            let inPending = false;

                            // 按 allIds 顺序构造路径
                            for (let i = 0; i < allIds.length; i++) {
                                const id = allIds[i];
                                const coord = coordsById[id];
                                if (!coord) continue;

                                if (doneSet.has(id) || i === activeIdx) {
                                    if (!inPending) doneCoords.push(coord);
                                    else pendingCoords.push(coord);
                                } else {
                                    inPending = true;
                                    pendingCoords.push(coord);
                                }
                            }

                            currentScheme.tracks = {
                                done: { coords: doneCoords.length >= 2 ? doneCoords : [], width: 3 },
                                pending: { coords: pendingCoords.length >= 2 ? pendingCoords : [], width: 2 }
                            };

                            render();
                        },

                        /** 获取图表实例（用于更底层操作） */
                        getChart() { return chart }
                    };

                    container._cm = { chart, api, scheme: currentScheme };

                    return () => {
                        ro.disconnect();
                        document.removeEventListener('themechanged', onThemeChange);
                        if (toolbarApi) toolbarApi.destroy();
                        chart.dispose();
                    };
                } catch (inner) {
                    console.error('[china-map] 初始化内部错误', inner);
                    container.innerHTML = `<p class="cm-error">${inner.message || inner}</p>`;
                }
            })
            .catch((e) => {
                console.error('[china-map] 外层错误', e);
                container.innerHTML = `<p class="cm-error">地图加载失败：${e.message || e}</p>`;
            });
    }

    function autoMount() {
        document.querySelectorAll('[data-china-map]').forEach((el) => mount(el));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoMount);
    } else {
        autoMount();
    }

    window.chinaMap = { mount, init: autoMount };
})();

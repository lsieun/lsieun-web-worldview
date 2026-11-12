/**
 * china-map.js — 通用中国省级地图（ECharts geo 组件 + 叠加层）
 * 约定：页面在 DOM 中放一个 <div id="{id}"> 容器，并在 <script id="{id}-data" type="application/json">
 *       里放 scheme（省份分组、分界线、标签、中心缩放）。
 * 自动：registerMap('china', GeoJSON)、主题切换重绘、窗口 resize、工具栏（缩放/还原/全屏）。
 *       平移 = 鼠标拖动；缩放 = 滚轮 / 工具栏按钮。
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

        const geoComp = {
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

        const series = [];

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
            geo: [geoComp],
            series
        };
    }

    /* ------------------------------------------------------------------
     * 自定义工具栏（全屏按钮 + 重置按钮）
     * 注：ECharts toolbox 只能挂在 grid/pie/series 上，geo 不支持。
     *     这里用自绘 HTML 覆盖在 canvas 上，监听 geo 的 zoom 变化同步重置。
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

        // 当前视角缓存（供 restore 使用）
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

        // 全屏（参考 dynasty-reigns.js）
        const fsBtn = bar.querySelector('.cm-btn-fs');
        let isFullscreen = false;
        const enterFs = () => {
            const wrapper = container.closest('.china-map-block') || container.parentElement;
            if (wrapper.requestFullscreen) wrapper.requestFullscreen();
            else if (wrapper.webkitRequestFullscreen) wrapper.webkitRequestFullscreen();
            else {
                // 页面级全屏回退
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

                    const render = () => {
                        const palette = themeColors();
                        const option = buildOption(scheme, palette);
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

/**
 * china-map.js — 通用中国省级地图（ECharts geo 组件 + 叠加层）
 * 约定：页面在 DOM 中放一个 <div id="{id}"> 容器，并在 <script id="{id}-data" type="application/json">
 *       里放 scheme（省份分组、分界线、标签、中心缩放）。
 * 自动：registerMap('china', GeoJSON)、主题切换重绘、窗口 resize。
 */
(function () {
    /* ------------------------------------------------------------------
     * 初始化：找容器，读 scheme，取 GeoJSON
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
            line:     read('--map-line',     dark ? '#d8b36b' : '#b85c2f')
        };
    }

    /* ------------------------------------------------------------------
     * 配色：scheme.legend 的颜色随主题切换
     * ------------------------------------------------------------------ */
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
     * 结构：option.geo = [底图 + regions 填色];
     *       option.series = [lines 分界线, scatter 标签]
     * ------------------------------------------------------------------ */
    function buildOption(scheme, palette) {
        const legendColors = resolveLegendColors(scheme);

        // regions：每个省的填色规则
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

        // 分界线：只处理 hide !== true 的线
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

        // 标签数据
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
            roam: false,
            zoom: scheme.zoom || 1.2,
            center: scheme.center || [104, 35],
            scaleLimit: { min: 0.8, max: 3 },
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

        // 分界线
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

        // 文字标签
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
     * 主入口：fetch GeoJSON → registerMap → init chart
     * ------------------------------------------------------------------ */
    function mount(target) {
        const boot = init(target);
        if (!boot) return;
        const { id, container, scheme } = boot;

        const geojsonUrl = scheme.geojsonUrl || '/assets/data/china-provinces.geojson';

        fetch(geojsonUrl)
            .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then((geoJson) => {
                if (!window.echarts.getMap('china')) {
                    window.echarts.registerMap('china', geoJson);
                }

                const chart = window.echarts.init(container, null, { renderer: 'canvas' });
                container.dataset.chartId = id;

                const render = () => {
                    const palette = themeColors();
                    const option = buildOption(scheme, palette);
                    chart.setOption(option, true);
                };
                render();

                const ro = new ResizeObserver(() => chart.resize());
                ro.observe(container);

                const onThemeChange = () => render();
                document.addEventListener('themechanged', onThemeChange);

                return () => {
                    ro.disconnect();
                    document.removeEventListener('themechanged', onThemeChange);
                    chart.dispose();
                };
            })
            .catch((e) => {
                container.innerHTML = `<p class="cm-error">地图数据加载失败：${e.message}</p>`;
            });
    }

    /* ------------------------------------------------------------------
     * 自动挂载：data-china-map 属性
     * ------------------------------------------------------------------ */
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

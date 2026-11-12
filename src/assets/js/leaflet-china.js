/**
 * leaflet-china.js — 通用中国省级地图（Leaflet + Turf.js 精确切省）
 * 约定：页面在 DOM 中放一个 <div id="{id}"> 容器，并在 <script id="{id}-data" type="application/json">
 *       里放 scheme（省份分组、分界线、标签、中心缩放、clip 设置）。
 * 核心能力：Turf.js 把被分界线穿过的省份精确切成两半，centroid 判定两侧归属。
 */
(function () {
    const DEG_BUFFER = 0.015; // buffer 宽度 ≈ 1.67km，保证 Turf intersect 检测可靠

    /* ------------------------------------------------------------------
     * 初始化
     * ------------------------------------------------------------------ */
    function init(root) {
        const container = typeof root === 'string'
            ? document.getElementById(root)
            : root;
        if (!container) return null;

        const id = container.id || `leaflet-map-${Math.random().toString(36).slice(2, 7)}`;
        const dataEl = document.getElementById(`${id}-data`);
        if (!dataEl) { console.warn(`[leaflet-china] 缺少 #${id}-data`); return null; }
        if (typeof L === 'undefined') { console.warn(`[leaflet-china] Leaflet 未加载`); return null; }

        let scheme;
        try { scheme = JSON.parse(dataEl.textContent); }
        catch (e) { console.warn(`[leaflet-china] scheme 解析失败`, e); return null; }

        return { id, container, scheme };
    }

    /* ------------------------------------------------------------------
     * 主题感知
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
            tileLight: 'rgba(232, 238, 243, 0.32)',
            tileDark:  'rgba(26, 38, 52, 0.32)'
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
     * Turf.js 精确切省
     * 把被分界线穿过的省份切成两半，centroid + cross-product 判定归属
     * ------------------------------------------------------------------ */
    /**
     * 判断点相对于 polyline 的哪一侧（cross product 符号）
     * 返回正值 = 左侧，负值 = 右侧
     */
    function pointLineSide(pt, lineCoords) {
        // 找 line 上距离 pt 最近的一段 segment，用 cross product 算方向
        let best = { seg: null, dist: Infinity };
        for (let i = 0; i < lineCoords.length - 1; i++) {
            const a = lineCoords[i], b = lineCoords[i + 1];
            // 简化：取中点距离做近似
            const midLng = (a[0] + b[0]) / 2, midLat = (a[1] + b[1]) / 2;
            const d = Math.abs(pt[0] - midLng) + Math.abs(pt[1] - midLat);
            if (d < best.dist) best = { seg: [a, b], dist: d };
        }
        if (!best.seg) return 0;
        const [ax, ay] = best.seg[0];
        const [bx, by] = best.seg[1];
        const [px, py] = pt;
        // cross product: (b-a) × (p-a)
        return (bx - ax) * (py - ay) - (by - ay) * (px - ax);
    }

    /**
     * lineClip：返回一个函数，给定 polygon feature，返回 [{geometry, group}] 数组
     * clipMap 支持：
     *   { left, right } — 直接 cross product 结果
     *   { north, south } — 自动根据 line 方向映射为 left/right
     *   { east, west }   — 同上
     */
    function makeLineClip(lineDef, groupBySide) {
        const lineString = turf.lineString(lineDef.coords);
        const rawClipMap = groupBySide || {};

        // 方向探测
        const first = lineDef.coords[0];
        const last = lineDef.coords[lineDef.coords.length - 1];
        const dx = last[0] - first[0];
        const dy = last[1] - first[1];
        const mostlyEW = Math.abs(dx) > Math.abs(dy);

        let clipMap = { left: null, right: null };
        if (rawClipMap.left != null || rawClipMap.right != null) {
            clipMap = { left: rawClipMap.left, right: rawClipMap.right };
        } else if (rawClipMap.north != null || rawClipMap.south != null) {
            if (mostlyEW) clipMap = { left: rawClipMap.north, right: rawClipMap.south };
            else clipMap = { left: rawClipMap.south, right: rawClipMap.north };
        } else if (rawClipMap.east != null || rawClipMap.west != null) {
            if (!mostlyEW) clipMap = { left: rawClipMap.west, right: rawClipMap.east };
            else clipMap = { left: rawClipMap.east, right: rawClipMap.west };
        }

        return function clipFeature(feature) {
            try {
                const featureGeo = turf.feature(feature.geometry, feature.properties);

                // 方法 A：turf.lineSplit —— 用 line 把 polygon 切成两半
                let split = null;
                try {
                    split = turf.lineSplit(featureGeo, lineString);
                } catch (e) {
                    // lineSplit 不支持 MultiPolygon，降级尝试
                }

                if (split && split.type === 'FeatureCollection' && split.features.length >= 1) {
                    // 过滤掉太小的碎片
                    const valid = split.features.filter((p) => {
                        try { return turf.area(p) / 1e6 > 50; } catch { return true; }
                    });
                    if (valid.length > 0) {
                        return valid.map((piece) => {
                            const centroid = turf.centroid(piece);
                            const pt = centroid.geometry.coordinates;
                            const cross = pointLineSide(pt, lineDef.coords);
                            const side = cross >= 0 ? 'left' : 'right';
                            const group = clipMap[side] || clipMap[side === 'left' ? 'right' : 'left'];
                            return {
                                geometry: piece.geometry,
                                properties: { ...feature.properties, __groupFromSide: group }
                            };
                        });
                    }
                }

                // 方法 B（降级）：buffer + difference
                const buffered = turf.buffer(lineString, DEG_BUFFER, { units: 'degrees' });
                try {
                    const diff = turf.difference(featureGeo, buffered);
                    if (diff) {
                        const pieces = diff.type === 'FeatureCollection' ? diff.features : [diff];
                        const valid = pieces.filter((p) => {
                            try { return turf.area(p) / 1e6 > 50; } catch { return true; }
                        });
                        if (valid.length > 0) {
                            return valid.map((piece) => {
                                const centroid = turf.centroid(piece);
                                const pt = centroid.geometry.coordinates;
                                const cross = pointLineSide(pt, lineDef.coords);
                                const side = cross >= 0 ? 'left' : 'right';
                                const group = clipMap[side] || clipMap[side === 'left' ? 'right' : 'left'];
                                return {
                                    geometry: piece.geometry,
                                    properties: { ...feature.properties, __groupFromSide: group }
                                };
                            });
                        }
                    }
                } catch {}

                // 方法 C（最终降级）：centroid 判断归属，不切分
                try {
                    const centroid = turf.centroid(featureGeo);
                    const pt = centroid.geometry.coordinates;
                    const cross = pointLineSide(pt, lineDef.coords);
                    const side = cross >= 0 ? 'left' : 'right';
                    const group = clipMap[side]; // 没有整体归属的话就 null
                    return [{
                        geometry: feature.geometry,
                        properties: { ...feature.properties, __groupFromSide: group || null }
                    }];
                } catch {
                    return [{ geometry: feature.geometry, properties: feature.properties }];
                }
            } catch (e) {
                return [{ geometry: feature.geometry, properties: feature.properties }];
            }
        };
    }

    /**
     * 主入口：处理 GeoJSON，返回 [{geometry, group}] 列表
     * 优先级：显式 clip 切分 > provinces 映射整体归属
     */
    function processProvinces(geoJson, scheme, groupColors) {
        const lineClips = (scheme.lines || [])
            .filter((line) => !line.hide && line.clipMap)
            .map((line) => ({
                lineDef: line,
                clipMap: line.clipMap,
                clipFn: makeLineClip(line, line.clipMap)
            }));

        const provincesMap = scheme.provinces || {};

        const result = [];
        geoJson.features.forEach((feature) => {
            // 过滤九段线（adchar === 'JD'）
            if (feature.properties.adchar === 'JD') return;

            const name = feature.properties.name;
            if (!provincesMap[name]) return; // scheme 里没定义这个省，跳过

            // 依次用每条 clip line 切
            let pieces = [{ geometry: feature.geometry, properties: feature.properties }];
            for (const clip of lineClips) {
                // 递归对每个 piece 再切一遍
                const next = [];
                for (const piece of pieces) {
                    const clipped = clip.clipFn(piece);
                    next.push(...clipped);
                }
                pieces = next;
            }

            pieces.forEach((piece) => {
                let group;
                if (piece.properties.__groupFromSide) {
                    group = piece.properties.__groupFromSide;
                } else {
                    group = provincesMap[name]; // 整体归属
                }
                if (!group) return;
                if (!groupColors[group]) {
                    console.warn(`[leaflet-china] 分组 "${group}" 不在 legend 中`);
                }
                result.push({
                    geometry: piece.geometry,
                    properties: { ...piece.properties, __group: group }
                });
            });
        });

        return result;
    }

    /* ------------------------------------------------------------------
     * Leaflet map 构建
     * ------------------------------------------------------------------ */
    function buildMap(container, scheme, palette) {
        const map = L.map(container, {
            center: scheme.center || [35, 104], // Leaflet 用 [lat, lng]！
            zoom: scheme.zoom || 5,
            minZoom: 3,
            maxZoom: 8,
            zoomControl: true,
            attributionControl: true,
            wheelPxPerZoomLevel: 120,
            worldCopyJump: false
        });

        map.attributionControl.setPrefix(false);
        map.attributionControl.addAttribution('GeoJSON：DataV.GeoAtlas');

        return map;
    }

    /* ------------------------------------------------------------------
     * 工具栏（全屏 + 还原）
     * ------------------------------------------------------------------ */
    function setupToolbar(map, container, getInitialView, palette) {
        const pos = L.control({ position: 'topright' });
        pos.onAdd = function () {
            const div = L.DomUtil.create('div', 'leaflet-bar cm-bar');
            div.style.cssText = 'display:flex;gap:4px;background:rgba(255,255,255,.55);backdrop-filter:blur(6px);border-radius:6px;padding:4px;box-shadow:0 2px 10px rgba(0,0,0,.06);border:1px solid rgba(140,160,150,.25);';

            // 还原按钮
            const reset = L.DomUtil.create('a', 'cm-reset', div);
            reset.href = '#';
            reset.title = '还原视角';
            reset.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" style="display:block"><path d="M4 12a8 8 0 1 0 2-5.5" stroke="currentColor" stroke-width="2" fill="none"/><path d="M4 4v5h5" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/></svg>';
            L.DomEvent.on(reset, 'click', (e) => {
                L.DomEvent.stopPropagation(e);
                const v = getInitialView();
                map.setView(v.center, v.zoom, { animate: true });
            });

            // 全屏按钮
            const fs = L.DomUtil.create('a', 'cm-fs', div);
            fs.href = '#';
            fs.title = '全屏';
            fs.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" style="display:block"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/></svg>';
            let isFs = false;
            L.DomEvent.on(fs, 'click', (e) => {
                L.DomEvent.stopPropagation(e);
                const wrapper = container.closest('.leaflet-map-block') || container.parentElement;
                if (!isFs) {
                    if (wrapper.requestFullscreen) wrapper.requestFullscreen();
                    else if (wrapper.webkitRequestFullscreen) wrapper.webkitRequestFullscreen();
                    else {
                        wrapper.classList.add('cm-fullscreen-fallback');
                        document.documentElement.classList.add('cm-fullscreen-locked');
                    }
                    isFs = true;
                } else {
                    if (document.fullscreenElement || document.webkitFullscreenElement) {
                        if (document.exitFullscreen) document.exitFullscreen();
                        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
                    } else {
                        const w2 = container.closest('.cm-fullscreen-fallback');
                        if (w2) {
                            w2.classList.remove('cm-fullscreen-fallback');
                            document.documentElement.classList.remove('cm-fullscreen-locked');
                        }
                    }
                    isFs = false;
                }
            });

            return div;
        };
        pos.addTo(map);
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
                const palette = themeColors();
                const groupColors = resolveLegendColors(scheme);

                // 1. 处理省份（clip + 归属）
                const processed = processProvinces(geoJson, scheme, groupColors);

                // 2. 构建 Leaflet map
                const initialView = {
                    center: scheme.center || [35, 104],
                    zoom: scheme.zoom || 5
                };
                const map = buildMap(container, scheme, palette);

                // 3. 渲染省份
                const regionsLayer = L.geoJSON({
                    type: 'FeatureCollection',
                    features: processed.map((p) => turf.feature(p.geometry, p.properties))
                }, {
                    style: (feature) => ({
                        color: palette.border,
                        weight: 0.9,
                        opacity: 0.75,
                        fillColor: groupColors[feature.properties.__group] || palette.landAlt,
                        fillOpacity: 0.85
                    }),
                    onEachFeature: (feature, layer) => {
                        // clip 后的碎片没有 name，tooltip 只显示 group
                        const name = feature.properties.name || '';
                        const group = feature.properties.__group || '';
                        const content = [name, group].filter(Boolean).join(' · ');
                        if (content) {
                            layer.bindTooltip(content, {
                                direction: 'top',
                                offset: [0, -6],
                                opacity: 0.9,
                                className: 'cm-tooltip'
                            });
                        }
                    }
                }).addTo(map);

                // 4. 渲染分界线
                (scheme.lines || []).filter((l) => !l.hide).forEach((line) => {
                    L.polyline(line.coords.map((c) => [c[1], c[0]]), {
                        color: palette.line,
                        weight: line.width || 3,
                        opacity: 0.9,
                        smoothFactor: 0.5,
                        interactive: false
                    }).addTo(map);
                });

                // 5. 渲染闭合 polygon（比如高原框）
                (scheme.polygons || []).forEach((poly) => {
                    L.polygon(poly.coords.map((c) => [c[1], c[0]]), {
                        color: poly.color || palette.line,
                        weight: poly.width || 2,
                        opacity: poly.opacity || 0.7,
                        fill: false,
                        interactive: false
                    }).addTo(map);
                });

                // 6. 渲染文字标签
                (scheme.labels || []).forEach((lbl) => {
                    const icon = L.divIcon({
                        className: 'cm-label',
                        html: `<div style="color:${lbl.color || palette.text};font-size:${lbl.fontSize || 13}px;font-weight:${lbl.fontWeight || 500};transform:rotate(${lbl.rotate || 0}deg);white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,.25);">${lbl.text}</div>`,
                        iconSize: null,
                        iconAnchor: [0, 0],
                        interactive: false
                    });
                    L.marker([lbl.coords[1], lbl.coords[0]], { icon, interactive: false }).addTo(map);
                });
                // 分界线上的 labelPoint
                (scheme.lines || []).filter((l) => !l.hide && l.labelPoint).forEach((line) => {
                    const icon = L.divIcon({
                        className: 'cm-label',
                        html: `<div style="color:${palette.line};font-size:13px;font-weight:500;white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,.25);">${line.label || ''}</div>`,
                        iconSize: null,
                        iconAnchor: [0, 0],
                        interactive: false
                    });
                    L.marker([line.labelPoint[1], line.labelPoint[0]], { icon, interactive: false }).addTo(map);
                });

                // 7. 工具栏
                setupToolbar(map, container, () => ({ ...initialView }), palette);

                // 8. 自适应视野
                if (scheme.autoFitBounds !== false && processed.length) {
                    try {
                        map.fitBounds(regionsLayer.getBounds(), { padding: [20, 20], animate: false });
                        // 保存 fit 后的实际 view 作为 reset 目标
                        initialView.center = map.getCenter();
                        initialView.zoom = map.getZoom();
                    } catch {}
                }

                // 9. 主题切换 → 重绘
                const applyTheme = () => {
                    const p = themeColors();
                    const gc = resolveLegendColors(scheme);
                    regionsLayer.setStyle((feature) => ({
                        color: p.border,
                        weight: 0.9,
                        opacity: 0.75,
                        fillColor: gc[feature.properties.__group] || p.landAlt,
                        fillOpacity: 0.85
                    }));
                };
                document.addEventListener('themechanged', applyTheme);

                // 10. ResizeObserver
                const ro = new ResizeObserver(() => map.invalidateSize());
                ro.observe(container);

                container.dataset.chartId = id;
            })
            .catch((e) => {
                console.error('[leaflet-china] 加载失败', e);
                container.innerHTML = `<p class="cm-error">地图加载失败：${e.message || e}</p>`;
            });
    }

    /* ------------------------------------------------------------------
     * 自动挂载
     * ------------------------------------------------------------------ */
    function autoMount() {
        document.querySelectorAll('[data-leaflet-china]').forEach((el) => mount(el));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoMount);
    } else {
        autoMount();
    }

    window.leafletChina = { mount, init: autoMount };
})();

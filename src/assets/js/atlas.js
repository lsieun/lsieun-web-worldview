/**
 * atlas.js — 全球舆图探索
 * 以 ECharts geo 为底图：文明坐标点 + 三条历史通道，点击坐标联动右侧档案面板。
 */
(function () {
    const chartEl = document.getElementById('atlas-chart');
    const dataEl = document.getElementById('atlas-data');
    const panelEl = document.getElementById('atlas-panel-body');
    if (!chartEl || !dataEl || !panelEl || !window.echarts) return;

    const data = JSON.parse(dataEl.textContent);
    const places = Array.isArray(data.places) ? data.places : [];
    const routes = Array.isArray(data.routes) ? data.routes : [];
    if (!places.length) return;

    const COLORS = {
        gold: '#d8b36b',
        goldDim: '#9c7c43',
        text: '#e6e1d2',
        muted: '#8aa297',
        land: '#163029',
        landHi: '#214539',
        border: '#2c4a40',
        tooltipBg: 'rgba(10, 21, 18, 0.95)',
        routes: { land: '#d8b36b', sea: '#6fa192', med: '#b56a4a' }
    };
    const MONO = 'JetBrains Mono Variable, Consolas, monospace';
    const SERIF = 'Songti SC, Source Han Serif SC, SimSun, serif';

    const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const formatCoord = (place) => {
        const lat = Number(place.lat);
        const lon = Number(place.lon);
        return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'} · ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
    };

    let chart = null;
    let currentId = null;

    function renderPanel(place) {
        const figures = Array.isArray(place.figures) ? place.figures : [];
        const events = Array.isArray(place.events) ? place.events : [];

        const listHtml = (items) => items.length
            ? `<ul class="panel-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
            : '<p class="panel-empty">暂无收录</p>';

        panelEl.innerHTML = `
            <h3 class="panel-name">${escapeHtml(place.name)}</h3>
            <p class="panel-en">${escapeHtml(place.en || '')}</p>
            <div class="panel-meta">
                <span class="panel-chip">${escapeHtml(place.era || '')}</span>
                <span class="panel-chip">${escapeHtml(place.region || '')}</span>
                <span class="panel-chip">${formatCoord(place)}</span>
            </div>
            <p class="panel-desc">${escapeHtml(place.summary || '')}</p>
            <div class="panel-block">
                <p class="panel-block-title">相关人物 / FIGURES</p>
                ${listHtml(figures)}
            </div>
            <div class="panel-block">
                <p class="panel-block-title">历史节点 / EVENTS</p>
                ${listHtml(events)}
            </div>
        `;

        document.querySelectorAll('.hub-btn').forEach((btn) => {
            const active = btn.dataset.hubId === place.id;
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-pressed', String(active));
        });

        currentId = place.id;

        if (chart) {
            chart.dispatchAction({ type: 'downplay', seriesId: 'places' });
            chart.dispatchAction({ type: 'highlight', seriesId: 'places', name: place.name });
        }
    }

    function selectHub(id) {
        const place = places.find((item) => item.id === id);
        if (place) renderPanel(place);
    }

    function buildOption(geoJson) {
        echarts.registerMap('worldview', geoJson);

        const routeSeries = routes.map((route) => ({
            id: `route-${route.id}`,
            name: route.name,
            type: 'lines',
            coordinateSystem: 'geo',
            polyline: true,
            z: 2,
            silent: true,
            effect: {
                show: true,
                period: 7,
                trailLength: 0.22,
                symbol: 'circle',
                symbolSize: 3,
                color: COLORS.routes[route.id] || COLORS.gold
            },
            lineStyle: {
                color: COLORS.routes[route.id] || COLORS.gold,
                width: 1,
                opacity: 0.55,
                curveness: 0.18
            },
            data: [{ coords: route.points }]
        }));

        const placeSeries = {
            id: 'places',
            name: '文明坐标',
            type: 'effectScatter',
            coordinateSystem: 'geo',
            z: 5,
            showEffectOn: 'render',
            rippleEffect: { brushType: 'stroke', scale: 3.2, period: 4.5 },
            symbolSize: (value, params) => 5 + (Number(params.data.weight) || 1) * 2.4,
            itemStyle: { color: COLORS.gold, shadowBlur: 12, shadowColor: 'rgba(216, 179, 107, 0.55)' },
            label: {
                show: chartEl.clientWidth >= 760,
                position: 'right',
                distance: 7,
                formatter: '{b}',
                color: COLORS.text,
                fontFamily: SERIF,
                fontSize: 11,
                textBorderColor: 'rgba(10, 21, 18, 0.9)',
                textBorderWidth: 3
            },
            labelLayout: { hideOverlap: true },
            emphasis: {
                scale: 1.5,
                label: { color: COLORS.gold, fontSize: 12 }
            },
            data: places.map((place) => ({
                id: place.id,
                name: place.name,
                value: [Number(place.lon), Number(place.lat)],
                weight: place.weight || 1
            }))
        };

        return {
            backgroundColor: 'transparent',
            animationDuration: 900,
            animationDurationUpdate: 600,
            tooltip: {
                trigger: 'item',
                backgroundColor: COLORS.tooltipBg,
                borderColor: COLORS.border,
                borderWidth: 1,
                padding: [10, 14],
                textStyle: { color: COLORS.text, fontFamily: MONO, fontSize: 11 },
                extraCssText: 'backdrop-filter: blur(6px); box-shadow: 0 12px 30px -18px #000;',
                formatter: (params) => {
                    if (params.seriesId !== 'places') return '';
                    const place = places.find((item) => item.name === params.name);
                    if (!place) return params.name;
                    return `<strong style="font-family:${SERIF};font-size:14px;font-weight:600;color:${COLORS.gold}">${escapeHtml(place.name)}</strong>`
                        + `<br><span style="color:${COLORS.muted}">${escapeHtml(place.era || '')} · ${escapeHtml(place.region || '')}</span>`;
                }
            },
            geo: {
                map: 'worldview',
                roam: true,
                zoom: 1.1,
                center: [18, 16],
                scaleLimit: { min: 0.9, max: 6 },
                itemStyle: {
                    areaColor: COLORS.land,
                    borderColor: COLORS.border,
                    borderWidth: 0.55
                },
                emphasis: {
                    itemStyle: { areaColor: COLORS.landHi },
                    label: { show: false }
                },
                select: { disabled: true }
            },
            series: [...routeSeries, placeSeries]
        };
    }

    fetch('/assets/data/world.json')
        .then((response) => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        })
        .then((geoJson) => {
            chart = echarts.init(chartEl, null, { renderer: 'canvas' });
            chart.setOption(buildOption(geoJson));

            chart.on('click', (params) => {
                if (params.seriesId === 'places' && params.data && params.data.id) {
                    selectHub(params.data.id);
                }
            });

            document.querySelectorAll('.hub-btn').forEach((btn) => {
                btn.addEventListener('click', () => selectHub(btn.dataset.hubId));
            });

            if (currentId) {
                selectHub(currentId);
            } else {
                selectHub(places[0].id);
            }

            let resizeTimer = null;
            window.addEventListener('resize', () => {
                window.clearTimeout(resizeTimer);
                resizeTimer = window.setTimeout(() => chart.resize(), 160);
            });
        })
        .catch(() => {
            chartEl.innerHTML = '<div class="atlas-loading">舆图数据加载失败，请刷新重试</div>';
        });
})();

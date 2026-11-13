/**
 * person-lifeline.js — 人物生命线图（通用模板 · 支持过滤）
 *
 * 数据结构（#person-lifeline-data 内的 JSON）：
 * {
 *   "start": 1840, "end": 1912,
 *   "people": [{ "id", "name", "birth", "death", "role", "group" }],
 *   "events": [{ "year", "title", "desc", "axis", "focus": ["person_id"], "key", "era" }],
 *   "personalEvents": [{ "year", "person": "person_id", "title", "desc" }]
 * }
 *
 * 左侧竖轴按年份自上而下排列，只画 events 中 axis=true 的大事；
 * 右侧每位人物一条生命线（生卒区间），在世时每遇大事落一个节点，节点内数字为虚岁年龄；
 * 与本人直接相关的事件（events.focus 点名、personalEvents 个人里程碑）用实心节点标出。
 * personalEvents 与同年的大事节点重合时，以个人事件为准。
 *
 * 过滤：订阅全局 "personfilter:change" 事件，根据 visibleIds 重算可见人物并重渲染。
 */
(function () {
    const card = document.querySelector('[data-qtg]');
    const dataEl = document.getElementById('person-lifeline-data');
    if (!card || !dataEl) return;

    let data;
    try {
        data = JSON.parse(dataEl.textContent);
    } catch (e) {
        return;
    }

    const allPeople = data.people || [];
    const allEvents = data.events || [];
    const allPersonal = data.personalEvents || [];
    const axisEvents = allEvents.filter((ev) => ev.axis);
    if (!allPeople.length || !axisEvents.length) return;

    // 初始可见集合：localStorage 优先，其次 person-filter-data.defaults，最后全量
    let visibleIds = (function initialVisible() {
        const filterEl = document.getElementById('person-filter-data');
        if (!filterEl) return allPeople.map((p) => p.id);
        let fd = {};
        try { fd = JSON.parse(filterEl.textContent); } catch (_) { /* ignore */ }
        const valid = new Set(allPeople.map((p) => p.id));
        let stored;
        try {
            const raw = localStorage.getItem(fd.storageKey || 'person-filter');
            if (raw) {
                const arr = JSON.parse(raw)[filterEl.dataset.page || ''];
                if (Array.isArray(arr)) stored = arr;
            }
        } catch (_) { /* ignore */ }
        const base = stored || (fd.defaults && fd.defaults.length ? fd.defaults : fd.allIds);
        return (base || []).filter((id) => valid.has(id));
    })();

    const START = Number(data.start) || Math.min(...allPeople.map((p) => p.birth));
    const END = Number(data.end) || Math.max(...allPeople.map((p) => p.death));
    const TOP = 14;
    const PPY = Number(data.pixelsPerYear) || 18;
    const BOTTOM = 26;
    const AXIS_W = 200;
    const AXIS_X = 48;
    const MIN_COL = 84;

    function visiblePeople() {
        const set = new Set(visibleIds);
        return allPeople.filter((p) => set.has(p.id));
    }

    const scroll = card.querySelector('[data-qtg-scroll]');
    const head = card.querySelector('[data-qtg-head]');
    const body = card.querySelector('[data-qtg-body]');
    const tip = card.querySelector('[data-qtg-tip]');
    const tipTitle = card.querySelector('[data-qtg-tip-title]');
    const tipMeta = card.querySelector('[data-qtg-tip-meta]');
    const tipDesc = card.querySelector('[data-qtg-tip-desc]');

    const yOf = (year) => TOP + (year - START) * PPY;
    const lifeText = (p) => `${p.birthLabel || p.birth}–${p.deathLabel || p.death}`;
    const ageOf = (p, year) => year - p.birth + 1;

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    // ---------- 悬浮提示 ----------
    function positionTip(clientX, clientY) {
        const rect = card.getBoundingClientRect();
        const tw = tip.offsetWidth;
        const th = tip.offsetHeight;
        let x = clientX - rect.left + 14;
        let y = clientY - rect.top + 14;
        if (x + tw > rect.width - 8) x = Math.max(8, clientX - rect.left - tw - 14);
        if (y + th > rect.height - 8) y = Math.max(8, clientY - rect.top - th - 14);
        tip.style.left = `${x}px`;
        tip.style.top = `${y}px`;
    }

    function showTip(node, person, item, age) {
        tipTitle.textContent = `${item.year} ${item.title}`;
        tipMeta.textContent = `${person.name} · ${age} 岁（虚岁）`;
        tipDesc.textContent = item.desc || '';
        tipDesc.hidden = !item.desc;
        tip.classList.add('is-show');
        tip.setAttribute('aria-hidden', 'false');
        const rect = node.getBoundingClientRect();
        positionTip(rect.left + rect.width / 2, rect.top + rect.height / 2);
    }

    function hideTip() {
        tip.classList.remove('is-show');
        tip.setAttribute('aria-hidden', 'true');
    }

    // ---------- 渲染 ----------
    function render() {
        const people = visiblePeople();
        if (!people.length) {
            head.textContent = '';
            body.textContent = '';
            body.appendChild(el('div', 'qtg-empty', '请在上方选择至少一位人物'));
            body.style.height = '60px';
            return;
        }

        const avail = scroll.clientWidth;
        const colW = Math.max(MIN_COL, Math.floor((avail - AXIS_W) / people.length));
        const height = TOP + (END - START) * PPY + BOTTOM;
        const tableWidth = AXIS_W + people.length * colW;
        // 图表宽于可用版心时退回容器内横滚（CSS 据此切断列头吸顶，与窄屏一致）
        card.classList.toggle('is-overflow', tableWidth > avail);

        card.style.setProperty('--qtg-axis', `${AXIS_W}px`);
        card.style.setProperty('--qtg-col', `${colW}px`);
        card.style.setProperty('--qtg-h', `${height}px`);
        head.style.width = `${tableWidth}px`;
        body.style.width = `${tableWidth}px`;
        body.style.height = `${height}px`;

        // 1. 列头
        head.textContent = '';
        head.appendChild(el('div', 'qtg-head-corner', data.axisLabel || '时间轴'));
        people.forEach((p) => {
            const item = el('div', 'qtg-head-person');
            item.title = `${p.role}（${lifeText(p)}）`;
            item.appendChild(el('span', 'qtg-head-name', p.name));
            item.appendChild(el('span', 'qtg-head-life', lifeText(p)));
            head.appendChild(item);
        });

        // 2. 十年网格与年份刻度
        body.textContent = '';
        for (let year = START; year <= END - 2; year += 10) {
            const y = yOf(year);
            const line = el('div', 'qtg-grid-line');
            line.style.top = `${y}px`;
            body.appendChild(line);

            const tick = el('div', 'qtg-tick');
            tick.style.top = `${y}px`;
            body.appendChild(tick);

            const label = el('span', 'qtg-year-label', String(year));
            label.style.top = `${y - 7}px`;
            body.appendChild(label);
        }

        const axis = el('div', 'qtg-axis-line');
        axis.style.left = `${AXIS_X}px`;
        axis.style.height = `${height - BOTTOM}px`;
        body.appendChild(axis);

        // 3. 竖轴大事：圆点 + 标签（标签过密时向下轻推）
        let prevBottom = -Infinity;
        [...axisEvents].sort((a, b) => a.year - b.year).forEach((ev) => {
            const y = yOf(ev.year);

            const dot = el('span', `qtg-ev-dot${ev.key ? ' is-key' : ''}`);
            dot.style.top = `${y}px`;
            body.appendChild(dot);

            let labelTop = y - 9;
            if (labelTop < prevBottom + 2) labelTop = prevBottom + 2;
            labelTop = Math.max(0, labelTop);
            prevBottom = labelTop + 18;

            const label = el('div', `qtg-ev-label${ev.key ? ' is-key' : ''}`);
            label.style.top = `${labelTop}px`;
            label.appendChild(el('span', 'qtg-ev-year', String(ev.year)));
            label.appendChild(el('span', 'qtg-ev-title', ev.title));
            body.appendChild(label);
        });

        // 4. 人物生命线与节点
        people.forEach((p, index) => {
            const lane = el('div', 'qtg-lane');
            lane.style.left = `${AXIS_W + index * colW}px`;
            lane.style.width = `${colW}px`;

            const birthY = yOf(p.birth);
            const deathY = yOf(p.death);
            const limit = height - BOTTOM + 6;
            const lifeTop = Math.max(0, birthY);
            const lifeBottom = Math.min(limit, deathY);

            const life = el('div', 'qtg-life');
            if (birthY < 0) life.classList.add('is-cut-top');
            if (deathY > limit) life.classList.add('is-cut-bottom');
            life.style.top = `${lifeTop}px`;
            life.style.height = `${Math.max(lifeBottom - lifeTop, 6)}px`;
            life.title = `${p.name}：${lifeText(p)}`;
            lane.appendChild(life);

            const personal = allPersonal.filter((ev) => ev.person === p.id);
            const personalYears = new Set(personal.map((ev) => ev.year));
            const nodes = [];

            axisEvents.forEach((ev) => {
                if (ev.year >= p.birth && ev.year <= p.death && !personalYears.has(ev.year)) {
                    nodes.push({
                        year: ev.year,
                        title: ev.title,
                        desc: ev.desc,
                        focus: (ev.focus || []).includes(p.id)
                    });
                }
            });
            personal.forEach((ev) => {
                nodes.push({ year: ev.year, title: ev.title, desc: ev.desc, focus: true });
            });
            nodes.sort((a, b) => a.year - b.year);

            let lastBottom = -Infinity;
            nodes.forEach((item) => {
                const y = yOf(item.year);
                let top = Math.max(0, y - 11);
                if (top < lastBottom + 3) top = lastBottom + 3;
                lastBottom = top + 22;

                const age = ageOf(p, item.year);
                const node = el('button', `qtg-node${item.focus ? ' is-focus' : ''}`, String(age));
                node.type = 'button';
                node.style.top = `${top}px`;
                node.setAttribute('aria-label', `${item.year} ${item.title}，${p.name} ${age} 岁`);

                node.addEventListener('pointerenter', () => showTip(node, p, item, age));
                node.addEventListener('pointermove', (e) => positionTip(e.clientX, e.clientY));
                node.addEventListener('pointerleave', hideTip);
                node.addEventListener('focus', () => showTip(node, p, item, age));
                node.addEventListener('blur', hideTip);
                lane.appendChild(node);
            });

            body.appendChild(lane);
        });
    }

    // 列头吸顶：避让站点自身的 sticky 头部
    const siteHeader = document.querySelector('.site-header');
    const syncHeadTop = () => {
        card.style.setProperty('--qtg-head-top', `${siteHeader ? siteHeader.offsetHeight : 0}px`);
    };
    syncHeadTop();

    window.addEventListener('personfilter:change', (e) => {
        visibleIds = e.detail.visibleIds;
        hideTip();
        render();
    });

    let frame = 0;
    window.addEventListener('resize', () => {
        syncHeadTop();
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
            hideTip();
            render();
        });
    });

    render();
})();

/**
 * person-age-table.js — 人物年龄明细表（过滤 + 列头聚焦）
 *
 * 支持两种交互：
 *   1. 订阅 personfilter:change，根据 visibleIds 显示/隐藏对应人物列
 *   2. 点击可见的人物列头聚焦该列、再次点击取消
 * 主键驱动：所有列头和单元格用 data-person 存稳定 id，筛选时只切 display 不改 DOM 顺序。
 */
(function () {
    const cards = document.querySelectorAll('[data-qt-card]');
    if (!cards.length) return;

    const siteHeader = document.querySelector('.site-header');
    const syncHeadTop = () => {
        const top = `${siteHeader ? siteHeader.offsetHeight : 0}px`;
        cards.forEach((card) => card.style.setProperty('--qt-head-top', top));
    };
    syncHeadTop();
    window.addEventListener('resize', syncHeadTop);

    function applyFilter(visibleIds) {
        const set = new Set(visibleIds || []);
        cards.forEach((card) => {
            const heads = card.querySelectorAll('[data-qt-person]');
            const cells = card.querySelectorAll('[data-person]');
            heads.forEach((h) => {
                const on = set.has(h.dataset.qtPerson);
                h.style.display = on ? '' : 'none';
                if (!on && h.classList.contains('is-focus')) h.classList.remove('is-focus');
            });
            cells.forEach((c) => {
                const on = set.has(c.dataset.person);
                c.style.display = on ? '' : 'none';
                if (!on && c.classList.contains('is-focus')) c.classList.remove('is-focus');
            });
            const count = heads.length;
            const headsArr = [...heads];
            const onCount = headsArr.reduce((n, h) => (set.has(h.dataset.qtPerson) ? n + 1 : n), 0);
            const table = card.querySelector('[data-qt-table]');
            if (table) table.style.setProperty('--qt-count', onCount || count);
            if (card.dataset.qtFocus && (!onCount || !set.has(card.dataset.qtFocus))) {
                card.removeAttribute('data-qt-focus');
                heads.forEach((h) => h.classList.remove('is-focus'));
                cells.forEach((c) => c.classList.remove('is-focus'));
            }
        });
    }

    window.addEventListener('personfilter:change', (e) => applyFilter(e.detail.visibleIds));

    // 和 person-filter.js 用同一套初始可见集合：localStorage > person-filter-data.defaults > 全量
    function initialVisibleIds() {
        const filterEl = document.getElementById('person-filter-data');
        if (!filterEl) return null;
        let fd = {};
        try { fd = JSON.parse(filterEl.textContent); } catch (_) { /* ignore */ }
        const pageKey = filterEl.dataset.page || '';
        const defaults = (fd.defaults && fd.defaults.length) ? fd.defaults : (fd.allIds || []);
        let stored;
        try {
            const raw = localStorage.getItem(fd.storageKey || 'person-filter');
            if (raw) {
                const parsed = JSON.parse(raw);
                const arr = parsed[pageKey];
                if (Array.isArray(arr)) stored = arr;
            }
        } catch (_) { /* ignore */ }
        const base = stored || defaults;
        const valid = new Set(fd.allIds || []);
        return base.filter((id) => valid.has(id));
    }

    const init = initialVisibleIds();
    if (init) {
        applyFilter(init);
    }

    // 保险 fallback：如果上面都没拿到，就等 change 事件
    let fallbackTimer = setTimeout(() => {
        const head = cards[0] && cards[0].querySelector('[data-qt-person]:not([style*="none"])');
        if (!head && !init) {
            const allIds = [...cards[0].querySelectorAll('[data-qt-person]')].map((h) => h.dataset.qtPerson);
            applyFilter(allIds);
        }
    }, 150);
    window.addEventListener('personfilter:change', () => clearTimeout(fallbackTimer), { once: true });

    cards.forEach((card) => {
        const heads = card.querySelectorAll('[data-qt-person]');
        const cells = card.querySelectorAll('.qt-age');

        heads.forEach((head) => {
            head.addEventListener('click', () => {
                if (head.style.display === 'none') return;
                const next = card.dataset.qtFocus === head.dataset.qtPerson ? '' : head.dataset.qtPerson;
                if (next) {
                    card.setAttribute('data-qt-focus', next);
                } else {
                    card.removeAttribute('data-qt-focus');
                }
                heads.forEach((h) => h.classList.toggle('is-focus', h.dataset.qtPerson === next));
                cells.forEach((c) => c.classList.toggle('is-focus', c.dataset.person === next));
            });
        });
    });
})();

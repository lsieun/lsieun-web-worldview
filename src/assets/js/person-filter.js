/**
 * person-filter.js — 人物分组过滤器
 *
 * 页面上有 .pf-card + #person-filter-data + person-filter.js 即可使用。
 * 状态存储：localStorage[storageKey][pageKey] = [id, id, ...]
 *   pageKey 默认取 person-filter-data 的 data-page，没有就退回全选所有人物。
 * 变更时派发全局事件 "personfilter:change"，detail = { visibleIds }。
 * 两个视图（生命线 / 表格）订阅后用主键重建可见数组、重渲染。
 */
(function () {
    const dataEl = document.getElementById('person-filter-data');
    const card = document.querySelector('[data-pf]');
    if (!dataEl || !card) return;

    const data = JSON.parse(dataEl.textContent);
    const pageKey = dataEl.dataset.page || '';
    const storageRoot = data.storageKey || 'person-filter';
    const defaults = (data.defaults && data.defaults.length) ? data.defaults : data.allIds.slice();

    function loadState() {
        try {
            const raw = localStorage.getItem(storageRoot);
            if (raw) {
                const parsed = JSON.parse(raw);
                const arr = parsed[pageKey];
                if (Array.isArray(arr)) return arr.filter((id) => data.allIds.includes(id));
            }
        } catch (_) { /* ignore */ }
        return defaults.slice();
    }

    function saveState(ids) {
        try {
            const raw = localStorage.getItem(storageRoot);
            const parsed = raw ? JSON.parse(raw) : {};
            parsed[pageKey] = ids;
            localStorage.setItem(storageRoot, JSON.stringify(parsed));
        } catch (_) { /* storage disabled */ }
    }

    let visibleIds = loadState();

    function emit() {
        const ev = new CustomEvent('personfilter:change', {
            detail: { visibleIds: visibleIds.slice() }
        });
        window.dispatchEvent(ev);
    }

    // ---------- DOM 同步 ----------
    function syncCheckboxes() {
        const ids = new Set(visibleIds);
        card.querySelectorAll('[data-pf-person]').forEach((box) => {
            box.checked = ids.has(box.value);
        });
        card.querySelectorAll('[data-pf-group-check]').forEach((box) => {
            const gid = box.dataset.pfGroupCheck;
            const groupBoxes = card.querySelectorAll(`[data-pf-group="${gid}"] [data-pf-person]`);
            const checked = [...groupBoxes].filter((b) => ids.has(b.value)).length;
            box.checked = groupBoxes.length > 0 && checked === groupBoxes.length;
            box.indeterminate = checked > 0 && checked < groupBoxes.length;
        });
        const count = card.querySelector('[data-pf-count]');
        if (count) count.textContent = visibleIds.length;
    }

    // ---------- 事件 ----------
    card.addEventListener('change', (e) => {
        const target = e.target;
        if (!(target instanceof HTMLInputElement)) return;
        if (target.matches('[data-pf-person]')) {
            if (target.checked) {
                if (!visibleIds.includes(target.value)) visibleIds.push(target.value);
            } else {
                visibleIds = visibleIds.filter((id) => id !== target.value);
            }
            syncCheckboxes();
            saveState(visibleIds);
            emit();
        } else if (target.matches('[data-pf-group-check]')) {
            const gid = target.dataset.pfGroupCheck;
            const groupBoxes = [...card.querySelectorAll(`[data-pf-group="${gid}"] [data-pf-person]`)];
            const idsInGroup = groupBoxes.map((b) => b.value);
            if (target.checked) {
                idsInGroup.forEach((id) => { if (!visibleIds.includes(id)) visibleIds.push(id); });
            } else {
                visibleIds = visibleIds.filter((id) => !idsInGroup.includes(id));
            }
            syncCheckboxes();
            saveState(visibleIds);
            emit();
        }
    });

    card.addEventListener('click', (e) => {
        const action = e.target.dataset.pfAction;
        if (!action) return;
        if (action === 'all') visibleIds = data.allIds.slice();
        else if (action === 'none') visibleIds = [];
        else if (action === 'default') visibleIds = defaults.slice();
        syncCheckboxes();
        saveState(visibleIds);
        emit();
    });

    // ---------- 初始化 ----------
    // 延后到 DOMContentLoaded 之后，确保后续视图脚本（person-lifeline.js 等）已注册好 change 监听器
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { syncCheckboxes(); emit(); });
    } else {
        syncCheckboxes();
        emit();
    }
})();

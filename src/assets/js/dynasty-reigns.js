/*
 * dynasty-reigns.js — 朝代帝系双视图联动
 *
 * 无 JS 时两个完整视图按文档流展示；有 JS 时启用单面板切换。
 * hash 同时记录视图与人物，支持深链及浏览器前进、后退。
 */
(function () {
    const root = document.querySelector('[data-reign-root]');
    if (!root) return;

    const panels = new Map(
        Array.from(root.querySelectorAll('[data-reign-panel]')).map((panel) => [panel.dataset.reignPanel, panel])
    );
    const buttons = Array.from(root.querySelectorAll('[data-reign-switch]'));
    if (!panels.has('timeline') || !panels.has('kinship') || !buttons.length) return;

    const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let activeView = 'timeline';

    root.classList.add('is-enhanced');

    function clearHighlights() {
        root.querySelectorAll('.is-target, .is-lineage').forEach((node) => {
            node.classList.remove('is-target', 'is-lineage');
        });
    }

    function highlightKinship(target) {
        const visited = new Set();
        let current = target;
        while (current && !visited.has(current.dataset.treePerson)) {
            const id = current.dataset.treePerson;
            visited.add(id);
            current.classList.add('is-lineage');
            const parentId = (current.dataset.parents || '').split(/\s+/).find(Boolean);
            current = parentId ? root.querySelector(`[data-tree-person="${parentId}"]`) : null;
        }
    }

    function personTarget(view, person) {
        if (!person) return null;
        return view === 'timeline'
            ? root.querySelector(`[data-reign-person="${person}"]`)
            : root.querySelector(`[data-tree-person="${person}"]`);
    }

    function writeHash(hash, mode) {
        if (!mode || window.location.hash === hash) return;
        if (mode === 'replace') history.replaceState(null, '', hash);
        else history.pushState(null, '', hash);
    }

    function showView(view, options = {}) {
        if (!panels.has(view)) return;
        const {
            person = '',
            historyMode = null,
            scroll = true,
            focus = Boolean(person)
        } = options;
        const target = personTarget(view, person);
        if (person && !target) return;

        activeView = view;
        for (const [key, panel] of panels) panel.hidden = key !== view;
        buttons.forEach((button) => {
            const on = button.dataset.reignSwitch === view;
            button.classList.toggle('is-active', on);
            button.setAttribute('aria-pressed', String(on));
        });

        clearHighlights();
        if (target) {
            target.classList.add('is-target');
            if (view === 'kinship') highlightKinship(target);
        }

        const hash = person
            ? `#${view === 'timeline' ? 'timeline' : 'tree'}-${person}`
            : `#${view === 'timeline' ? 'reign-timeline' : 'reign-kinship'}`;
        writeHash(hash, historyMode);

        if (!scroll) return;
        requestAnimationFrame(() => {
            const destination = target || panels.get(view);
            destination.scrollIntoView({
                behavior: reduceMotion() ? 'auto' : 'smooth',
                block: 'start',
                inline: view === 'kinship' && target ? 'center' : 'nearest'
            });
            if (focus && target) target.focus({ preventScroll: true });
        });
    }

    buttons.forEach((button) => {
        button.addEventListener('click', () => {
            const view = button.dataset.reignSwitch;
            if (view === activeView && !root.querySelector('.is-target')) return;
            showView(view, { historyMode: 'push' });
        });
    });

    root.addEventListener('click', (event) => {
        const link = event.target.closest('[data-reign-link]');
        if (!link || !root.contains(link)) return;
        const view = link.dataset.reignLink;
        const person = link.dataset.person;
        if (!personTarget(view, person)) return;
        event.preventDefault();
        showView(view, { person, historyMode: 'push' });
    });

    function syncFromHash(scroll = true) {
        const hash = window.location.hash;
        let match = hash.match(/^#(timeline|tree)-(.+)$/);
        if (match) {
            const view = match[1] === 'timeline' ? 'timeline' : 'kinship';
            const person = decodeURIComponent(match[2]);
            if (personTarget(view, person)) {
                showView(view, { person, scroll });
                return;
            }
        }

        match = hash.match(/^#reign-(timeline|kinship)$/);
        if (match) {
            showView(match[1], { scroll });
            return;
        }
        showView('timeline', { scroll: false });
    }

    window.addEventListener('hashchange', () => syncFromHash(true));
    syncFromHash(true);
})();

/*
 * family-tree-scroll.js — 谱牒长卷增强
 *
 * 悬停/聚焦点亮从始祖到该人的世系路径，其余节点淡出；
 * 点击打开人物小传，Esc 或关闭按钮收起。
 */
(function () {
    const root = document.querySelector('[data-lineage-scroll]');
    if (!root) return;

    const nodes = Array.from(root.querySelectorAll('.lh-node'));
    const edges = Array.from(root.querySelectorAll('.lh-edge'));
    const detail = root.querySelector('[data-lineage-detail]');
    const closeButton = root.querySelector('[data-lineage-close]');
    if (!nodes.length || !detail) return;

    const nodeById = new Map(nodes.map((node) => [node.dataset.person, node]));
    const parents = new Map(nodes.map((node) => [node.dataset.person, (node.dataset.parent || '').split(' ')[0] || '']));
    const branchLabels = {
        root: '始祖',
        sunqiang: '孙羌支',
        sunjian: '孙坚支',
        sunjing: '孙静支'
    };

    let hoverId = '';
    let activeId = '';

    function lineageFor(person) {
        const lineage = new Set();
        let current = person;
        while (current && !lineage.has(current)) {
            lineage.add(current);
            current = parents.get(current) || '';
        }
        return lineage;
    }

    function paint(person) {
        const lineage = person ? lineageFor(person) : new Set();
        root.classList.toggle('is-focused', Boolean(person));
        nodes.forEach((node) => {
            const inLineage = lineage.has(node.dataset.person);
            node.classList.toggle('is-lineage', inLineage);
            node.classList.toggle('is-active', node.dataset.person === activeId);
        });
        edges.forEach((edge) => {
            edge.classList.toggle('is-lineage', lineage.has(edge.dataset.from) && lineage.has(edge.dataset.to));
        });
    }

    function refresh() {
        paint(activeId || hoverId);
    }

    function fillDetail(node) {
        const emperor = node.dataset.emperor === 'true';
        const rank = node.dataset.rank;
        const fields = {
            branch: branchLabels[node.dataset.branch] || '',
            name: node.dataset.name,
            title: node.dataset.title,
            rank: rank === '始' ? '本谱始祖' : `同父兄弟第 ${rank}`,
            imperial: emperor ? node.dataset.imperial : '未称帝',
            reign: node.dataset.reign || ''
        };
        Object.entries(fields).forEach(([key, value]) => {
            const target = detail.querySelector(`[data-field="${key}"]`);
            if (target) target.textContent = value;
        });
        detail.dataset.branch = node.dataset.branch;
        const link = detail.querySelector('[data-field="link"]');
        if (link) {
            if (node.dataset.href) {
                link.href = node.dataset.href;
                link.hidden = false;
            } else {
                link.removeAttribute('href');
                link.hidden = true;
            }
        }
    }

    function openDetail(node) {
        activeId = node.dataset.person;
        fillDetail(node);
        detail.hidden = false;
        refresh();
    }

    function closeDetail() {
        activeId = '';
        detail.hidden = true;
        refresh();
    }

    nodes.forEach((node) => {
        node.addEventListener('pointerenter', () => {
            hoverId = node.dataset.person;
            refresh();
        });
        node.addEventListener('pointerleave', () => {
            hoverId = '';
            refresh();
        });
        node.addEventListener('focus', () => {
            hoverId = node.dataset.person;
            refresh();
        });
        node.addEventListener('blur', () => {
            hoverId = '';
            refresh();
        });
        node.addEventListener('click', (event) => {
            event.preventDefault();
            openDetail(node);
        });
        node.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            openDetail(node);
        });
    });

    closeButton?.addEventListener('click', closeDetail);
    root.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !detail.hidden) closeDetail();
    });
})();

/**
 * chronicle.js — 史册：左侧朝代目录与分组表的滚动联动
 *
 * 左侧朝代目录（chr-toc）固定悬浮；页面滚到某一朝代分组时，高亮对应目录项，
 * 并把该项滚入目录可见范围。点击目录项平滑跳转到对应分组。
 * 原「纪年带」因横向滚动条交互不佳已移除，其吸顶高亮逻辑由本目录承接。
 */
(function () {
    const root = document.querySelector('[data-chr-root]');
    const toc = document.querySelector('[data-chr-toc]');
    if (!root || !toc) return;

    const links = Array.from(toc.querySelectorAll('[data-chr-link]'));
    const groups = Array.from(root.querySelectorAll('[data-chr-group]'));
    if (!links.length || !groups.length) return;

    const byId = new Map(links.map((link) => [link.dataset.chrLink, link]));
    let activeId = '';

    function setActive(id) {
        if (!id || id === activeId) return;
        activeId = id;
        links.forEach((link) => {
            const on = link.dataset.chrLink === id;
            link.classList.toggle('is-active', on);
            if (on) link.setAttribute('aria-current', 'true');
            else link.removeAttribute('aria-current');
        });

        const link = byId.get(id);
        if (!link) return;
        link.scrollIntoView({ block: 'nearest' });
    }

    const observer = new IntersectionObserver((entries) => {
        const visible = entries
            .filter((entry) => entry.isIntersecting)
            .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length) setActive(visible[0].target.dataset.chrGroup);
    }, { rootMargin: '-140px 0px -55% 0px', threshold: 0 });

    groups.forEach((group) => observer.observe(group));

    toc.addEventListener('click', (event) => {
        const link = event.target.closest('[data-chr-link]');
        if (!link) return;
        const id = link.dataset.chrLink;
        const target = document.getElementById(`dynasty-${id}`);
        if (!target) return;

        event.preventDefault();
        setActive(id);
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
        history.replaceState(null, '', `#dynasty-${id}`);
    });
})();

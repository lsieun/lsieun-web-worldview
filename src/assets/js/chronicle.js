/**
 * chronicle.js — 史册：朝代条与分组表的滚动联动
 *
 * 上方朝代条吸顶并横向滚动；页面滚到某一朝代分组时，高亮对应朝代段，
 * 并把该段滚入条内的可见范围。点击朝代段平滑跳转到对应分组。
 */
(function () {
    const root = document.querySelector('[data-chr-root]');
    const ribbon = document.querySelector('[data-chr-ribbon]');
    if (!root || !ribbon) return;

    const links = Array.from(ribbon.querySelectorAll('[data-chr-link]'));
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
        const left = link.offsetLeft - (ribbon.clientWidth - link.offsetWidth) / 2;
        ribbon.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
    }

    const observer = new IntersectionObserver((entries) => {
        const visible = entries
            .filter((entry) => entry.isIntersecting)
            .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length) setActive(visible[0].target.dataset.chrGroup);
    }, { rootMargin: '-140px 0px -55% 0px', threshold: 0 });

    groups.forEach((group) => observer.observe(group));

    ribbon.addEventListener('click', (event) => {
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

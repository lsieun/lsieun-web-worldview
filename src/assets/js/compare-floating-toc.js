/**
 * compare-floating-toc.js — 中外对比页左右浮动导航
 * 滚动到对应区块时联动高亮；宽屏才显示（<1280px CSS 已隐藏）
 */
(function () {
    const blocks = document.querySelectorAll('[data-cmp-block]');
    const tocLinks = document.querySelectorAll('[data-cmp-toc]');
    if (!blocks.length || !tocLinks.length) return;

    // 窗口较小时隐藏 toc
    const MIN_W = 1280;
    function updateVisibility() {
        const w = window.innerWidth;
        const visible = w >= MIN_W;
        document.querySelectorAll('.cmp-toc').forEach((el) => {
            el.classList.toggle('is-visible', visible);
        });
    }

    // 滚动高亮
    let currentId = null;
    const THRESHOLD = 120; // 距顶部多少 px 时切换

    function onScroll() {
        const scrollY = window.scrollY + THRESHOLD;
        let foundId = null;
        for (const block of blocks) {
            if (block.offsetTop <= scrollY) foundId = block.id;
        }
        if (foundId !== currentId) {
            currentId = foundId;
            tocLinks.forEach((link) => {
                link.classList.toggle('is-active', link.getAttribute('data-cmp-toc') === foundId);
            });
        }
    }

    updateVisibility();
    onScroll();
    window.addEventListener('resize', updateVisibility);
    window.addEventListener('scroll', onScroll, { passive: true });
})();

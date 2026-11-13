/**
 * toc.js — 详情页浮动目录（固定左侧面板）
 * 扫描 <main> 内的 h2/h3，生成固定定位的浮动目录，支持：
 *   - 整体收缩/展开（持久化 localStorage）
 *   - h2 单节折叠/展开
 *   - 滚动联动高亮当前可见章节
 *   - 回到顶部按钮
 *   - viewport < 1360px 自动隐藏
 *
 * 本脚本自创建 DOM，不依赖页面预设容器；页面需引入本脚本即可生效。
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'wv-toc-collapsed';
    const FOLD_KEY_PREFIX = 'wv-toc-fold-';
    const MIN_WIDTH = 1360;

    function slugify(text) {
        return text
            .trim()
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^\p{L}\p{N}\-]/gu, '')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
    }

    function ensureIds(headings) {
        const seen = new Set();
        headings.forEach((h, i) => {
            if (!h.id) {
                let id = slugify(h.textContent) || `section-${i}`;
                if (seen.has(id)) id = `${id}-${i}`;
                seen.add(id);
                h.id = id;
            }
        });
    }

    function buildToc(headings) {
        const root = document.createElement('nav');
        root.className = 'toc-float';
        root.setAttribute('aria-label', '目录');

        // 头部：标题 + 收缩按钮
        const head = document.createElement('div');
        head.className = 'toc-head';
        head.innerHTML = `
            <button class="toc-toggle" type="button" aria-expanded="true" aria-label="收起目录">
                <span class="toc-toggle-icon" aria-hidden="true">‹</span>
                <span class="toc-toggle-label">目录</span>
            </button>
        `;
        root.appendChild(head);

        // 列表容器
        const listWrap = document.createElement('div');
        listWrap.className = 'toc-body';

        const ul = document.createElement('ul');
        ul.className = 'toc-list';

        let currentUl = null;

        headings.forEach((h) => {
            const a = document.createElement('a');
            a.href = `#${h.id}`;
            a.textContent = h.textContent.trim();
            a.dataset.target = h.id;

            if (h.tagName === 'H2') {
                if (currentUl) ul.appendChild(currentUl);

                const outerLi = document.createElement('li');
                outerLi.className = 'toc-h2';

                const headRow = document.createElement('div');
                headRow.className = 'toc-h2-row';

                const foldBtn = document.createElement('button');
                foldBtn.type = 'button';
                foldBtn.className = 'toc-fold-btn';
                foldBtn.setAttribute('aria-label', '折叠子章节');
                foldBtn.setAttribute('aria-expanded', 'true');
                foldBtn.innerHTML = '<span aria-hidden="true">▸</span>';

                const linkWrap = document.createElement('span');
                linkWrap.className = 'toc-link-wrap';
                linkWrap.appendChild(a);

                headRow.appendChild(foldBtn);
                headRow.appendChild(linkWrap);
                outerLi.appendChild(headRow);

                const innerUl = document.createElement('ul');
                innerUl.className = 'toc-sublist';

                outerLi.appendChild(innerUl);
                ul.appendChild(outerLi);

                currentUl = innerUl;

                const target = h.id;
                const key = FOLD_KEY_PREFIX + target;

                const applyState = (folded) => {
                    outerLi.classList.toggle('is-folded', folded);
                    foldBtn.setAttribute('aria-expanded', !folded);
                    foldBtn.setAttribute('aria-label', folded ? '展开子章节' : '折叠子章节');
                    localStorage.setItem(key, folded ? '1' : '0');
                };

                foldBtn.addEventListener('click', () => {
                    applyState(!outerLi.classList.contains('is-folded'));
                });

                // 点击 h2 链接本身自动展开
                linkWrap.addEventListener('click', () => {
                    if (outerLi.classList.contains('is-folded')) {
                        applyState(false);
                    }
                });

                if (localStorage.getItem(key) === '1') applyState(true);
            } else if (h.tagName === 'H3' && currentUl) {
                const h3Li = document.createElement('li');
                h3Li.className = 'toc-h3';
                h3Li.appendChild(a);
                currentUl.appendChild(h3Li);
            }
        });

        if (currentUl) ul.appendChild(currentUl);

        listWrap.appendChild(ul);
        root.appendChild(listWrap);

        // 底部：回到顶部按钮
        const foot = document.createElement('div');
        foot.className = 'toc-foot';
        foot.innerHTML = `
            <button class="toc-top" type="button" aria-label="回到顶部">
                <span aria-hidden="true">↑</span>
                <span>回到顶部</span>
            </button>
        `;
        root.appendChild(foot);

        // 绑定整体收缩按钮
        const toggleBtn = head.querySelector('.toc-toggle');
        toggleBtn.addEventListener('click', () => {
            const isCollapsed = root.classList.toggle('is-collapsed');
            toggleBtn.setAttribute('aria-expanded', !isCollapsed);
            toggleBtn.setAttribute('aria-label', isCollapsed ? '展开目录' : '收起目录');
            localStorage.setItem(STORAGE_KEY, isCollapsed ? '1' : '0');
        });

        // 应用整体收缩持久化
        if (localStorage.getItem(STORAGE_KEY) === '1') {
            root.classList.add('is-collapsed');
            toggleBtn.setAttribute('aria-expanded', 'false');
            toggleBtn.setAttribute('aria-label', '展开目录');
        }

        // 绑定回到顶部
        const topBtn = foot.querySelector('.toc-top');
        topBtn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        document.body.appendChild(root);
        return root;
    }

    function setupScrollHighlight(headings, toc) {
        const links = toc.querySelectorAll('.toc-list a');
        const linkMap = new Map();
        links.forEach((a) => linkMap.set(a.dataset.target, a));

        let activeId = null;
        const THRESHOLD_TOP = 120;

        function onScroll() {
            let current = null;
            for (const h of headings) {
                const rect = h.getBoundingClientRect();
                if (rect.top - THRESHOLD_TOP <= 0) {
                    current = h.id;
                } else {
                    break;
                }
            }
            if (!current) {
                const last = headings[headings.length - 1];
                if (last) current = last.id;
            }

            if (current === activeId) return;
            activeId = current;

            links.forEach((a) => a.classList.remove('is-active'));
            if (current) {
                const activeLink = linkMap.get(current);
                if (activeLink) {
                    activeLink.classList.add('is-active');
                    const h2Parent = activeLink.closest('.toc-h2');
                    if (h2Parent && h2Parent.classList.contains('is-folded')) {
                        h2Parent.classList.remove('is-folded');
                        const foldBtn = h2Parent.querySelector('.toc-fold-btn');
                        if (foldBtn) {
                            foldBtn.setAttribute('aria-expanded', 'true');
                            foldBtn.setAttribute('aria-label', '折叠子章节');
                        }
                        localStorage.setItem(FOLD_KEY_PREFIX + activeLink.dataset.target, '0');
                    }
                }
            }
        }

        let ticking = false;
        window.addEventListener('scroll', () => {
            if (!ticking) {
                requestAnimationFrame(() => {
                    onScroll();
                    ticking = false;
                });
                ticking = true;
            }
        }, { passive: true });

        onScroll();
    }

    function init() {
        // 视口太窄不启用
        if (window.innerWidth < MIN_WIDTH) return;

        const main = document.querySelector('main');
        if (!main) return;

        // 扫描 h2/h3，但排除 page-hero、section-head、eyebrow 里的（这些是页面元信息，不是正文分节）
        const excludedSelectors = '.page-hero, .reign-hero, .section-head, .eyebrow, .section-title';
        const allHeadings = Array.from(main.querySelectorAll('h2, h3'));
        const headings = allHeadings.filter((h) => !h.closest(excludedSelectors));

        if (headings.length < 2) return;

        ensureIds(headings);
        const toc = buildToc(headings);

        // 平滑滚动
        toc.addEventListener('click', (e) => {
            const a = e.target.closest('a[href^="#"]');
            if (!a) return;
            const target = document.getElementById(a.getAttribute('href').slice(1));
            if (target) {
                e.preventDefault();
                const y = target.getBoundingClientRect().top + window.scrollY - 90;
                window.scrollTo({ top: y, behavior: 'smooth' });
            }
        });

        setupScrollHighlight(headings, toc);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

/**
 * toc.js — 浮动目录（固定左侧面板），两种来源共用同一面板：
 *   1. 详情/专题页：扫描 <main> 内的 h2/h3，运行时构建（原有模式）；
 *   2. 栏目索引页：页面预置 <nav data-chr-toc> 静态链接源（构建期输出），
 *      本组件复用同一面板渲染，滚动联动目标为链接指向的分区元素。
 *      启用宽度可用 data-toc-min-width 覆盖（索引页表格宽，需要更高阈值）。
 * 面板能力（两种模式一致）：
 *   - 整体收缩/展开（持久化 localStorage）
 *   - 滚动联动高亮当前可见章节
 *   - 回到顶部按钮
 *   - 视口宽度不足自动隐藏
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'wv-toc-collapsed';
    const FOLD_KEY_PREFIX = 'wv-toc-fold-';
    const MIN_WIDTH = 1360;
    const SCROLL_OFFSET = 90;

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

    /* ---------- 面板外壳：头部收缩按钮 + 列表容器 + 回到顶部 ---------- */

    function createPanelShell(ariaLabel) {
        const root = document.createElement('nav');
        root.className = 'toc-float';
        root.setAttribute('aria-label', ariaLabel);

        const head = document.createElement('div');
        head.className = 'toc-head';
        head.innerHTML = `
            <button class="toc-toggle" type="button" aria-expanded="true" aria-label="收起目录">
                <span class="toc-toggle-icon" aria-hidden="true">‹</span>
                <span class="toc-toggle-label">目录</span>
            </button>
        `;
        root.appendChild(head);

        const body = document.createElement('div');
        body.className = 'toc-body';
        root.appendChild(body);

        const foot = document.createElement('div');
        foot.className = 'toc-foot';
        foot.innerHTML = `
            <button class="toc-top" type="button" aria-label="回到顶部">
                <span aria-hidden="true">↑</span>
                <span>回到顶部</span>
            </button>
        `;
        root.appendChild(foot);

        const toggleBtn = head.querySelector('.toc-toggle');
        toggleBtn.addEventListener('click', () => {
            const isCollapsed = root.classList.toggle('is-collapsed');
            toggleBtn.setAttribute('aria-expanded', !isCollapsed);
            toggleBtn.setAttribute('aria-label', isCollapsed ? '展开目录' : '收起目录');
            localStorage.setItem(STORAGE_KEY, isCollapsed ? '1' : '0');
        });
        if (localStorage.getItem(STORAGE_KEY) === '1') {
            root.classList.add('is-collapsed');
            toggleBtn.setAttribute('aria-expanded', 'false');
            toggleBtn.setAttribute('aria-label', '展开目录');
        }

        foot.querySelector('.toc-top').addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        return { root, body };
    }

    /* ---------- 模式一：扫描 h2/h3 ---------- */

    function buildToc(headings) {
        const { root, body } = createPanelShell('目录');

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

        body.appendChild(ul);
        document.body.appendChild(root);
        return root;
    }

    /* ---------- 模式二：静态链接源（栏目索引页） ---------- */

    function buildStaticToc(source) {
        const links = Array.from(source.querySelectorAll('a[href^="#"]'));
        if (!links.length) return null;

        const sections = [];
        const ul = document.createElement('ul');
        ul.className = 'toc-list';

        links.forEach((link) => {
            const id = link.getAttribute('href').slice(1);
            const section = document.getElementById(id);
            if (!section) return;
            const li = document.createElement('li');
            li.className = 'toc-h2';
            const headRow = document.createElement('div');
            headRow.className = 'toc-h2-row';
            const linkWrap = document.createElement('span');
            linkWrap.className = 'toc-link-wrap';
            const a = document.createElement('a');
            a.href = `#${id}`;
            a.dataset.target = id;
            a.title = link.title || '';
            a.innerHTML = link.innerHTML;
            linkWrap.appendChild(a);
            headRow.appendChild(linkWrap);
            li.appendChild(headRow);
            ul.appendChild(li);
            sections.push(section);
        });

        if (!sections.length) return null;

        const { root, body } = createPanelShell(source.getAttribute('aria-label') || '目录');
        body.appendChild(ul);
        document.body.appendChild(root);
        return { toc: root, sections };
    }

    /* ---------- 共用：平滑跳转 + 滚动联动高亮 ---------- */

    function bindSmoothScroll(toc) {
        toc.addEventListener('click', (e) => {
            const a = e.target.closest('a[href^="#"]');
            if (!a) return;
            const target = document.getElementById(a.getAttribute('href').slice(1));
            if (target) {
                e.preventDefault();
                const y = target.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET;
                window.scrollTo({ top: y, behavior: 'smooth' });
            }
        });
    }

    function setupScrollHighlight(sections, toc) {
        const links = toc.querySelectorAll('.toc-list a');
        const linkMap = new Map();
        links.forEach((a) => linkMap.set(a.dataset.target, a));

        let activeId = null;
        const THRESHOLD_TOP = 120;

        function onScroll() {
            let current = null;
            for (const section of sections) {
                const rect = section.getBoundingClientRect();
                if (rect.top - THRESHOLD_TOP <= 0) {
                    current = section.id;
                } else {
                    break;
                }
            }
            if (!current) {
                const last = sections[sections.length - 1];
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

    /**
     * 详情页正文容器选择器。
     * 索引页（index.html 们）只有 .page-hero / .section / .chronicle 等壳子类，
     * 不匹配下面任何一个，因此不会走标题扫描模式。
     */
    const DETAIL_CONTAINERS = '.prose, .dynasty-reigns-page, .reign-crowd-page, .family-tree-scroll, .entry-body, .person-timeline-page';

    function init() {
        const main = document.querySelector('main');
        if (!main) return;

        /* 模式二：栏目索引页的静态目录源（如史册索引的朝代目录） */
        const source = main.querySelector('[data-chr-toc]');
        if (source) {
            const minWidth = Number.parseInt(source.dataset.tocMinWidth, 10) || MIN_WIDTH;
            if (window.innerWidth < minWidth) return;
            const built = buildStaticToc(source);
            if (!built) return;
            bindSmoothScroll(built.toc);
            setupScrollHighlight(built.sections, built.toc);
            return;
        }

        /* 模式一：详情/专题页的标题扫描 */
        if (window.innerWidth < MIN_WIDTH) return;

        // 索引页没有详情页正文容器 → 不生成 TOC
        if (!main.querySelector(DETAIL_CONTAINERS)) return;

        // 扫描 h2/h3，但排除 page-hero、section-head、eyebrow 里的（这些是页面元信息，不是正文分节）
        const excludedSelectors = '.page-hero, .reign-hero, .section-head, .eyebrow, .section-title';
        const allHeadings = Array.from(main.querySelectorAll('h2, h3'));
        const headings = allHeadings.filter((h) => !h.closest(excludedSelectors));

        if (headings.length < 2) return;

        ensureIds(headings);
        const toc = buildToc(headings);
        bindSmoothScroll(toc);
        setupScrollHighlight(headings, toc);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

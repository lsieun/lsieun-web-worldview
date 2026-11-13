/**
 * toc.js — 详情页浮动目录
 * 扫描 .prose 内的 h2/h3，生成嵌套目录，支持：
 *   - 整体收缩/展开（持久化 localStorage）
 *   - h2 单节折叠/展开
 *   - 滚动联动高亮当前可见章节
 *   - 回到底部（.entry-foot 继续浏览区）
 *   - viewport < 1360px 自动隐藏
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'wv-toc-collapsed';
    const FOLD_KEY_PREFIX = 'wv-toc-fold-';
    const MIN_WIDTH = 1360;

    function slugify(text) {
        // 轻量 slug：保留中文、字母、数字，替换空格为 -
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

    function buildToc(container, headings) {
        const root = document.createElement('nav');
        root.className = 'toc';
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

        // 列表容器（可被整体收缩）
        const listWrap = document.createElement('div');
        listWrap.className = 'toc-body';

        const ul = document.createElement('ul');
        ul.className = 'toc-list';

        let currentH2 = null;
        let currentUl = null;

        headings.forEach((h) => {
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = `#${h.id}`;
            a.textContent = h.textContent.trim();
            a.dataset.target = h.id;

            if (h.tagName === 'H2') {
                // 完成上一个 h2 组
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

                currentH2 = outerLi;
                currentUl = innerUl;
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

        // 底部：回到底部按钮
        const foot = document.createElement('div');
        foot.className = 'toc-foot';
        foot.innerHTML = `
            <button class="toc-bottom" type="button" aria-label="回到底部">
                <span aria-hidden="true">↓</span>
                <span>回到底部</span>
            </button>
        `;
        root.appendChild(foot);

        container.appendChild(root);

        // 绑定回到底部
        const bottomBtn = foot.querySelector('.toc-bottom');
        bottomBtn.addEventListener('click', () => {
            const target = document.querySelector('.entry-foot') || document.documentElement;
            if (target) {
                const y = target.getBoundingClientRect().top + window.scrollY - 90;
                window.scrollTo({ top: y, behavior: 'smooth' });
            }
        });

        // 绑定整体收缩按钮
        const toggleBtn = head.querySelector('.toc-toggle');
        toggleBtn.addEventListener('click', () => {
            const isCollapsed = root.classList.toggle('is-collapsed');
            toggleBtn.setAttribute('aria-expanded', !isCollapsed);
            toggleBtn.setAttribute('aria-label', isCollapsed ? '展开目录' : '收起目录');
            localStorage.setItem(STORAGE_KEY, isCollapsed ? '1' : '0');
        });

        // 绑定 h2 折叠按钮
        root.querySelectorAll('.toc-fold-btn').forEach((btn) => {
            const h2Row = btn.closest('.toc-h2');
            const innerUl = h2Row.querySelector('.toc-sublist');
            const target = h2Row.querySelector('.toc-link-wrap a').dataset.target;
            const key = FOLD_KEY_PREFIX + target;

            const applyState = (folded) => {
                h2Row.classList.toggle('is-folded', folded);
                btn.setAttribute('aria-expanded', !folded);
                btn.setAttribute('aria-label', folded ? '展开子章节' : '折叠子章节');
                localStorage.setItem(key, folded ? '1' : '0');
            };

            btn.addEventListener('click', () => {
                const nowFolded = !h2Row.classList.contains('is-folded');
                applyState(nowFolded);
            });

            // 点击 h2 链接本身也触发展开
            h2Row.querySelector('.toc-link-wrap').addEventListener('click', (e) => {
                // 让默认的跳转行为发生，但先展开
                if (h2Row.classList.contains('is-folded')) {
                    applyState(false);
                }
            });

            // 应用持久化状态
            if (localStorage.getItem(key) === '1') applyState(true);
        });

        // 应用整体收缩持久化
        if (localStorage.getItem(STORAGE_KEY) === '1') {
            root.classList.add('is-collapsed');
            toggleBtn.setAttribute('aria-expanded', 'false');
            toggleBtn.setAttribute('aria-label', '展开目录');
        }

        return root;
    }

    function setupScrollHighlight(prose, headings, toc) {
        const links = toc.querySelectorAll('.toc-list a');
        const linkMap = new Map();
        links.forEach((a) => linkMap.set(a.dataset.target, a));

        let activeId = null;
        const THRESHOLD_TOP = 120; // 距顶多少 px 算进入视野

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
            // 到达底部时，选最后一个
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
                    // 确保所在 h2 组展开
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

        // 初始定位
        onScroll();
    }

    function init() {
        const prose = document.querySelector('.entry-body .prose');
        if (!prose) return; // 非详情页

        const headings = Array.from(prose.querySelectorAll('h2, h3'));
        if (headings.length < 2) return; // 章节太少不显示

        const container = document.querySelector('.entry-body .toc-slot');
        if (!container) return;

        ensureIds(headings);
        const toc = buildToc(container, headings);
        container.classList.add('is-ready');
        container.removeAttribute('aria-hidden');
        setupScrollHighlight(prose, headings, toc);

        // 点击链接平滑滚动
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
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

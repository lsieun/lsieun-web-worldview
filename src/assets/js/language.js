/**
 * language.js — 中英文品牌与菜单切换
 * 置于 <head> 中同步执行：先落语言属性，再绘制首帧。
 */
(function () {
    const root = document.documentElement;
    const savedLanguage = localStorage.getItem('language-setting');
    const initialLanguage = savedLanguage === 'en' ? 'en' : 'zh';
    const zhTitle = document.title;

    function applyLanguage(language) {
        const isEnglish = language === 'en';
        root.setAttribute('data-language', language);
        root.setAttribute('lang', isEnglish ? 'en' : 'zh-CN');

        const pageTitle = zhTitle.replace(/ · 观世界$/, '');
        document.title = isEnglish
            ? (pageTitle === '观世界' ? 'WorldView' : `${pageTitle} · WorldView`)
            : zhTitle;
    }

    function updateControls(language) {
        const isEnglish = language === 'en';
        const toggleLabel = isEnglish
            ? 'Current language: English. Click to switch to Chinese.'
            : '当前语言：中文，点击切换为英文';

        document.querySelectorAll('.language-toggle-btn').forEach((btn) => {
            btn.setAttribute('aria-label', toggleLabel);
            btn.setAttribute('title', toggleLabel);
        });
        document.querySelectorAll('[data-brand-home]').forEach((link) => {
            link.setAttribute('aria-label', isEnglish ? 'WorldView home' : '观世界首页');
        });
        document.querySelectorAll('.site-nav').forEach((nav) => {
            nav.setAttribute('aria-label', isEnglish ? 'Main navigation' : '主导航');
        });
    }

    applyLanguage(initialLanguage);

    document.addEventListener('DOMContentLoaded', () => {
        updateControls(root.getAttribute('data-language') || 'zh');

        document.querySelectorAll('.language-toggle-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const current = root.getAttribute('data-language') || 'zh';
                const next = current === 'en' ? 'zh' : 'en';
                applyLanguage(next);
                localStorage.setItem('language-setting', next);
                updateControls(next);
            });
        });
    });
})();

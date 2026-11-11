/**
 * theme.js — 明暗主题防闪烁与三态切换
 * 置于 <head> 中同步执行：先落主题属性，再绘制首帧。
 */
(function () {
    document.documentElement.classList.add('js');

    const THEME_ORDER = ['light', 'dark', 'auto'];
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    function resolveTheme(setting) {
        if (setting === 'auto') {
            return mediaQuery.matches ? 'dark' : 'light';
        }
        return setting === 'dark' ? 'dark' : 'light';
    }

    function getThemeTitles(setting) {
        switch (setting) {
            case 'light':
                return { label: '主题：浅色模式', next: '点击切换到深色模式' };
            case 'dark':
                return { label: '主题：深色模式', next: '点击切换到跟随系统' };
            case 'auto':
            default:
                return { label: '主题：跟随系统', next: '点击切换到浅色模式' };
        }
    }

    function updateButtonAttributes(setting) {
        const info = getThemeTitles(setting);
        document.querySelectorAll('.theme-toggle-btn').forEach((btn) => {
            btn.setAttribute('aria-label', `${info.label}（${info.next}）`);
            btn.setAttribute('title', `${info.label}（${info.next}）`);
        });
    }

    const savedSetting = localStorage.getItem('theme-setting') || localStorage.getItem('theme') || 'auto';
    const initialSetting = THEME_ORDER.includes(savedSetting) ? savedSetting : 'auto';
    const initialTheme = resolveTheme(initialSetting);

    document.documentElement.setAttribute('data-theme', initialTheme);
    document.documentElement.setAttribute('data-theme-setting', initialSetting);

    window.setTheme = function (setting) {
        const targetSetting = THEME_ORDER.includes(setting) ? setting : 'auto';
        const effectiveTheme = resolveTheme(targetSetting);

        document.documentElement.setAttribute('data-theme', effectiveTheme);
        document.documentElement.setAttribute('data-theme-setting', targetSetting);
        localStorage.setItem('theme-setting', targetSetting);
        localStorage.setItem('theme', targetSetting);

        updateButtonAttributes(targetSetting);
        window.dispatchEvent(new CustomEvent('themechanged', {
            detail: { theme: effectiveTheme, setting: targetSetting }
        }));
    };

    window.toggleTheme = function () {
        const currentSetting = document.documentElement.getAttribute('data-theme-setting') || 'auto';
        const currentIndex = THEME_ORDER.indexOf(currentSetting);
        const nextSetting = THEME_ORDER[(currentIndex + 1) % THEME_ORDER.length];
        window.setTheme(nextSetting);
    };

    if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', (event) => {
            const currentSetting = document.documentElement.getAttribute('data-theme-setting') || 'auto';
            if (currentSetting === 'auto') {
                const effectiveTheme = event.matches ? 'dark' : 'light';
                document.documentElement.setAttribute('data-theme', effectiveTheme);
                window.dispatchEvent(new CustomEvent('themechanged', {
                    detail: { theme: effectiveTheme, setting: 'auto' }
                }));
            }
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        const currentSetting = document.documentElement.getAttribute('data-theme-setting') || 'auto';
        updateButtonAttributes(currentSetting);

        document.querySelectorAll('.theme-toggle-btn').forEach((btn) => {
            btn.addEventListener('click', () => window.toggleTheme());
        });
    });
})();

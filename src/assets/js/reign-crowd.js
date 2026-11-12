/**
 * reign-crowd.js — 帝系与群臣
 *
 * 版面（年份轴、帝系条、生命线与泳道）在构建期由 world.js 算好并输出为 SVG，
 * 这里只负责三件事：
 *   1. 悬停生命线 / 帝系条时显示提示；
 *   2. 高亮联动：悬停某人时点亮他所历的帝王，悬停某帝时点亮同期在世的人；
 *   3. 人物索引的悬停预览与点击固定（支持多选）。
 */
(function () {
    var root = document.querySelector('[data-rc-root]');
    if (!root) return;

    var plot = root.querySelector('.rc-plot');
    var card = root.querySelector('.rc-card');
    var tip = root.querySelector('[data-rc-tip]');
    if (!plot || !card || !tip) return;

    var tipTitle = tip.querySelector('[data-rc-tip-title]');
    var tipMeta = tip.querySelector('[data-rc-tip-meta]');
    var tipDesc = tip.querySelector('[data-rc-tip-desc]');

    var people = Array.prototype.slice.call(plot.querySelectorAll('.rc-person'));
    var rulers = Array.prototype.slice.call(plot.querySelectorAll('.rc-ruler'));
    var rosterItems = Array.prototype.slice.call(root.querySelectorAll('.rc-roster-item'));
    var clearBtn = root.querySelector('[data-rc-clear]');

    var pinned = new Set();
    var hoverPerson = null;
    var hoverRuler = null;
    var pointer = { x: 0, y: 0 };

    // ---------- 状态与高亮 ----------
    function refresh() {
        var rulerStart = hoverRuler ? Number(hoverRuler.dataset.start) : null;
        var rulerEnd = hoverRuler ? Number(hoverRuler.dataset.end) : null;

        people.forEach(function (el) {
            var id = el.dataset.person;
            var active = id === hoverPerson || pinned.has(id);
            if (!active && rulerStart !== null) {
                active = Number(el.dataset.death) >= rulerStart && Number(el.dataset.birth) <= rulerEnd;
            }
            el.classList.toggle('is-active', active);
            el.classList.toggle('is-pinned', pinned.has(id));
        });

        var focused = Boolean(hoverRuler) || people.some(function (el) {
            return el.classList.contains('is-active');
        });
        plot.classList.toggle('is-focused', focused);

        rulers.forEach(function (el) {
            var hit = el === hoverRuler;
            if (!hit) {
                var start = Number(el.dataset.start);
                var end = Number(el.dataset.end);
                hit = people.some(function (person) {
                    return person.classList.contains('is-active') &&
                        Number(person.dataset.death) >= start &&
                        Number(person.dataset.birth) <= end;
                });
            }
            el.classList.toggle('is-hit', hit);
        });

        rosterItems.forEach(function (btn) {
            var isPinned = pinned.has(btn.dataset.person);
            btn.classList.toggle('is-pinned', isPinned);
            btn.setAttribute('aria-pressed', isPinned ? 'true' : 'false');
        });
    }

    // ---------- 悬浮提示 ----------
    function placeTip() {
        var rect = card.getBoundingClientRect();
        var tw = tip.offsetWidth;
        var th = tip.offsetHeight;
        var x = pointer.x - rect.left + 16;
        var y = pointer.y - rect.top + 16;
        if (x + tw > rect.width - 8) x = pointer.x - rect.left - tw - 16;
        if (y + th > rect.height - 8) y = pointer.y - rect.top - th - 16;
        x = Math.max(8, x);
        y = Math.max(8, y);
        tip.style.left = x + 'px';
        tip.style.top = y + 'px';
    }

    function showTip(title, meta, desc) {
        tipTitle.textContent = title;
        tipMeta.textContent = meta;
        tipDesc.textContent = desc || '';
        tipDesc.hidden = !desc;
        tip.classList.add('is-show');
        tip.setAttribute('aria-hidden', 'false');
        placeTip();
    }

    function hideTip() {
        tip.classList.remove('is-show');
        tip.setAttribute('aria-hidden', 'true');
    }

    function showPerson(el) {
        showTip(el.dataset.name, el.dataset.life + ' · ' + el.dataset.role, el.dataset.summary);
    }

    function showRuler(el) {
        var alive = el.dataset.alive ? el.dataset.alive.split('、') : [];
        var desc = alive.length
            ? '在位期间在世 ' + alive.length + ' 人：' + alive.join('、')
            : '在位期间无图中人物在世';
        showTip(el.dataset.name, el.dataset.life + ' · ' + el.dataset.reign, desc);
    }

    // ---------- 图内交互 ----------
    plot.addEventListener('pointermove', function (event) {
        pointer.x = event.clientX;
        pointer.y = event.clientY;
        if (tip.classList.contains('is-show')) placeTip();
    });

    plot.addEventListener('pointerover', function (event) {
        var person = event.target.closest ? event.target.closest('.rc-person') : null;
        if (person) {
            hoverPerson = person.dataset.person;
            hoverRuler = null;
            showPerson(person);
            refresh();
            return;
        }
        var ruler = event.target.closest ? event.target.closest('.rc-ruler') : null;
        if (ruler) {
            hoverRuler = ruler;
            hoverPerson = null;
            showRuler(ruler);
            refresh();
        }
    });

    plot.addEventListener('pointerout', function (event) {
        var person = event.target.closest ? event.target.closest('.rc-person') : null;
        if (person) {
            if (event.relatedTarget && person.contains(event.relatedTarget)) return;
            hoverPerson = null;
            hideTip();
            refresh();
            return;
        }
        var ruler = event.target.closest ? event.target.closest('.rc-ruler') : null;
        if (ruler) {
            if (event.relatedTarget && ruler.contains(event.relatedTarget)) return;
            hoverRuler = null;
            hideTip();
            refresh();
        }
    });

    plot.addEventListener('pointerleave', function () {
        hoverPerson = null;
        hoverRuler = null;
        hideTip();
        refresh();
    });

    // ---------- 人物索引 ----------
    rosterItems.forEach(function (btn) {
        var id = btn.dataset.person;

        function preview() {
            hoverPerson = id;
            hoverRuler = null;
            hideTip();
            refresh();
        }

        function clearPreview() {
            if (hoverPerson === id) hoverPerson = null;
            refresh();
        }

        btn.addEventListener('pointerenter', preview);
        btn.addEventListener('pointerleave', clearPreview);
        btn.addEventListener('focus', preview);
        btn.addEventListener('blur', clearPreview);
        btn.addEventListener('click', function () {
            if (pinned.has(id)) pinned.delete(id);
            else pinned.add(id);
            refresh();
        });
    });

    if (clearBtn) {
        clearBtn.addEventListener('click', function () {
            pinned.clear();
            refresh();
        });
    }
})();

/**
 * reign-crowd.js — 帝系与群臣
 *
 * 版面初始值在构建期由 world.js 算好并输出为 SVG；这里负责：
 *   1. 纵向比例滑条：按每年像素重排年份轴、帝系条、生命线与事件点；
 *   2. 悬停提示：人物、帝系年段、个人事件；
 *   3. 高亮联动与人物索引的固定高亮。
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
    var tipSections = tip.querySelector('[data-rc-tip-sections]');

    var people = Array.prototype.slice.call(plot.querySelectorAll('.rc-person'));
    var rulers = Array.prototype.slice.call(plot.querySelectorAll('.rc-ruler'));
    var rosterItems = Array.prototype.slice.call(root.querySelectorAll('.rc-roster-item'));
    var eventLabels = Array.prototype.slice.call(plot.querySelectorAll('.rc-event-label'));
    var dots = Array.prototype.slice.call(plot.querySelectorAll('.rc-event'));
    var groupBands = Array.prototype.slice.call(plot.querySelectorAll('.rc-group-bg'));
    var axis = plot.querySelector('[data-rc-axis]');
    var endLine = plot.querySelector('.rc-end');
    var endLabel = plot.querySelector('.rc-end-label');
    var clearBtn = root.querySelector('[data-rc-clear]');
    var zoom = root.querySelector('[data-rc-zoom]');
    var zoomOut = root.querySelector('[data-rc-zoom-out]');

    var SVG_NS = 'http://www.w3.org/2000/svg';
    var start = Number(plot.dataset.start);
    var end = Number(plot.dataset.end);
    var top = Number(plot.dataset.top);
    var bottom = Number(plot.dataset.bottom);
    var axisX = Number(plot.dataset.axisX);
    var axisLine = Number(plot.dataset.axisLine);
    var width = Number(plot.getAttribute('width'));

    var pinned = new Set();
    var hoverPerson = null;
    var hoverRuler = null;
    var hotDot = null;
    var pointer = { x: 0, y: 0 };
    // 公元前 1 年之后即公元 1 年，没有公元 0 年
    var spanYears = end - start - (start < 0 && end > 0 ? 1 : 0);

    // ---------- 坐标 ----------
    function yOf(year, ppy) {
        var offset = year - start - (start < 0 && year > 0 ? 1 : 0);
        return top + offset * ppy;
    }

    function yearLabel(year) {
        if (year < 0) return '前 ' + Math.abs(year);
        if (year === 0) return '公元';
        return '公元 ' + year;
    }

    function chooseInterval(ppy) {
        var candidates = [10, 20, 25, 50, 100];
        for (var i = 0; i < candidates.length; i += 1) {
            if (candidates[i] * ppy >= 60) return candidates[i];
        }
        return 100;
    }

    function makeLine(className, x1, y1, x2, y2) {
        var line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('class', className);
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
        return line;
    }

    function renderAxis(ppy, endY) {
        if (!axis) return;
        axis.textContent = '';
        axis.appendChild(makeLine('rc-spine', axisLine, top, axisLine, endY));

        var major = chooseInterval(ppy);
        var minor = major === 10 ? 5 : 10;
        for (var year = Math.ceil(start / minor) * minor; year <= end; year += minor) {
            if (year === 0) continue;
            var y = yOf(year, ppy);
            var isMajor = year % major === 0;
            if (isMajor) {
                axis.appendChild(makeLine('rc-grid', axisX, y, width - 20, y));
            }
            axis.appendChild(makeLine(
                isMajor ? 'rc-tick is-major' : 'rc-tick',
                axisLine - (isMajor ? 7 : 3), y, axisLine, y
            ));
            if (isMajor) {
                var label = document.createElementNS(SVG_NS, 'text');
                label.setAttribute('class', 'rc-year');
                label.setAttribute('x', axisX);
                label.setAttribute('y', y + 4);
                label.setAttribute('text-anchor', 'end');
                label.textContent = yearLabel(year);
                axis.appendChild(label);
            }
        }
    }

    // ---------- 重排 ----------
    function relayout(ppy) {
        var endY = yOf(end, ppy);
        var height = Math.round(endY + bottom);

        plot.setAttribute('height', height);
        plot.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
        plot.dataset.ppy = String(ppy);

        groupBands.forEach(function (band) {
            band.setAttribute('height', endY - top);
        });

        rulers.forEach(function (group) {
            var rulerStart = Number(group.dataset.start);
            var rulerEnd = Number(group.dataset.end);
            var y = yOf(rulerStart, ppy);
            var h = Math.max((rulerEnd - rulerStart) * ppy, 3);

            var rect = group.querySelector('.rc-band');
            if (rect) {
                rect.setAttribute('y', y);
                rect.setAttribute('height', h);
            }
            var hit = group.querySelector('.rc-band-hit');
            if (hit) hit.setAttribute('y', y - 4);
            var label = group.querySelector('.rc-band-label');
            if (label) {
                label.setAttribute('y', y + h / 2 + 4);
                label.style.display = h >= 14 ? '' : 'none';
            }
        });

        people.forEach(function (group) {
            var birth = Number(group.dataset.birth);
            var death = Number(group.dataset.death);
            var careerRaw = group.dataset.careerStart;
            var career = careerRaw === '' || careerRaw === 'null' ? null : Number(careerRaw);
            var y = yOf(birth, ppy);
            var h = (death - birth) * ppy;
            var careerY = career === null ? null : yOf(career, ppy);

            ['rc-halo', 'rc-hit'].forEach(function (className) {
                var node = group.querySelector('.' + className);
                if (!node) return;
                node.setAttribute('y', y);
                node.setAttribute('height', h);
            });

            var pre = group.querySelector('.rc-pre');
            if (pre) {
                pre.setAttribute('y', y);
                pre.setAttribute('height', careerY === null ? h : careerY - y);
            }
            var bar = group.querySelector('.rc-bar');
            if (bar) {
                bar.setAttribute('y', careerY === null ? y : careerY);
                bar.setAttribute('height', careerY === null ? h : y + h - careerY);
            }
            var mark = group.querySelector('.rc-career');
            if (mark && careerY !== null) mark.setAttribute('cy', careerY);

            Array.prototype.forEach.call(group.querySelectorAll('.rc-event, .rc-event-ripple'), function (dot) {
                dot.setAttribute('cy', yOf(Number(dot.dataset.year), ppy));
            });
        });

        eventLabels.forEach(function (label) {
            label.setAttribute('y', yOf(Number(label.dataset.year), ppy) + 4);
        });

        if (endLine) {
            endLine.setAttribute('y1', endY);
            endLine.setAttribute('y2', endY);
        }
        if (endLabel) endLabel.setAttribute('y', endY - 8);

        renderAxis(ppy, endY);

        if (zoomOut) {
            zoomOut.textContent = yearLabel(start) + ' — ' + yearLabel(end) +
                ' · 跨度 ' + spanYears + ' 年 × ' + ppy.toFixed(1) + ' px/年 = ' +
                Math.round(spanYears * ppy) + ' px';
        }
    }

    // ---------- 高亮状态 ----------
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
                var s = Number(el.dataset.start);
                var e = Number(el.dataset.end);
                hit = people.some(function (person) {
                    return person.classList.contains('is-active') &&
                        Number(person.dataset.death) >= s &&
                        Number(person.dataset.birth) <= e;
                });
            }
            el.classList.toggle('is-hit', hit);
        });

        eventLabels.forEach(function (label) {
            var id = label.dataset.for;
            var showForPin = pinned.has(id);
            var showForHot = hotDot &&
                id === hotDot.dataset.person &&
                label.dataset.year === hotDot.dataset.year;
            label.classList.toggle('is-show', Boolean(showForPin || showForHot));
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

    function renderSections(items) {
        tipSections.textContent = '';
        if (!items.length) {
            tipSections.classList.remove('is-show');
            return;
        }
        items.forEach(function (item) {
            var section = document.createElement('div');
            section.className = 'rc-tip-section';
            var label = document.createElement('p');
            label.className = 'rc-tip-section-label';
            label.textContent = item.label;
            var text = document.createElement('p');
            text.className = 'rc-tip-section-text';
            text.textContent = item.text;
            section.appendChild(label);
            section.appendChild(text);
            tipSections.appendChild(section);
        });
        tipSections.classList.add('is-show');
    }

    function showTip(title, meta, desc, sections) {
        tipTitle.textContent = title;
        tipMeta.textContent = meta;
        tipDesc.textContent = desc || '';
        tipDesc.hidden = !desc;
        renderSections(sections || []);
        tip.classList.add('is-show');
        tip.setAttribute('aria-hidden', 'false');
        placeTip();
    }

    function hideTip() {
        tip.classList.remove('is-show');
        tip.setAttribute('aria-hidden', 'true');
    }

    function showPerson(el) {
        var career = el.dataset.career || '';
        showTip(
            el.dataset.name,
            el.dataset.life + ' · ' + el.dataset.role,
            career + '。' + (el.dataset.summary || '')
        );
    }

    function showRuler(el) {
        var alive = el.dataset.alive ? el.dataset.alive.split('、') : [];
        var aliveText = alive.length
            ? '在世 ' + alive.length + ' 人：' + alive.join('、')
            : '图中无人物在世';
        var sections = [];
        if (el.dataset.posthumous) {
            sections.push({ label: el.dataset.posthumousLabel || '称号', text: el.dataset.posthumous });
        }
        sections.push({ label: '在位臣工', text: aliveText });
        showTip(
            el.dataset.name,
            el.dataset.life + ' · ' + el.dataset.reign + ' · ' + el.dataset.dynastyYear,
            '',
            sections
        );
    }

    function showEvent(dot) {
        showTip(
            dot.dataset.eventTitle,
            dot.dataset.yearLabel + ' · ' + dot.dataset.personName + ' · ' + dot.dataset.ageLabel,
            dot.dataset.desc
        );
    }

    // ---------- 图内交互 ----------
    function toPlotPoint(event) {
        var ctm = plot.getScreenCTM();
        if (!ctm) return null;
        var point = plot.createSVGPoint();
        point.x = event.clientX;
        point.y = event.clientY;
        return point.matrixTransform(ctm.inverse());
    }

    function rippleOf(dot) {
        return dot.parentNode.querySelector('.rc-event-ripple[data-key="' + dot.dataset.key + '"]');
    }

    // 只有鼠标靠近事件点 12px 以内才响应，离得远不显示事件信息
    function nearestDot(point) {
        var best = null;
        var bestDistance = 12;
        dots.forEach(function (dot) {
            var dx = Math.abs(Number(dot.getAttribute('cx')) - point.x);
            var dy = Math.abs(Number(dot.getAttribute('cy')) - point.y);
            if (dx > bestDistance || dy > bestDistance) return;
            var distance = Math.max(dx, dy);
            if (distance < bestDistance) {
                bestDistance = distance;
                best = dot;
            }
        });
        return best;
    }

    function setHotDot(dot) {
        if (hotDot === dot) return;
        if (hotDot) hotDot.classList.remove('is-hot');
        hotDot = dot;
        if (!dot) {
            if (hoverPerson) {
                var personEl = plot.querySelector('.rc-person[data-person="' + hoverPerson + '"]');
                if (personEl) {
                    showPerson(personEl);
                    refresh();
                    return;
                }
            }
            if (!hoverRuler) hideTip();
            refresh();
            return;
        }
        dot.classList.add('is-hot');
        var ripple = rippleOf(dot);
        if (ripple) {
            ripple.classList.remove('is-pulse');
            void ripple.getBoundingClientRect();
            ripple.classList.add('is-pulse');
        }
        hoverPerson = dot.dataset.person;
        hoverRuler = null;
        showEvent(dot);
        refresh();
    }

    plot.addEventListener('pointermove', function (event) {
        pointer.x = event.clientX;
        pointer.y = event.clientY;
        if (tip.classList.contains('is-show')) placeTip();
        var point = toPlotPoint(event);
        setHotDot(point ? nearestDot(point) : null);
    });

    plot.addEventListener('pointerover', function (event) {
        var node = event.target.closest ? event.target.closest('.rc-person, .rc-ruler') : null;
        if (!node) return;
        if (node.classList.contains('rc-person')) {
            if (hotDot) return;
            hoverPerson = node.dataset.person;
            hoverRuler = null;
            showPerson(node);
            refresh();
            return;
        }
        hoverRuler = node;
        hoverPerson = null;
        showRuler(node);
        refresh();
    });

    plot.addEventListener('pointerout', function (event) {
        var node = event.target.closest ? event.target.closest('.rc-person, .rc-ruler') : null;
        if (!node) return;
        if (event.relatedTarget && node.contains(event.relatedTarget)) return;
        if (node.classList.contains('rc-person')) {
            if (hotDot && hotDot.dataset.person === node.dataset.person) return;
            hoverPerson = null;
        } else {
            hoverRuler = null;
        }
        hideTip();
        refresh();
    });

    plot.addEventListener('pointerleave', function () {
        if (hotDot) hotDot.classList.remove('is-hot');
        hotDot = null;
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

    // ---------- 纵向比例 ----------
    if (zoom) {
        relayout(Number(zoom.value));
        zoom.addEventListener('input', function () {
            relayout(Number(zoom.value));
        });
    }

    refresh();
})();

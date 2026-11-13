/**
 * CrowdViewBuilder.js — 帝系与群臣泳道图
 *
 * 对应原 world.js 的 buildCrowdView 函数（517-853 行），337 行最大块。
 * 使用 CROWD 常量控制版面像素参数，posthumousOf 处理西汉谥法释义。
 */
import { ViewBuilder } from "./ViewBuilder.js";
import { ensureArray, ensureNumber, ensureRef } from "../validators.js";
import { CROWD, posthumousOf } from "../constants.js";
import { yearPos, round1, elapsedYears, eraLabel, yearLabel, ageLabel, bandTitle, chooseTickInterval } from "../utils.js";

export class CrowdViewBuilder extends ViewBuilder {
    build(view, ctx) {
        const viewSource = `views/${view.id}.json`;
        const dynasty = ctx.dynasties[view.dynasty];
        if (!dynasty) throw new Error(`[world] ${viewSource} 缺少有效 dynasty`);
        const dynastySource = ctx.sources[dynasty.id];

        /* ---------- 1. 分组 ---------- */
        const groups = ensureArray(view.groups, viewSource, "groups").map((group) => {
            if (!group.id || !group.name) throw new Error(`[world] ${viewSource} 的 groups 每项都需要 id 与 name`);
            return {
                id: group.id,
                name: group.name,
                desc: group.desc || "",
                people: [],
                laneStart: 0,
                laneCount: 0,
                x: 0,
                width: 0
            };
        });
        const groupById = new Map(groups.map((group) => [group.id, group]));
        if (groupById.size !== groups.length) throw new Error(`[world] ${viewSource} 的 groups 存在重复 id`);

        /* ---------- 2. 时间范围 ---------- */
        const range = view.range || { start: dynasty.start, end: dynasty.end };
        const start = ensureNumber(range.start, viewSource, "range.start");
        const end = ensureNumber(range.end, viewSource, "range.end");
        if (start > end) throw new Error(`[world] ${viewSource} 的 range 起止倒置`);

        /* ---------- 3. 人物 ---------- */
        const seen = new Set();
        const people = ensureArray(view.cast, viewSource, "cast").map((item) => {
            ensureRef(ctx.figures, "人物", viewSource, "cast", item.figure);
            const figure = ctx.figures[item.figure];
            if (seen.has(figure.id)) throw new Error(`[world] ${viewSource} 的 cast 中「${figure.id}」重复`);
            seen.add(figure.id);
            ensureNumber(figure.birth, ctx.sources[figure.id], "birth");
            ensureNumber(figure.death, ctx.sources[figure.id], "death");
            const group = groupById.get(item.group);
            if (!group) throw new Error(`[world] ${viewSource} 的 cast 中「${figure.id}」归属了不存在的分组「${item.group}」`);
            if (figure.death > end) {
                throw new Error(`[world] ${viewSource} 的「${figure.id}」卒年超出视图时间范围`);
            }
            // 生年早于本图起点时，线自起点画起并加开放端点标记
            const lineFrom = Math.max(figure.birth, start);
            const careerStart = figure.careerStart === undefined || figure.careerStart === null
                ? null
                : ensureNumber(figure.careerStart, ctx.sources[figure.id], "careerStart");
            if (careerStart !== null && (careerStart < figure.birth || careerStart > figure.death)) {
                throw new Error(`[world] ${viewSource} 的「${figure.id}」起家年份不在生卒区间内`);
            }
            return {
                id: figure.id,
                name: figure.name,
                pinyin: figure.pinyin || "",
                summary: figure.summary || "",
                birth: figure.birth,
                death: figure.death,
                lineFrom,
                openStart: figure.birth < start,
                birthLabel: yearLabel(figure.birth, figure.birthApprox),
                deathLabel: yearLabel(figure.death, figure.deathApprox),
                careerStart,
                careerApprox: Boolean(figure.careerApprox),
                careerOpen: careerStart !== null && careerStart < start,
                careerLabel: careerStart === null
                    ? "起家年份无载"
                    : `起家 ${yearLabel(careerStart, figure.careerApprox)}${careerStart < start ? "（早于本图起点）" : ""}`,
                role: item.role || "",
                group: group.id,
                groupName: group.name,
                lane: 0,
                x: 0,
                y: 0,
                h: 0,
                preH: 0,
                postY: 0,
                postH: 0,
                careerY: null,
                events: []
            };
        });
        if (!people.length) throw new Error(`[world] ${viewSource} 的 cast 为空`);

        /* ---------- 4. 事件挂载 ---------- */
        const personById = new Map(people.map((person) => [person.id, person]));
        const usedEvents = new Set();
        const regencyRawIds = new Set(ensureArray(dynasty.regencies, dynastySource, "regencies").map((item) => item.figure));
        const regencyEvents = new Map();
        for (const eventId of ensureArray(view.events, viewSource, "events")) {
            ensureRef(ctx.events, "事件", viewSource, "events", eventId);
            if (usedEvents.has(eventId)) throw new Error(`[world] ${viewSource} 的事件「${eventId}」重复`);
            usedEvents.add(eventId);
            const event = ctx.events[eventId];
            const eventSource = ctx.sources[eventId];
            const year = ensureNumber(event.year, eventSource, "year");
            if (year < start || year > end) {
                throw new Error(`[world] ${eventSource} 的年份不在视图时间范围内`);
            }
            const allFigures = ensureArray(event.figures, eventSource, "figures");
            const matched = allFigures.filter((figureId) => personById.has(figureId));
            const matchedRegencies = allFigures.filter((figureId) => regencyRawIds.has(figureId));
            if (!matched.length && !matchedRegencies.length) {
                throw new Error(`[world] ${eventSource} 未关联本视图中的任何人物`);
            }
            for (const personId of matched) {
                const person = personById.get(personId);
                if (year < person.birth || year > person.death) {
                    throw new Error(`[world] ${eventSource} 的年份不在「${personId}」生卒区间内`);
                }
                person.events.push({
                    id: event.id,
                    year,
                    yearLabel: eraLabel(year),
                    age: year - person.birth,
                    ageLabel: ageLabel(year, person.birth),
                    title: event.title,
                    desc: event.desc || ""
                });
            }
            for (const figureId of matchedRegencies) {
                if (!regencyEvents.has(figureId)) regencyEvents.set(figureId, []);
                regencyEvents.get(figureId).push({
                    year,
                    yearLabel: eraLabel(year),
                    title: event.title,
                    desc: event.desc || ""
                });
            }
        }
        people.forEach((person) => person.events.sort((a, b) => a.year - b.year));

        /* ---------- 5. 泳道打包 ---------- */
        let nextLane = 0;
        for (const group of groups) {
            group.people = people
                .filter((person) => person.group === group.id)
                .sort((a, b) => a.birth - b.birth || a.death - b.death);
            const laneEnds = [];
            for (const person of group.people) {
                let lane = laneEnds.findIndex((lastDeath) => lastDeath < person.birth);
                if (lane === -1) {
                    laneEnds.push(person.death);
                    lane = laneEnds.length - 1;
                } else {
                    laneEnds[lane] = person.death;
                }
                person.lane = nextLane + lane;
            }
            group.laneStart = nextLane;
            group.laneCount = laneEnds.length;
            nextLane += laneEnds.length + 1; // 组间留一道空隙
        }
        const totalLanes = Math.max(...people.map((person) => person.lane)) + 1;

        /* ---------- 6. 纵坐标 ---------- */
        const yOf = (year) => round1(CROWD.top + yearPos(year, start) * CROWD.ppy);
        for (const person of people) {
            person.y = yOf(person.lineFrom);
            person.h = round1((person.death - person.lineFrom) * CROWD.ppy);
            person.x = round1(CROWD.laneX0 + person.lane * CROWD.lanePitch + (CROWD.lanePitch - CROWD.barWidth) / 2);
            // 仕宦线：起家前用细淡线，起家后为实线；起家早于图起点则整条为实线
            if (person.careerStart === null || person.careerOpen) {
                person.careerY = null;
                person.preH = person.h;
                person.postY = person.y;
                person.postH = person.h;
            } else {
                person.careerY = yOf(person.careerStart);
                person.preH = round1(person.careerY - person.y);
                person.postY = person.careerY;
                person.postH = round1(person.h - person.preH);
            }
        }

        const rightEdge = CROWD.laneX0 + totalLanes * CROWD.lanePitch;
        for (const person of people) {
            person.events.forEach((event) => {
                event.y = yOf(event.year);
                const toLeft = person.x + 96 > rightEdge;
                event.labelAnchor = toLeft ? "end" : "start";
                event.labelX = round1(person.x + (toLeft ? -8 : CROWD.barWidth + 8));
            });
        }
        for (const group of groups) {
            group.x = CROWD.laneX0 + group.laneStart * CROWD.lanePitch;
            group.width = group.laneCount * CROWD.lanePitch;
        }

        /* ---------- 7. 帝王年段 ---------- */
        const rulers = [];
        for (const ruler of ensureArray(dynasty.rulers, dynastySource, "rulers")) {
            const rulerSource = `${dynastySource} rulers.${ruler.figure}`;
            const figure = ctx.figures[ruler.figure];
            for (const term of ensureArray(ruler.terms, rulerSource, "terms")) {
                const termStart = Math.max(ensureNumber(term.start, rulerSource, "terms.start"), start);
                const termEnd = Math.min(ensureNumber(term.end, rulerSource, "terms.end"), end);
                if (termEnd < termStart) continue;
                const height = Math.max(round1((termEnd - termStart) * CROWD.ppy), CROWD.minRulerHeight);
                const years = elapsedYears(termStart, termEnd);
                const title = ruler.title || figure.name;
                const displayTitle = bandTitle(title);
                const posthumous = posthumousOf(title);
                rulers.push({
                    id: `${ruler.figure}-${term.start}`,
                    figure: ruler.figure,
                    name: figure.name,
                    pinyin: figure.pinyin || "",
                    title,
                    displayTitle,
                    fullName: displayTitle.includes(figure.name) || displayTitle.includes(figure.name.slice(-1))
                        ? displayTitle
                        : `${displayTitle} ${figure.name}`,
                    posthumousLabel: posthumous.label,
                    posthumous: posthumous.text,
                    dynastyYearLabel: `汉兴第 ${elapsedYears(dynasty.start, termStart) + 1} 年`,
                    status: ruler.status || "formal",
                    order: ruler.order,
                    start: termStart,
                    end: termEnd,
                    y: yOf(termStart),
                    h: height,
                    isTiny: height < CROWD.labelMinHeight,
                    showLabel: height >= CROWD.labelMinHeight && displayTitle.length <= 5,
                    lifeLabel: termEnd === termStart
                        ? eraLabel(termStart)
                        : `${eraLabel(termStart)} — ${eraLabel(termEnd)}`,
                    reignLabel: `在位 ${term.durationLabel || (years === 0 ? "不足一年" : `${years} 年`)}`,
                    alive: people
                        .filter((person) => person.death >= termStart && person.birth <= termEnd)
                        .map((person) => person.name),
                    serving: people
                        .filter((person) => person.careerStart !== null &&
                            person.careerStart <= termEnd &&
                            person.death >= termStart)
                        .map((person) => person.name)
                });
            }
        }
        // 极短在位的细标最后绘制，避免被相邻年段覆盖
        rulers.sort((a, b) => Number(a.isTiny) - Number(b.isTiny) || a.start - b.start);

        /* ---------- 8. 临朝 / 辅政轨 ---------- */
        const regencies = ensureArray(dynasty.regencies, dynastySource, "regencies").map((regency) => {
            const figure = ctx.figures[regency.figure];
            if (!figure) throw new Error(`[world] ${dynastySource} 的 regencies 中「${regency.figure}」不存在`);
            const from = Math.max(ensureNumber(regency.start, dynastySource, "regencies.start"), start);
            const to = Math.min(ensureNumber(regency.end, dynastySource, "regencies.end"), end);
            if (to <= from) return null;
            const height = Math.max(round1((to - from) * CROWD.ppy), CROWD.minRulerHeight);
            const hasLife = Number.isFinite(figure.birth) && Number.isFinite(figure.death);
            return {
                id: `regency-${regency.figure}`,
                name: figure.name,
                pinyin: figure.pinyin || "",
                label: regency.label || "临朝",
                note: regency.note || "",
                fate: regency.fate || "",
                figureId: regency.figure,
                events: (regencyEvents.get(regency.figure) || [])
                    .sort((a, b) => a.year - b.year)
                    .map((event) => Object.assign({}, event, { y: yOf(event.year) })),
                birthLabel: hasLife ? yearLabel(figure.birth, figure.birthApprox) : "生年不详",
                deathLabel: yearLabel(figure.death, figure.deathApprox),
                lifeY: hasLife ? yOf(Math.max(figure.birth, start)) : null,
                lifeH: hasLife ? round1((Math.min(figure.death, end) - Math.max(figure.birth, start)) * CROWD.ppy) : 0,
                lifeFrom: hasLife ? Math.max(figure.birth, start) : start,
                lifeTo: hasLife ? Math.min(figure.death, end) : end,
                start: from,
                end: to,
                y: yOf(from),
                h: height,
                showLabel: height >= CROWD.labelMinHeight,
                lifeLabel: `${eraLabel(from)} — ${eraLabel(to)}`
            };
        }).filter(Boolean).sort((a, b) => a.start - b.start);

        /* ---------- 9. 刻度 ---------- */
        const tickInterval = chooseTickInterval(CROWD.ppy, CROWD.labelGap);
        const minorInterval = tickInterval === 10 ? 5 : 10;
        const ticks = [];
        for (let year = Math.ceil(start / minorInterval) * minorInterval; year <= end; year += minorInterval) {
            if (year === 0) continue;
            const major = year % tickInterval === 0;
            ticks.push({
                year,
                major,
                label: major ? eraLabel(year) : "",
                y: yOf(year)
            });
        }

        /* ---------- 10. 版面 ---------- */
        const plotWidth = CROWD.laneX0 + totalLanes * CROWD.lanePitch + 20;
        const plotHeight = yOf(end) + CROWD.bottomPad;

        return {
            id: view.id,
            title: view.title || "帝系与群臣",
            href: view.href,
            meta: { watermark: "汉", ...view.meta },
            dynasty: { id: dynasty.id, name: dynasty.name, start: dynasty.start, end: dynasty.end },
            range: { start, end, startLabel: eraLabel(start), endLabel: eraLabel(end), years: elapsedYears(start, end) },
            groups,
            people,
            rulers,
            regencies,
            ticks,
            totalLanes,
            plot: {
                width: Math.round(plotWidth),
                height: Math.round(plotHeight),
                ppy: CROWD.ppy,
                top: CROWD.top,
                bottom: CROWD.bottomPad,
                axisX: CROWD.axisX,
                axisLine: CROWD.axisLine,
                bandX: CROWD.bandX,
                bandW: CROWD.bandW,
                regX: CROWD.regX,
                regW: CROWD.regW,
                hasRegency: regencies.length > 0,
                gutterHead: dynasty.start > start ? {
                    y: CROWD.top,
                    h: round1(yOf(dynasty.start) - CROWD.top),
                    label: "秦末",
                    rangeLabel: `${eraLabel(start)} — ${eraLabel(dynasty.start)}`
                } : null,
                gutterTail: dynasty.end < end ? {
                    y: yOf(dynasty.end),
                    h: round1(yOf(end) - yOf(dynasty.end)),
                    label: "新莽",
                    rangeLabel: `${eraLabel(dynasty.end)} — ${eraLabel(end)}`
                } : null,
                laneX0: CROWD.laneX0,
                lanePitch: CROWD.lanePitch,
                barWidth: CROWD.barWidth,
                laneCenter: Math.round(CROWD.laneX0 + (totalLanes * CROWD.lanePitch) / 2),
                endY: yOf(end)
            }
        };
    }
}

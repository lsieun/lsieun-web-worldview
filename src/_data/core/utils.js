/**
 * utils.js — 纯函数工具集
 *
 * 与状态无关的辅助函数，所有函数均可独立单元测试。
 * 命名与签名直接从原 world.js 提取，语义无任何变化。
 */

/* 公元前用「前 N」，公元直接写年份 */
export function formatYear(year) {
    return year < 0 ? `前 ${Math.abs(year)}` : String(year);
}

/* 帝系年表里跨公元前后的年份必须带「公元」，否则「5」会被读成公元前后不明 */
export function eraLabel(year) {
    if (year < 0) return `前 ${Math.abs(year)}`;
    if (year === 0) return "公元";
    return `公元 ${year}`;
}

/* 公元前与公元之间没有公元 0 年。 */
export function elapsedYears(start, end) {
    return end - start - (start < 0 && end > 0 ? 1 : 0);
}

/* 公元前 1 年之后即公元 1 年，没有公元 0 年，坐标据此压缩一格 */
export function yearPos(year, start) {
    return year - start - (start < 0 && year > 0 ? 1 : 0);
}

export function round1(value) {
    return Math.round(value * 10) / 10;
}

export function yearLabel(year, approx) {
    return (approx ? "约" : "") + eraLabel(year);
}

export function ageLabel(year, birth) {
    return `${year - birth} 岁`;
}

/* 页内已限定西汉，「西汉前少帝」省作「前少帝」 */
export function bandTitle(title) {
    return String(title || "").replace(/^西汉/, "");
}

export function chooseTickInterval(ppy, labelGap) {
    for (const value of [10, 20, 25, 50, 100]) {
        if (value * ppy >= labelGap) return value;
    }
    return 100;
}

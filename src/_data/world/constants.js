/**
 * constants.js — 视图布局常量与静态词典
 *
 * 调泳道布局改 CROWD，加谥法改 POSTHUMOUS，集中存放便于定位。
 */
import { bandTitle } from "./utils.js";

/* ---------- 帝系与群臣：泳道绘图参数 ---------- */
export const CROWD = {
    ppy: 3.6,          // 纵向像素 / 年
    top: 56,           // 绘图区顶部留白
    axisX: 70,         // 年份标签右对齐基线
    axisLine: 82,      // 年份轴脊线
    bandX: 92,         // 帝系条左缘
    bandW: 60,         // 帝系条宽度
    regX: 160,         // 临朝/辅政轨左缘
    regW: 36,          // 临朝/辅政轨宽度
    laneX0: 212,       // 第一条泳道左缘
    lanePitch: 24,     // 泳道间距
    barWidth: 4,       // 生命线宽度
    bottomPad: 28,
    minRulerHeight: 3, // 极短在位的最小可见高度
    labelMinHeight: 14, // 低于此高度不写单字
    labelGap: 60       // 时间标签达成 60px 间距才出现
};

/* ---------- 西汉谥法词典 ----------
 * 出自《逸周书·谥法解》一系，说明这个字凭什么给、适用于什么样的一生。 */
export const POSTHUMOUS = {
    "高": "德覆万物曰高；功最高曰高。刘邦扫平群雄、再成一统，故谥高皇帝。",
    "惠": "柔质慈民曰惠；爱民好与曰惠。惠帝在位宽仁，与民休息。",
    "文": "经天纬地曰文；道德博闻曰文。文帝轻徭薄赋、废除肉刑，以文德治天下。",
    "景": "布义行刚曰景；由义而济曰景。景帝平七国之乱，守成而不失刚断。",
    "武": "威强睿德曰武；克定祸乱曰武。武帝开边改制，以武功著称，亦耗损民力。",
    "昭": "昭德有劳曰昭；圣闻周达曰昭。昭帝幼年即位，委政霍光，守成安民。",
    "宣": "圣善周闻曰宣。宣帝起于民间，亲理政务，史称中兴。",
    "元": "能思辩众曰元；行义说民曰元。元帝好儒，优柔少断。",
    "成": "安民立政曰成。成帝承平，政渐移于外戚。",
    "哀": "蚤孤短折曰哀；恭仁短折曰哀。哀帝在位短促，政不出外戚。",
    "平": "执事有制曰平；治而无眚曰平。平帝幼年即位，为王莽所制。"
};

export function posthumousOf(title) {
    const clean = bandTitle(title);
    if (clean === "汉高祖") {
        return { label: "谥法 · 高", text: `${POSTHUMOUS["高"]}庙号太祖，「高祖」是后世习称。` };
    }
    const match = clean.match(/^汉(.)帝$/);
    if (match && POSTHUMOUS[match[1]]) {
        return {
            label: `谥法 · ${match[1]}`,
            text: `${POSTHUMOUS[match[1]]}谥号是对一生的总结，取其一世最著之德业。`
        };
    }
    if (clean === "汉废帝") {
        return { label: "称号", text: "「废帝」为史称，非谥号；在位二十七日即被霍光废黜，无谥法可释。" };
    }
    if (clean === "前少帝" || clean === "后少帝") {
        return { label: "称号", text: `「${clean}」为史称，非谥号；幼年即位、由吕后临朝，未及议谥。` };
    }
    if (clean === "孺子婴") {
        return { label: "称号", text: "「孺子婴」为史称，非谥号；即位未及改元即为王莽所废。" };
    }
    return { label: "称号", text: `「${clean}」为史称。` };
}

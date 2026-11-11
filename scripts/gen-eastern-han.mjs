import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DATA = 'src/_data';
const HISTORY = 'src/content/history';

// ============================================================
// 人物定义
// ============================================================

const figures = {
  liuxiu: { name: "刘秀", title: "汉光武帝", summary: "汉高祖九世孙，重建汉室，建立东汉。", parents: [] },
  "liuzhuang-mingdi": { name: "刘庄", title: "汉明帝", summary: "光武帝第四子，严明治国，开启明章之治。", parents: ["liuxiu"] },
  "liuda-zhangdi": { name: "刘炟", title: "汉章帝", summary: "明帝第五子，延续明章之治，后期外戚开始坐大。", parents: ["liuzhuang-mingdi"] },
  "lizhao-he": { name: "刘肇", title: "汉和帝", summary: "章帝第四子，幼年即位，清除窦氏外戚，宦官地位上升。", parents: ["liuda-zhangdi"] },
  "lilong-shang": { name: "刘隆", title: "汉殇帝", summary: "和帝少子，婴儿皇帝，在位仅八个月。", parents: ["lizhao-he"] },
  "liuqi-andi": { name: "刘祜", title: "汉安帝", summary: "章帝孙、清河孝王刘庆之子，邓太后迎立的旁支皇帝。", parents: ["liuqing"] },
  liuyi: { name: "刘懿", title: "北乡侯", summary: "章帝孙、济北惠王刘寿之子，阎太后所立，在位仅七个月。", parents: ["liushou"] },
  "liubao-shun": { name: "刘保", title: "汉顺帝", summary: "安帝之子，原太子被废后又被宦官迎立复位。", parents: ["liuqi-andi"] },
  "liubing-chong": { name: "刘炳", title: "汉冲帝", summary: "顺帝少子，三岁即位，梁氏外戚掌权，在位仅一年。", parents: ["liubao-shun"] },
  "liuzuan-zhi": { name: "刘缵", title: "汉质帝", summary: "章帝玄孙、千乘王刘伉之后，梁冀迎立，八岁即位九岁被毒死。", parents: ["liuhong-bohai"] },
  "lizhi-huan": { name: "刘志", title: "汉桓帝", summary: "章帝曾孙、河间王刘开之后，梁冀迎立，诛梁冀后宦官专权。", parents: ["liuyi-lizhi"] },
  "lihong-ling": { name: "刘宏", title: "汉灵帝", summary: "章帝曾孙、解渎亭侯刘苌之子，旁支入继，宦官与卖官并盛。", parents: ["liuchang"] },
  "liubian-shao": { name: "刘辩", title: "汉少帝", summary: "灵帝之子，何皇后所生，被董卓废为弘农王。", parents: ["lihong-ling"] },
  "liuxie-xian": { name: "刘协", title: "汉献帝", summary: "灵帝之子，王美人所生，董卓所立，东汉最后一位皇帝。", parents: ["lihong-ling"] },

  "liukan-kang": { name: "刘伉", title: "千乘贞王", summary: "章帝长子，长子但未立为太子，其后人刘缵入继皇位。", parents: ["liuda-zhangdi"] },
  liuqing: { name: "刘庆", title: "清河孝王", summary: "章帝第三子，原太子被废，其子刘祜入继皇位。", parents: ["liuda-zhangdi"] },
  liushou: { name: "刘寿", title: "济北惠王", summary: "章帝第五子，其子刘懿被阎太后短暂立为皇帝。", parents: ["liuda-zhangdi"] },
  "liukai-hejian": { name: "刘开", title: "河间孝王", summary: "章帝第六子，桓帝、灵帝两支旁支的共同祖先。", parents: ["liuda-zhangdi"] },
  "liuchong-yuean": { name: "刘宠", title: "乐安夷王", summary: "千乘王刘伉之子，其子刘鸿为质帝祖父。", parents: ["liukan-kang"] },
  liuhong-bohai: { name: "刘鸿", title: "渤海王", summary: "乐安王刘宠之子，质帝刘缵之父。", parents: ["liuchong-yuean"] },
  "liuyi-lizhi": { name: "刘翼", title: "蠡吾侯", summary: "河间王刘开之子，桓帝刘志之父。", parents: ["liukai-hejian"] },
  liuchang: { name: "刘苌", title: "解渎亭侯", summary: "河间王刘开之子，灵帝刘宏之父。", parents: ["liukai-hejian"] },

  dengtaihou: { name: "邓绥", title: "邓太后", summary: "和帝皇后，殇帝、安帝时期临朝称制约二十年。", parents: [] },
  liangji: { name: "梁冀", title: "梁冀", summary: "顺帝皇后之弟，跋扈将军，毒杀质帝、立桓帝。", parents: [] },
  douxian: { name: "窦宪", title: "窦宪", summary: "章帝皇后之兄，外戚，燕然勒石后被宦官排挤自杀。", parents: [] },
  dongzhuo: { name: "董卓", title: "董卓", summary: "凉州军阀，率兵入京废少帝立献帝，开启群雄割据。", parents: [] }
};

const events = [
  { id: "guangwu-dengji", year: 25, era: "建武", title: "刘秀称帝，东汉建立", desc: "在鄗城（今河北高邑）即位，延续汉为国号，定都洛阳，重建汉室。" },
  { id: "guangwu-duotian", year: 39, era: "建武", title: "度田令与检核户口", desc: "下令州郡检核垦田数目与户口，抑制豪强隐匿，强化中央控制。" },
  { id: "guangwu-jiaodu-zhuyi", year: 43, era: "建武", title: "平定交趾叛乱", desc: "派伏波将军马援平定交趾（今越南北部）叛乱，稳固南疆。" },

  { id: "mingdi-baima-si", year: 68, era: "永平", title: "白马寺建成", desc: "在洛阳营建白马寺，中国最早的佛教寺院之一。" },
  { id: "mingdi-yongping-dadun", year: 73, era: "永平", title: "窦固北伐匈奴、班超使西域", desc: "派窦固出击北匈奴，同时遣班超出使西域，重新打通汉与西域联系。" },

  { id: "zhangdi-baihu-guanyi", year: 79, era: "建初", title: "白虎观会议", desc: "章帝亲自主持经学大会，讨论五经同异，会后编成《白虎通义》。" },
  { id: "zhangdi-simaziao-qiufu", year: 85, era: "元和", title: "班超经营西域", desc: "班超在西域疏勒、于阗等地活动，巩固东汉对西域诸国的影响。" },

  { id: "hedi-cao-pao", year: 91, era: "永元", title: "窦宪燕然勒石", desc: "窦宪联合南匈奴大败北匈奴，在燕然山刻石记功。" },
  { id: "hedi-jimiyuan-gongbu", year: 102, era: "永元", title: "班超任西域都护", desc: "班超被任为西域都护，东汉对西域的控制达到顶峰。" },
  { id: "hedi-yanrong-bingbu", year: 105, era: "元兴", title: "蔡伦改进造纸术", desc: "蔡伦改进造纸工艺，使造纸原料更易获取，纸张逐渐普及。" },

  { id: "shangdi-jixu", year: 106, era: "延平", title: "殇帝夭折、邓太后迎立安帝", desc: "刘隆出生仅百余日即位，八个月后夭折；邓太后迎立清河王刘庆之子刘祜。" },

  { id: "andi-qiang-rebellion", year: 108, era: "永初", title: "羌人起义", desc: "先零羌在陇西、金城等地起义，东汉耗费巨大军力才逐步平定。" },
  { id: "andi-banjun-guizhou", year: 115, era: "元初", title: "滇零羌断陇道", desc: "羌人首领滇零大败东汉军队，一度阻断陇西与中原联系。" },
  { id: "andi-yanping", year: 125, era: "延光", title: "安帝去世、阎太后立北乡侯", desc: "安帝南巡途中驾崩，阎皇后秘不发丧，回京后废太子刘保，立济北王之子刘懿。" },

  { id: "liuyi-shouliang", year: 125, era: "延光", title: "北乡侯即位与卒、宦官迎立顺帝", desc: "刘懿在位仅七个月便病逝；宦官孙程等发动政变，迎立原太子刘保为帝。" },

  { id: "shundi-yongjian-reform", year: 129, era: "永建", title: "恢复西域都护", desc: "顺帝重新设立西域都护府，西域与中原再次建立联系。" },
  { id: "shundi-liang-nairong", year: 132, era: "阳嘉", title: "梁家外戚抬头", desc: "梁皇后之父梁商去世，梁冀袭爵，为日后跋扈专权埋下伏笔。" },
  { id: "shundi-chongdi-lihe", year: 144, era: "建康", title: "顺帝去世、冲帝即位", desc: "顺帝去世，年仅三岁的太子刘炳即位，梁皇后以太后身份临朝。" },

  { id: "chongdi-zayu", year: 145, era: "永嘉", title: "冲帝夭折、梁冀迎立质帝", desc: "刘炳在位仅一年病逝；梁冀迎立章帝玄孙刘缵，时年八岁。" },

  { id: "zhidi-liangji-dudu", year: 146, era: "本初", title: "质帝被毒杀、桓帝即位", desc: "梁冀不满质帝称其'跋扈将军'，将其毒杀；随即迎立蠡吾侯刘志为帝。" },

  { id: "huandi-zhuliang", year: 159, era: "延熹", title: "桓帝诛梁冀、宦官崛起", desc: "桓帝联合宦官单超等人诛杀梁冀；此后宦官权势大增，与士大夫冲突加剧。" },
  { id: "huandi-pengdang-huo", year: 166, era: "延熹", title: "第一次党锢之祸", desc: "宦官诬告李膺等士人结党，桓帝下令逮捕党人，第一次党锢之祸爆发。" },
  { id: "huandi-guangming-mingjiao", year: 168, era: "建宁", title: "桓帝去世、灵帝即位", desc: "桓帝去世，无嗣；窦太后迎立河间王之后刘宏，时年十二岁。" },

  { id: "lingdi-danggu-er", year: 169, era: "建宁", title: "第二次党锢之祸", desc: "宦官侯览等再次兴起党锢，大批士人被害或禁锢终身，东汉士大夫阶层元气大伤。" },
  { id: "lingdi-maiguannmaijue", year: 178, era: "光和", title: "西邸卖官", desc: "灵帝在西园设立'西邸'，公开卖官鬻爵，上至三公下至县令皆有定价。" },
  { id: "lingdi-huangjin", year: 184, era: "中平", title: "黄巾起义", desc: "太平道张角以'苍天已死，黄天当立'号召三十六方同日而起，东汉王朝根基动摇。" },
  { id: "lingdi-shi-changshi", year: 189, era: "中平", title: "灵帝去世、何进谋诛宦官", desc: "灵帝去世，太子刘辩即位；大将军何进谋诛宦官，事泄被杀，洛阳大乱。" },

  { id: "shaodi-dongzhuo-rujing", year: 189, era: "光熹", title: "董卓入京、废少帝立献帝", desc: "董卓率兵进入洛阳，先改元，再废少帝刘辩为弘农王，立陈留王刘协为帝。" },

  { id: "xiandi-xuchao-dongjing", year: 196, era: "建安", title: "曹操迎献帝至许", desc: "曹操将被李傕、郭汜裹挟的献帝迎至许县（后改名许都），'挟天子以令诸侯'局面形成。" },
  { id: "xiandi-guandu", year: 200, era: "建安", title: "官渡之战", desc: "曹操与袁绍在官渡决战，曹操以少胜多，奠定统一北方基础。" },
  { id: "xiandi-chibi", year: 208, era: "建安", title: "赤壁之战", desc: "曹操南下，孙刘联军在赤壁用火攻大败曹军，三国鼎立格局初现。" },
  { id: "xiandi-chanshan", year: 220, era: "延康", title: "献帝禅让、曹魏建立", desc: "曹丕逼迫献帝禅让，代汉建魏，东汉正式终结。刘协被封为山阳公。" }
];

const rulers = [
  { figure: "liuxiu", title: "汉光武帝", status: "formal", order: 1,
    note: "汉高祖九世孙，出自长沙定王刘发之后。先以绿林一支在昆阳之战中大败王莽主力（前 23 年，即位前），25 年称帝重建汉室，开启光武中兴。",
    terms: [{ start: 25, end: 57, events: ["guangwu-dengji", "guangwu-duotian", "guangwu-jiaodu-zhuyi"] }] },
  { figure: "liuzhuang-mingdi", title: "汉明帝", status: "formal", order: 2,
    note: "光武帝第四子。严明治国，推动佛教传入中国，班超重新打通西域。",
    terms: [{ start: 57, end: 75, events: ["mingdi-baima-si", "mingdi-yongping-dadun"] }] },
  { figure: "liuda-zhangdi", title: "汉章帝", status: "formal", order: 3,
    note: "明帝第五子。延续明章之治，主持白虎观经学大会。窦氏外戚开始坐大。",
    terms: [{ start: 75, end: 88, events: ["zhangdi-baihu-guanyi", "zhangdi-simaziao-qiufu"] }] },
  { figure: "lizhao-he", title: "汉和帝", status: "formal", order: 4,
    note: "章帝第四子。幼年即位，清除窦氏外戚，同时抬高宦官地位。蔡伦改进造纸术。",
    terms: [{ start: 88, end: 106, events: ["hedi-cao-pao", "hedi-jimiyuan-gongbu", "hedi-yanrong-bingbu"] }] },
  { figure: "lilong-shang", title: "汉殇帝", status: "formal", order: 5,
    note: "和帝少子，出生仅百余日即位，在位八个月夭折。邓太后临朝。",
    terms: [{ start: 106, end: 106, durationLabel: "不足一年", events: ["shangdi-jixu"] }] },
  { figure: "liuqi-andi", title: "汉安帝", status: "formal", order: 6,
    note: "章帝孙、清河孝王刘庆之子。邓太后迎立的旁支皇帝，亲政后东汉中期问题加深。",
    terms: [{ start: 106, end: 125, events: ["andi-qiang-rebellion", "andi-banjun-guizhou", "andi-yanping"] }] },
  { figure: "liuyi", title: "北乡侯", status: "formal", order: 7,
    note: "章帝孙、济北惠王刘寿之子。阎太后所立，在位七个月即病逝。",
    terms: [{ start: 125, end: 125, durationLabel: "七个月", events: ["liuyi-shouliang"] }] },
  { figure: "liubao-shun", title: "汉顺帝", status: "formal", order: 8,
    note: "安帝之子，原太子被废后又被宦官迎立复位。梁氏外戚与宦官交替掌权。",
    terms: [{ start: 125, end: 144, events: ["shundi-yongjian-reform", "shundi-liang-nairong"] }] },
  { figure: "liubing-chong", title: "汉冲帝", status: "formal", order: 9,
    note: "顺帝少子，三岁即位。梁太后临朝，在位一年病逝。",
    terms: [{ start: 144, end: 145, durationLabel: "约一年", events: ["shundi-chongdi-lihe", "chongdi-zayu"] }] },
  { figure: "liuzuan-zhi", title: "汉质帝", status: "formal", order: 10,
    note: "章帝玄孙、千乘王刘伉之后。梁冀迎立，八岁即位，九岁因不满梁冀跋扈被毒杀。",
    terms: [{ start: 145, end: 146, events: ["zhidi-liangji-dudu"] }] },
  { figure: "lizhi-huan", title: "汉桓帝", status: "formal", order: 11,
    note: "章帝曾孙、河间王刘开之后。梁冀迎立，诛梁冀后宦官崛起，两次党锢之祸。",
    terms: [{ start: 146, end: 168, events: ["huandi-zhuliang", "huandi-pengdang-huo", "huandi-guangming-mingjiao"] }] },
  { figure: "lihong-ling", title: "汉灵帝", status: "formal", order: 12,
    note: "章帝曾孙、解渎亭侯刘苌之子。旁支入继，宦官专权、西邸卖官，黄巾起义爆发。",
    terms: [{ start: 168, end: 189, events: ["lingdi-danggu-er", "lingdi-maiguannmaijue", "lingdi-huangjin", "lingdi-shi-changshi"] }] },
  { figure: "liubian-shao", title: "汉少帝", status: "formal", order: 13,
    note: "灵帝之子，何皇后所生。何进事泄被杀后，董卓入京废其为弘农王。",
    terms: [{ start: 189, end: 189, events: ["shaodi-dongzhuo-rujing"] }] },
  { figure: "liuxie-xian", title: "汉献帝", status: "formal", order: 14,
    note: "灵帝之子，王美人所生。董卓所立，长期受军阀控制。220 年禅让，东汉终结。",
    terms: [{ start: 189, end: 220, events: ["xiandi-xuchao-dongjing", "xiandi-guandu", "xiandi-chibi", "xiandi-chanshan"] }] }
];

const regencies = [
  { figure: "dengtaihou", start: 105, end: 121, label: "临朝称制", note: "和帝去世后临朝，历经殇帝、安帝两朝，实际掌权约十六年。" },
  { figure: "liangji", start: 141, end: 159, label: "外戚专权", note: "以大将军身份总揽朝政，先后立冲帝、质帝、桓帝，毒杀质帝，跋扈十八年。" },
  { figure: "douxian", start: 88, end: 92, label: "外戚辅政", note: "以车骑将军身份出击匈奴、勒石燕然，随后因事败自杀。" },
  { figure: "dongzhuo", start: 189, end: 192, label: "军阀专权", note: "率兵入京废少帝立献帝，挟持汉献帝迁都长安，开启群雄割据。" }
];

const treeFigures = [
  "liuxiu", "liuzhuang-mingdi", "liuda-zhangdi",
  "lizhao-he", "lilong-shang",
  "liuqing", "liuqi-andi", "liubao-shun", "liubing-chong",
  "liushou", "liuyi",
  "liukan-kang", "liuchong-yuean", "liuhong-bohai", "liuzuan-zhi",
  "liukai-hejian", "liuyi-lizhi", "lizhi-huan", "liuchang", "lihong-ling", "liubian-shao", "liuxie-xian"
];

function writeJSON(relPath, obj) {
  const abs = path.join(ROOT, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function writeFile(relPath, content) {
  const abs = path.join(ROOT, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
}

writeJSON(path.join(DATA, "dynasties", "eastern-han.json"), {
  name: "东汉",
  en: "EASTERN HAN",
  start: 25,
  end: 220,
  order: 90,
  summary: "光武中兴，明章之治，戚宦循环，黄巾起事后崩解。",
  rulers,
  regencies
});
console.log('✓ dynasties/eastern-han.json');

writeJSON(path.join(DATA, "views", "eastern-han-emperors.json"), {
  type: "dynasty-reigns",
  dynasty: "eastern-han",
  title: "东汉历代皇帝",
  href: "/history/eastern-han-emperors.html",
  topicMeta: "帝王世系",
  summary: "从光武到献帝，以十四位皇帝的在位纪年与血缘世系，观察外戚、宦官与旁支入继如何牵引东汉政治走向。",
  figures: treeFigures,
  meta: {
    watermark: "汉",
    subtitle: "同一位皇帝，在纪年中是一段统治，在世系中则是一个血缘节点。东汉的世系树比西汉更加枝繁叶茂：旁支入继频繁、外戚与宦官交替掌权，让帝统多次偏离父死子继的主轨。",
    tags: ["东汉", "14 帝", "世系与纪年"],
    intro: "默认沿竖向时间线阅读每位皇帝的在位年段与任内大事；切换到世系树，则可追溯他的父系来源和入继路径。东汉中后期几乎所有皇帝都是章帝刘炟的后代，但旁支入继在桓帝、灵帝时期尤其显著。",
    note: "帝序采用『14 位正式即位皇帝』口径。北乡侯刘懿、少帝刘辩虽为短暂废立，仍按实际即位经历保留正式序号。邓太后、梁冀、窦宪、董卓等称制或专权者另列为权力背景。年份以年为精度。"
  }
});
console.log('✓ views/eastern-han-emperors.json');

for (const [id, fig] of Object.entries(figures)) {
  writeJSON(path.join(DATA, "figures", `${id}.json`), {
    id,
    name: fig.name,
    title: fig.title,
    summary: fig.summary,
    parents: fig.parents,
    tags: fig.parents.length ? ["宗室", "汉朝"] : ["开国皇帝", "东汉"]
  });
}
console.log(`✓ ${Object.keys(figures).length} 个 figures/*.json`);

for (const ev of events) {
  writeJSON(path.join(DATA, "events", `${ev.id}.json`), {
    id: ev.id,
    title: ev.title,
    year: ev.year,
    era: ev.era || "",
    desc: ev.desc,
    dynasty: "eastern-han"
  });
}
console.log(`✓ ${events.length} 个 events/*.json`);

writeFile(path.join(HISTORY, "eastern-han-emperors.html"),
`---
title: "东汉历代皇帝"
description: "以竖向在位时间线与血缘世系树，呈现东汉十四位正式皇帝、旁支入继与外戚宦官循环。"
layout: "default.html"
---
{% set reignView = world.reignViews["eastern-han-emperors"] %}
{% include "dynasty-reigns-page.html" %}
`);
console.log('✓ content/history/eastern-han-emperors.html');

console.log(`\n全部完成！共 ${2 + Object.keys(figures).length + events.length + 1} 个文件。`);

import type { Creator, ZoteroPayloadItem } from "./schema.js";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "based",
  "by",
  "for",
  "from",
  "in",
  "into",
  "of",
  "on",
  "the",
  "to",
  "toward",
  "towards",
  "using",
  "via",
  "with"
]);

const CHINESE_COMPOUND_SURNAMES: Record<string, string> = {
  欧阳: "Ouyang", 司马: "Sima", 上官: "Shangguan", 诸葛: "Zhuge", 东方: "Dongfang",
  皇甫: "Huangfu", 尉迟: "Yuchi", 公孙: "Gongsun", 慕容: "Murong", 司徒: "Situ"
};

const CHINESE_SURNAMES: Record<string, string> = {
  赵: "Zhao", 钱: "Qian", 孙: "Sun", 李: "Li", 周: "Zhou", 吴: "Wu", 郑: "Zheng", 王: "Wang",
  冯: "Feng", 陈: "Chen", 褚: "Chu", 卫: "Wei", 蒋: "Jiang", 沈: "Shen", 韩: "Han", 杨: "Yang",
  朱: "Zhu", 秦: "Qin", 尤: "You", 许: "Xu", 何: "He", 吕: "Lu", 施: "Shi", 张: "Zhang",
  孔: "Kong", 曹: "Cao", 严: "Yan", 华: "Hua", 金: "Jin", 魏: "Wei", 陶: "Tao", 姜: "Jiang",
  戚: "Qi", 谢: "Xie", 邹: "Zou", 喻: "Yu", 柏: "Bai", 水: "Shui", 窦: "Dou", 章: "Zhang",
  云: "Yun", 苏: "Su", 潘: "Pan", 葛: "Ge", 奚: "Xi", 范: "Fan", 彭: "Peng", 郎: "Lang",
  鲁: "Lu", 韦: "Wei", 昌: "Chang", 马: "Ma", 苗: "Miao", 凤: "Feng", 花: "Hua", 方: "Fang",
  俞: "Yu", 任: "Ren", 袁: "Yuan", 柳: "Liu", 鲍: "Bao", 史: "Shi", 唐: "Tang", 费: "Fei",
  廉: "Lian", 岑: "Cen", 薛: "Xue", 雷: "Lei", 贺: "He", 倪: "Ni", 汤: "Tang", 滕: "Teng",
  殷: "Yin", 罗: "Luo", 毕: "Bi", 郝: "Hao", 邬: "Wu", 安: "An", 常: "Chang", 乐: "Yue",
  于: "Yu", 时: "Shi", 傅: "Fu", 皮: "Pi", 卞: "Bian", 齐: "Qi", 康: "Kang", 伍: "Wu",
  余: "Yu", 元: "Yuan", 卜: "Bu", 顾: "Gu", 孟: "Meng", 平: "Ping", 黄: "Huang", 和: "He",
  穆: "Mu", 萧: "Xiao", 尹: "Yin", 姚: "Yao", 邵: "Shao", 湛: "Zhan", 汪: "Wang", 祁: "Qi",
  毛: "Mao", 禹: "Yu", 狄: "Di", 米: "Mi", 贝: "Bei", 明: "Ming", 臧: "Zang", 计: "Ji",
  伏: "Fu", 成: "Cheng", 戴: "Dai", 谈: "Tan", 宋: "Song", 茅: "Mao", 庞: "Pang", 熊: "Xiong",
  纪: "Ji", 舒: "Shu", 屈: "Qu", 项: "Xiang", 祝: "Zhu", 董: "Dong", 梁: "Liang", 杜: "Du",
  阮: "Ruan", 蓝: "Lan", 闵: "Min", 席: "Xi", 季: "Ji", 麻: "Ma", 强: "Qiang", 贾: "Jia",
  路: "Lu", 娄: "Lou", 危: "Wei", 江: "Jiang", 童: "Tong", 颜: "Yan", 郭: "Guo", 梅: "Mei",
  盛: "Sheng", 林: "Lin", 钟: "Zhong", 徐: "Xu", 邱: "Qiu", 骆: "Luo", 高: "Gao", 夏: "Xia",
  蔡: "Cai", 田: "Tian", 樊: "Fan", 胡: "Hu", 凌: "Ling", 霍: "Huo", 虞: "Yu", 万: "Wan",
  支: "Zhi", 柯: "Ke", 管: "Guan", 卢: "Lu", 莫: "Mo", 经: "Jing", 房: "Fang", 裘: "Qiu",
  缪: "Miao", 干: "Gan", 解: "Xie", 应: "Ying", 宗: "Zong", 丁: "Ding", 宣: "Xuan", 邓: "Deng",
  单: "Shan", 杭: "Hang", 洪: "Hong", 包: "Bao", 左: "Zuo", 石: "Shi", 崔: "Cui", 吉: "Ji",
  龚: "Gong", 程: "Cheng", 邢: "Xing", 裴: "Pei", 陆: "Lu", 荣: "Rong", 翁: "Weng", 荀: "Xun",
  羊: "Yang", 惠: "Hui", 甄: "Zhen", 曲: "Qu", 封: "Feng", 储: "Chu", 靳: "Jin", 汲: "Ji",
  邴: "Bing", 糜: "Mi", 松: "Song", 井: "Jing", 段: "Duan", 富: "Fu", 巫: "Wu", 乌: "Wu",
  焦: "Jiao", 巴: "Ba", 弓: "Gong", 牧: "Mu", 隗: "Kui", 山: "Shan", 谷: "Gu", 车: "Che",
  侯: "Hou", 宓: "Mi", 蓬: "Peng", 全: "Quan", 郗: "Xi", 班: "Ban", 仰: "Yang", 秋: "Qiu",
  仲: "Zhong", 伊: "Yi", 宫: "Gong", 宁: "Ning", 仇: "Qiu", 栾: "Luan", 暴: "Bao", 甘: "Gan",
  钭: "Tou", 厉: "Li", 戎: "Rong", 祖: "Zu", 武: "Wu", 符: "Fu", 刘: "Liu", 景: "Jing",
  詹: "Zhan", 束: "Shu", 龙: "Long", 叶: "Ye", 幸: "Xing", 司: "Si", 韶: "Shao", 黎: "Li"
};

export function creatorDisplayName(creator: Creator): string {
  if (creator.name) return creator.name;
  const parts = [creator.lastName, creator.firstName].filter(Boolean);
  return parts.join(", ");
}

export function firstAuthorLastName(item: ZoteroPayloadItem): string {
  const first = item.creators?.find((creator) => creator.creatorType === "author") ?? item.creators?.[0];
  const value = first?.lastName ?? first?.name ?? "Unknown";
  const ascii = sanitizePart(value);
  if (ascii) return ascii;
  const chineseSurname = CHINESE_COMPOUND_SURNAMES[value.slice(0, 2)] ?? CHINESE_SURNAMES[value.charAt(0)];
  if (chineseSurname) return chineseSurname;
  const stableItemKey = sanitizePart(item.itemKey).slice(0, 8);
  return stableItemKey ? `Ref${stableItemKey}` : "Reference";
}

export function itemYear(item: ZoteroPayloadItem): string {
  const source = item.year || item.date || "";
  return source.match(/\d{4}/)?.[0] ?? "n.d.";
}

export function generateCitekey(item: ZoteroPayloadItem, existing: Iterable<string> = []): string {
  const used = new Set(Array.from(existing));
  const base = `${firstAuthorLastName(item)}${itemYear(item)}${titleKeyword(item.title ?? "")}`;
  let candidate = base || "Reference";
  if (!used.has(candidate)) return candidate;

  for (let code = 65; code <= 90; code += 1) {
    candidate = `${base}${String.fromCharCode(code)}`;
    if (!used.has(candidate)) return candidate;
  }

  let suffix = 2;
  do {
    candidate = `${base}${suffix}`;
    suffix += 1;
  } while (used.has(candidate));
  return candidate;
}

function titleKeyword(title: string): string {
  const acronym = title.match(/\b[A-Z][A-Z0-9]{2,}[A-Za-z0-9-]*\b/)?.[0];
  if (acronym) return sanitizePart(acronym);

  for (const word of title.split(/\s+/)) {
    const clean = word.replace(/[^A-Za-z0-9]/g, "");
    if (clean.length >= 4 && !STOP_WORDS.has(clean.toLowerCase())) {
      return capitalize(clean);
    }
  }
  return "Reference";
}

function sanitizePart(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]/g, "");
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

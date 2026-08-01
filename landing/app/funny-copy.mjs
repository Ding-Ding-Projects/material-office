const EN_TAILS = Object.freeze({
  headline: ["", " Clear and considered.", " Ready when you are.", " The paperwork is behaving today.", " The paperwork has put on its best jacket."],
  body: ["", " Kept clear and specific.", " Friendly, specific, and ready to explore.", " Still exact; just less beige.", " Exact facts, now with maximum desk-side sparkle."],
  action: ["", " Ready.", " Let’s go.", " Nicely queued.", " Ready to roll—tiny fanfare included."],
  status: ["", " Status shown exactly.", " The details stay precise.", " The status desk is keeping it exact.", " Tiny badge, exact status—no fortune-telling."],
  info: ["", " For your reference.", " Here when useful.", " A tidy note from the desk.", " A tiny memo has rolled into view."],
  success: ["", " Completed.", " Nicely done.", " Done; the checkbox may relax.", " Done—the checkbox is doing a victory lap."],
  warning: ["", " Review before continuing.", " Worth a careful look.", " Pause here; the facts have raised a hand.", " Tiny gong, serious facts: review before continuing."],
  error: ["", " The details and recovery step remain unchanged.", " It did not work; the facts below show why.", " The gremlin is named below, along with the recovery step.", " The gremlin brought paperwork; the exact failure and recovery step are below."],
  security: ["", " Security facts stay exact.", " Protection details remain precise.", " The lock has personality; the boundary does not move.", " Tiny shield, exact boundary—no secret trapdoors."],
  financial: ["", " Amounts stay exact.", " Totals and consequences remain precise.", " The calculator may smile; every amount stays fixed.", " Confetti stays imaginary; every amount and consequence remains exact."],
  destructive: ["", " Affected items stay exact.", " Review the precise impact before continuing.", " The delete button may look dramatic; the listed impact is exact.", " Tiny danger gong; the affected items and irreversibility stay exact."],
  accessibility: ["", " Clear navigation label.", " Keyboard-ready navigation label.", " Keyboard-ready; no treasure map required.", " Keyboard-ready; even the tiny fanfare has a name."],
});

const YUE_TAILS = Object.freeze({
  headline: ["", " 清楚穩陣。", " 準備好就睇。", " 今日啲文書幾合作。", " 啲文書着好西裝出場喇。"],
  body: ["", " 清楚具體。", " 友善直接，隨時可以探索。", " 事實照舊，只係冇咁米色。", " 事實鎖實，再加滿格枱面閃光。"],
  action: ["", " 準備好。", " 行得。", " 排好隊喇。", " 開波，附送迷你號角。"],
  status: ["", " 狀態如實顯示。", " 詳情保持準確。", " 狀態櫃位繼續準確報數。", " 迷你章一個，狀態照實，唔會預測未來。"],
  info: ["", " 畀你參考。", " 有用先睇。", " 枱面有張整齊便條。", " 有張迷你便條碌咗入畫面。"],
  success: ["", " 已完成。", " 搞掂得幾靚。", " 搞掂，個剔可以鬆一口氣。", " 搞掂，個剔正繞場一周。"],
  warning: ["", " 繼續前請檢查。", " 值得望清楚。", " 停一停，啲事實舉咗手。", " 迷你鑼一響，正經事實：繼續前請檢查。"],
  error: ["", " 詳情同復原步驟冇改。", " 未做到；下面如實講原因。", " 隻故障精靈已點名，復原步驟亦喺下面。", " 隻故障精靈帶齊文件；確實失敗同復原步驟都喺下面。"],
  security: ["", " 安全事實保持準確。", " 保護詳情照樣精確。", " 把鎖可以有性格，安全界線唔會郁。", " 迷你盾牌，界線照實，冇秘密活門。"],
  financial: ["", " 金額保持準確。", " 總額同後果照樣精確。", " 計數機可以笑，所有金額照舊。", " 紙碎只係想像；所有金額同後果保持準確。"],
  destructive: ["", " 受影響項目保持準確。", " 繼續前請檢查確實影響。", " 刪除掣可以好戲劇化，列出嘅影響依然準確。", " 迷你危險鑼；受影響項目同不可逆性照實。"],
  accessibility: ["", " 清楚導覽標籤。", " 鍵盤操作就緒。", " 鍵盤操作就緒，唔使搵藏寶圖。", " 鍵盤操作就緒，連迷你號角都有名。"],
});

export const FUNNY_COPY_CATEGORIES = Object.freeze(Object.keys(EN_TAILS));

export function clampFunnyLevel(value, fallback) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isInteger(numeric) ? Math.max(1, Math.min(5, numeric)) : fallback;
}

export function applyFunnyVoice({ language, en, yue, funnyEn, funnyYue, category }) {
  if (!Object.hasOwn(EN_TAILS, category)) throw new Error(`Unknown copy category: ${category}`);
  const enCopy = `${en}${EN_TAILS[category][clampFunnyLevel(funnyEn, 2) - 1]}`;
  const yueCopy = `${yue}${YUE_TAILS[category][clampFunnyLevel(funnyYue, 3) - 1]}`;
  if (language === "yue") return yueCopy;
  if (language === "both") return `${enCopy} · ${yueCopy}`;
  return enCopy;
}

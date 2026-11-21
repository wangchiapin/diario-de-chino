/* 節慶主題（學生頁用）：依日期自動換配色＋小裝飾，也可由後台手動指定。
   規則：節慶當天的「前 3 天到後 2 天」套用；兩個節慶重疊時，離哪個節慶當天近就用哪個。
   後台設定存在 portal/{老師uid}/config/theme：{ mode:'auto'|'off'|'force', id:'xmas', updatedAt }
   新增節慶：在 PT_FEST 加一筆（日期規則＋名稱），並在 PT_ASSETS 加同 id 的 css 與裝飾。 */
var PT_BEFORE = 3, PT_AFTER = 2;

var PT_FEST = [
  { id: 'xmas', name: { es: 'Navidad', en: 'Christmas', tc: '聖誕節', sc: '圣诞节' }, date: function (y) { return [12, 25]; } },
  { id: 'halloween', name: { es: 'Halloween', en: 'Halloween', tc: '萬聖節', sc: '万圣节' }, date: function (y) { return [10, 31]; } },
  { id: 'cny', name: { es: 'Año Nuevo Chino', en: 'Lunar New Year', tc: '春節', sc: '春节' }, date: function (y) { return ptLunarNewYear(y); } },
  { id: 'lantern', name: { es: 'Fiesta de los Faroles', en: 'Lantern Festival', tc: '元宵節', sc: '元宵节' }, date: function (y) { var c = ptLunarNewYear(y), t = new Date(Date.UTC(y, c[0] - 1, c[1] + 14)); return [t.getUTCMonth() + 1, t.getUTCDate()]; } } /* 農曆正月十五 = 春節 + 14 天 */
];

/* 春節（農曆正月初一）的西曆日期。
   優先用核對過的日期表（2025–2040）；表外的年份才用瀏覽器的農曆算（Intl chinese）。
   為什麼不直接算：瀏覽器的農曆在 2027、2030 年會差一天（新月剛好落在半夜），所以表裡的日期以官方曆為準。
   之後要延長：在 PT_CNY 補一行 年: [月, 日]，並到 tests/run.js 的「春節日期表」測試加上對照。 */
var PT_CNY = { 2025: [1, 29], 2026: [2, 17], 2027: [2, 6], 2028: [1, 26], 2029: [2, 13], 2030: [2, 3], 2031: [1, 23], 2032: [2, 11],
  2033: [1, 31], 2034: [2, 19], 2035: [2, 8], 2036: [1, 28], 2037: [2, 15], 2038: [2, 4], 2039: [1, 24], 2040: [2, 12] };
function ptLunarNewYear(y) {
  if (PT_CNY[y]) return PT_CNY[y];
  try {
    var f = new Intl.DateTimeFormat('en-u-ca-chinese', { timeZone: 'UTC', month: 'numeric', day: 'numeric' });
    for (var i = 0; i < 60; i++) {
      var t = new Date(Date.UTC(y, 0, 15 + i, 12)), m = '', d = '';
      f.formatToParts(t).forEach(function (x) { if (x.type === 'month') m = x.value; if (x.type === 'day') d = x.value; });
      if (m === '1' && d === '1') return [t.getUTCMonth() + 1, t.getUTCDate()];
    }
  } catch (e) { }
  return [2, 1];
}

var PT_GREET = {
  xmas: { es: ['¡Feliz Navidad!', '聖誕快樂'], en: ['Merry Christmas!', '聖誕快樂'], tc: ['聖誕快樂', 'Feliz Navidad'], sc: ['圣诞快乐', 'Feliz Navidad'] },
  halloween: { es: ['¡Feliz Halloween!', '萬聖節快樂'], en: ['Happy Halloween!', '萬聖節快樂'], tc: ['萬聖節快樂', 'Feliz Halloween'], sc: ['万圣节快乐', 'Feliz Halloween'] },
  cny: { es: ['¡Feliz Año Nuevo Lunar!', '新年快樂　恭喜發財'], en: ['Happy Lunar New Year!', '新年快樂　恭喜發財'], tc: ['新年快樂　恭喜發財', 'Feliz Año Nuevo Lunar'], sc: ['新年快乐　恭喜发财', 'Feliz Año Nuevo Lunar'] },
  lantern: { es: ['¡Feliz Fiesta de los Faroles!', '元宵節快樂'], en: ['Happy Lantern Festival!', '元宵節快樂'], tc: ['元宵節快樂', 'Feliz Fiesta de los Faroles'], sc: ['元宵节快乐', 'Feliz Fiesta de los Faroles'] }
};

function ptDayNum(y, m, d) { return Math.round(Date.UTC(y, m - 1, d) / 86400000); }
function ptIso(n) { var t = new Date(n * 86400000); return t.getUTCFullYear() + '-' + String(t.getUTCMonth() + 1).padStart(2, '0') + '-' + String(t.getUTCDate()).padStart(2, '0'); }
function ptTodayIso() { var t = new Date(); return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'); }
function ptFestById(id) { for (var i = 0; i < PT_FEST.length; i++) if (PT_FEST[i].id === id) return PT_FEST[i]; return null; }
function ptFestDay(f, y) { var md = f.date(y); return ptDayNum(y, md[0], md[1]); }

/* 某一天（YYYY-MM-DD）該套用哪個節慶；沒有就回 null */
function ptPick(iso) {
  var p = String(iso).split('-'), y = +p[0], today = ptDayNum(y, +p[1], +p[2]), best = null, bestAbs = 1e9;
  for (var i = 0; i < PT_FEST.length; i++) {
    for (var yy = y - 1; yy <= y + 1; yy++) {
      var diff = today - ptFestDay(PT_FEST[i], yy);
      if (diff >= -PT_BEFORE && diff <= PT_AFTER && Math.abs(diff) < bestAbs) { best = PT_FEST[i].id; bestAbs = Math.abs(diff); }
    }
  }
  return best;
}
/* 套用範圍文字（給後台顯示）：例如「12/22–12/27」 */
function ptRangeText(id, y) {
  var f = ptFestById(id); if (!f) return '';
  var a = ptIso(ptFestDay(f, y) - PT_BEFORE), b = ptIso(ptFestDay(f, y) + PT_AFTER);
  return a.slice(5).replace('-', '/') + '–' + b.slice(5).replace('-', '/');
}
/* 設定 + 日期 → 要用的節慶 id 或 null */
function ptResolve(cfg, iso) {
  if (cfg && cfg.mode === 'off') return null;
  if (cfg && cfg.mode === 'force') return ptFestById(cfg.id) ? cfg.id : null;
  return ptPick(iso);
}

var PT_CFG = null, PT_ACTIVE = null;
function ptSetCfg(cfg) { PT_CFG = cfg || null; ptApply(ptResolve(PT_CFG, ptTodayIso())); }
function ptLangKey(lang) { return lang === 'es' || lang === 'en' || lang === 'sc' ? lang : 'tc'; }

/* ───── 裝飾與配色（每個節慶一組） ───── */
var PT_SVG = {
  poin: "<svg width=\"54\" height=\"54\" viewBox=\"0 0 64 64\" aria-hidden=\"true\">\n<g fill=\"#5d7d5f\"><ellipse cx=\"32\" cy=\"14\" rx=\"6\" ry=\"13\" transform=\"rotate(-50 32 32)\"/><ellipse cx=\"32\" cy=\"14\" rx=\"6\" ry=\"13\" transform=\"rotate(50 32 32)\"/><ellipse cx=\"32\" cy=\"14\" rx=\"6\" ry=\"13\" transform=\"rotate(130 32 32)\"/><ellipse cx=\"32\" cy=\"14\" rx=\"6\" ry=\"13\" transform=\"rotate(230 32 32)\"/></g>\n<g fill=\"#b04a42\"><ellipse cx=\"32\" cy=\"15\" rx=\"6.5\" ry=\"13\" /><ellipse cx=\"32\" cy=\"15\" rx=\"6.5\" ry=\"13\" transform=\"rotate(45 32 32)\"/><ellipse cx=\"32\" cy=\"15\" rx=\"6.5\" ry=\"13\" transform=\"rotate(90 32 32)\"/><ellipse cx=\"32\" cy=\"15\" rx=\"6.5\" ry=\"13\" transform=\"rotate(135 32 32)\"/><ellipse cx=\"32\" cy=\"15\" rx=\"6.5\" ry=\"13\" transform=\"rotate(180 32 32)\"/><ellipse cx=\"32\" cy=\"15\" rx=\"6.5\" ry=\"13\" transform=\"rotate(225 32 32)\"/><ellipse cx=\"32\" cy=\"15\" rx=\"6.5\" ry=\"13\" transform=\"rotate(270 32 32)\"/><ellipse cx=\"32\" cy=\"15\" rx=\"6.5\" ry=\"13\" transform=\"rotate(315 32 32)\"/></g>\n<g fill=\"#c9605a\" opacity=\".55\"><ellipse cx=\"32\" cy=\"18\" rx=\"2.6\" ry=\"8\"/><ellipse cx=\"32\" cy=\"18\" rx=\"2.6\" ry=\"8\" transform=\"rotate(90 32 32)\"/><ellipse cx=\"32\" cy=\"18\" rx=\"2.6\" ry=\"8\" transform=\"rotate(180 32 32)\"/><ellipse cx=\"32\" cy=\"18\" rx=\"2.6\" ry=\"8\" transform=\"rotate(270 32 32)\"/></g>\n<g fill=\"#d2b05a\"><circle cx=\"32\" cy=\"32\" r=\"3.2\"/><circle cx=\"27.5\" cy=\"29\" r=\"2\"/><circle cx=\"36.5\" cy=\"29\" r=\"2\"/><circle cx=\"29\" cy=\"36.5\" r=\"2\"/><circle cx=\"35\" cy=\"36.5\" r=\"2\"/></g></svg>",
  holly: "<svg class=\"holly\" width=\"86\" height=\"50\" viewBox=\"0 0 86 50\"><g fill=\"#5d7d5f\"><path d=\"M40 28c-8-12 0-22 12-22 2 10-2 20-12 22z\" transform=\"rotate(10 40 28)\"/><path d=\"M42 30c-14-3-20-14-12-24 10 4 16 14 12 24z\" transform=\"rotate(-70 42 30)\"/><path d=\"M42 30c-14-3-20-14-12-24 10 4 16 14 12 24z\" transform=\"rotate(30 42 30)\"/></g><g fill=\"#b04a42\"><circle cx=\"40\" cy=\"31\" r=\"5\"/><circle cx=\"49\" cy=\"35\" r=\"5\"/><circle cx=\"41\" cy=\"40\" r=\"5\"/></g><g fill=\"#fff\" opacity=\".6\"><circle cx=\"38.5\" cy=\"29.5\" r=\"1.3\"/><circle cx=\"47.5\" cy=\"33.5\" r=\"1.3\"/><circle cx=\"39.5\" cy=\"38.5\" r=\"1.3\"/></g></svg>",
  flakes: "<svg class=\"flakes\" width=\"60\" height=\"40\" viewBox=\"0 0 60 40\" stroke=\"#9fb0a0\" stroke-width=\"1.4\" stroke-linecap=\"round\" fill=\"none\"><g transform=\"translate(14 14)\"><path d=\"M0-9V9M-8-4.5L8 4.5M-8 4.5L8-4.5\"/></g><g transform=\"translate(42 12) scale(.7)\"><path d=\"M0-9V9M-8-4.5L8 4.5M-8 4.5L8-4.5\"/></g><g transform=\"translate(30 30) scale(.55)\"><path d=\"M0-9V9M-8-4.5L8 4.5M-8 4.5L8-4.5\"/></g></svg>",
  star: "<svg class=\"star25\" width=\"11\" height=\"11\" viewBox=\"0 0 24 24\"><path d=\"M12 1l3.2 7.3 7.8.7-5.9 5.2 1.8 7.8L12 17.8 5.1 22l1.8-7.8L1 9l7.8-.7z\" fill=\"#d2b05a\"/></svg>",
  tree: "<svg width=\"30\" height=\"38\" viewBox=\"0 0 30 38\"><rect x=\"13\" y=\"30\" width=\"4\" height=\"7\" fill=\"#8a7458\"/><path d=\"M15 3L5 17h5L3 26h24l-7-9h5z\" fill=\"#5d7d5f\"/><circle cx=\"11\" cy=\"22\" r=\"1.7\" fill=\"#d2b05a\"/><circle cx=\"19\" cy=\"17\" r=\"1.7\" fill=\"#b8504a\"/><path d=\"M15 0l1.2 3.2 3.3.2-2.6 2 .9 3.2L15 6.9l-2.8 1.7.9-3.2-2.6-2 3.3-.2z\" fill=\"#d2b05a\"/></svg>",
  tree2: "<svg width=\"22\" height=\"28\" viewBox=\"0 0 30 38\"><rect x=\"13\" y=\"30\" width=\"4\" height=\"7\" fill=\"#8a7458\"/><path d=\"M15 3L5 17h5L3 26h24l-7-9h5z\" fill=\"#5d7d5f\"/><circle cx=\"11\" cy=\"22\" r=\"1.7\" fill=\"#d2b05a\"/><circle cx=\"19\" cy=\"17\" r=\"1.7\" fill=\"#b8504a\"/><path d=\"M15 0l1.2 3.2 3.3.2-2.6 2 .9 3.2L15 6.9l-2.8 1.7.9-3.2-2.6-2 3.3-.2z\" fill=\"#d2b05a\"/></svg>",
  gift1: "<svg width=\"30\" height=\"30\" viewBox=\"0 0 30 30\"><rect x=\"4\" y=\"12\" width=\"22\" height=\"15\" rx=\"2\" fill=\"#b8504a\"/><rect x=\"2\" y=\"8\" width=\"26\" height=\"6\" rx=\"2\" fill=\"#c9605a\"/><rect x=\"13\" y=\"8\" width=\"4\" height=\"19\" fill=\"#d2b05a\"/><path d=\"M15 8C9 0 3 6 9 8zM15 8c6-8 12-2 6 0z\" fill=\"none\" stroke=\"#d2b05a\" stroke-width=\"2\"/></svg>",
  gift2: "<svg width=\"24\" height=\"24\" viewBox=\"0 0 30 30\"><rect x=\"4\" y=\"12\" width=\"22\" height=\"15\" rx=\"2\" fill=\"#5f8a63\"/><rect x=\"2\" y=\"8\" width=\"26\" height=\"6\" rx=\"2\" fill=\"#78a07a\"/><rect x=\"13\" y=\"8\" width=\"4\" height=\"19\" fill=\"#e7dcc0\"/><path d=\"M15 8C9 0 3 6 9 8zM15 8c6-8 12-2 6 0z\" fill=\"none\" stroke=\"#e7dcc0\" stroke-width=\"2\"/></svg>",
  snowman: "<svg width=\"46\" height=\"64\" viewBox=\"0 0 46 64\"><circle cx=\"23\" cy=\"45\" r=\"17\" fill=\"#fbfbf7\" stroke=\"#c9d1c2\" stroke-width=\"1.5\"/><circle cx=\"23\" cy=\"22\" r=\"12\" fill=\"#fbfbf7\" stroke=\"#c9d1c2\" stroke-width=\"1.5\"/><rect x=\"14\" y=\"6\" width=\"18\" height=\"4\" rx=\"1\" fill=\"#4a4f45\"/><rect x=\"17\" y=\"-1\" width=\"12\" height=\"9\" rx=\"1\" fill=\"#4a4f45\"/><circle cx=\"19\" cy=\"20\" r=\"1.4\" fill=\"#3b372f\"/><circle cx=\"27\" cy=\"20\" r=\"1.4\" fill=\"#3b372f\"/><path d=\"M23 23l9 2-9 2z\" fill=\"#d98a4a\"/><path d=\"M12 31q11 6 22 0l1 5q-12 6-24 0z\" fill=\"#b8504a\"/><path d=\"M30 33l3 12-5-1z\" fill=\"#b8504a\"/><circle cx=\"23\" cy=\"42\" r=\"1.4\" fill=\"#3b372f\"/><circle cx=\"23\" cy=\"49\" r=\"1.4\" fill=\"#3b372f\"/><path d=\"M7 40L-1 32M39 40l8-8\" stroke=\"#8a7458\" stroke-width=\"2\" stroke-linecap=\"round\"/></svg>",
  santa: "<svg width=\"58\" height=\"64\" viewBox=\"0 0 58 64\"><path d=\"M6 64q0-22 23-22t23 22z\" fill=\"#b8504a\"/><rect x=\"4\" y=\"52\" width=\"50\" height=\"6\" fill=\"#4a4f45\"/><rect x=\"25\" y=\"51\" width=\"8\" height=\"8\" fill=\"#d2b05a\"/><circle cx=\"29\" cy=\"27\" r=\"14\" fill=\"#f0d5bc\"/><path d=\"M13 29q2 22 16 24 14-2 16-24-4 10-16 10T13 29z\" fill=\"#fbfbf7\"/><path d=\"M19 33q10-5 20 0-10 6-20 0z\" fill=\"#fbfbf7\" stroke=\"#e4e2d8\"/><circle cx=\"23.5\" cy=\"25\" r=\"1.4\" fill=\"#3b372f\"/><circle cx=\"34.5\" cy=\"25\" r=\"1.4\" fill=\"#3b372f\"/><ellipse cx=\"29\" cy=\"29\" rx=\"2.4\" ry=\"2\" fill=\"#e3a58f\"/><path d=\"M14 20q2-19 18-18 8 0 6 14-9-5-24 4z\" fill=\"#b8504a\"/><rect x=\"12\" y=\"17\" width=\"34\" height=\"7\" rx=\"3.5\" fill=\"#fbfbf7\"/><circle cx=\"40\" cy=\"2\" r=\"4\" fill=\"#fbfbf7\"/></svg>",
  deer: "<svg width=\"66\" height=\"64\" viewBox=\"0 0 66 64\"><g stroke=\"#8a6a4a\" stroke-width=\"3\" stroke-linecap=\"round\"><path d=\"M18 40v18M25 40v18M45 40v18M52 40v18\"/></g><ellipse cx=\"36\" cy=\"36\" rx=\"22\" ry=\"12\" fill=\"#a98562\"/><path d=\"M52 32l8-16 6 4-4 16z\" fill=\"#a98562\"/><ellipse cx=\"62\" cy=\"21\" rx=\"6\" ry=\"5\" fill=\"#a98562\" transform=\"rotate(-20 62 21)\"/><circle cx=\"64\" cy=\"20\" r=\"1.2\" fill=\"#3b372f\"/><circle cx=\"66\" cy=\"23\" r=\"1.6\" fill=\"#3b372f\"/><path d=\"M58 15l-2-10m2 10l-8-6m8 6l3-11m-3 11l7-9\" stroke=\"#7a5d40\" stroke-width=\"2\" stroke-linecap=\"round\" fill=\"none\"/><path d=\"M15 32q-5 0-4 6\" stroke=\"#e8e2d2\" stroke-width=\"4\" stroke-linecap=\"round\" fill=\"none\"/><path d=\"M50 24q4 4 0 8\" stroke=\"#b8504a\" stroke-width=\"3\" fill=\"none\"/></svg>",
  /* ── 萬聖節 ── */
  hpump: "<svg width=\"54\" height=\"54\" viewBox=\"0 0 64 64\" aria-hidden=\"true\"><path d=\"M32 16c-3-5-1-9 3-11\" stroke=\"#8a7a56\" stroke-width=\"3.4\" fill=\"none\" stroke-linecap=\"round\"/><ellipse cx=\"20\" cy=\"39\" rx=\"14\" ry=\"20\" fill=\"#b5723c\"/><ellipse cx=\"44\" cy=\"39\" rx=\"14\" ry=\"20\" fill=\"#b5723c\"/><ellipse cx=\"32\" cy=\"39\" rx=\"15\" ry=\"22\" fill=\"#c98a4e\"/><path d=\"M20 35l6-8 4 8zM34 35l4-8 6 8z\" fill=\"#2b2530\"/><path d=\"M21 44q11 13 22 0q-4 3-7 1l-4 4-4-4q-3 2-7-1z\" fill=\"#2b2530\"/></svg>",
  hpump2: "<svg width=\"28\" height=\"28\" viewBox=\"0 0 64 64\"><path d=\"M32 16c-3-5-1-9 3-11\" stroke=\"#8a7a56\" stroke-width=\"4\" fill=\"none\" stroke-linecap=\"round\"/><ellipse cx=\"20\" cy=\"39\" rx=\"14\" ry=\"20\" fill=\"#b5723c\"/><ellipse cx=\"44\" cy=\"39\" rx=\"14\" ry=\"20\" fill=\"#b5723c\"/><ellipse cx=\"32\" cy=\"39\" rx=\"15\" ry=\"22\" fill=\"#c98a4e\"/><path d=\"M20 35l6-8 4 8zM34 35l4-8 6 8z\" fill=\"#2b2530\"/><path d=\"M21 44q11 13 22 0q-4 3-7 1l-4 4-4-4q-3 2-7-1z\" fill=\"#2b2530\"/></svg>",
  hmark: "<svg class=\"star25\" width=\"13\" height=\"13\" viewBox=\"0 0 64 64\"><path d=\"M32 16c-3-5-1-9 3-11\" stroke=\"#8a7a56\" stroke-width=\"5\" fill=\"none\" stroke-linecap=\"round\"/><ellipse cx=\"20\" cy=\"39\" rx=\"14\" ry=\"20\" fill=\"#b5723c\"/><ellipse cx=\"44\" cy=\"39\" rx=\"14\" ry=\"20\" fill=\"#b5723c\"/><ellipse cx=\"32\" cy=\"39\" rx=\"15\" ry=\"22\" fill=\"#d39556\"/></svg>",
  hbat: "<svg width=\"36\" height=\"22\" viewBox=\"0 0 40 24\" aria-hidden=\"true\"><g fill=\"#9a91ad\"><path d=\"M20 12C16 4 8 3 1 7c3 1 4 3 4 6 2-2 4-2 6 0 1-2 3-3 5-2z\"/><path d=\"M20 12c4-8 12-9 19-5-3 1-4 3-4 6-2-2-4-2-6 0-1-2-3-3-5-2z\"/><ellipse cx=\"20\" cy=\"13\" rx=\"4\" ry=\"6\"/><path d=\"M16.5 9l1-6 2.5 3 2.5-3 1 6z\"/></g><g fill=\"#d6b05a\"><circle cx=\"18.4\" cy=\"10.5\" r=\".9\"/><circle cx=\"21.6\" cy=\"10.5\" r=\".9\"/></g></svg>",
  hbats: "<svg width=\"60\" height=\"40\" viewBox=\"0 0 60 40\" aria-hidden=\"true\"><g fill=\"#8d84a0\"><g transform=\"translate(2 2)\"><path d=\"M20 12C16 4 8 3 1 7c3 1 4 3 4 6 2-2 4-2 6 0 1-2 3-3 5-2z\"/><path d=\"M20 12c4-8 12-9 19-5-3 1-4 3-4 6-2-2-4-2-6 0-1-2-3-3-5-2z\"/><ellipse cx=\"20\" cy=\"13\" rx=\"4\" ry=\"6\"/></g><g transform=\"translate(34 20) scale(.6)\"><path d=\"M20 12C16 4 8 3 1 7c3 1 4 3 4 6 2-2 4-2 6 0 1-2 3-3 5-2z\"/><path d=\"M20 12c4-8 12-9 19-5-3 1-4 3-4 6-2-2-4-2-6 0-1-2-3-3-5-2z\"/><ellipse cx=\"20\" cy=\"13\" rx=\"4\" ry=\"6\"/></g></g></svg>",
  hghost: "<svg width=\"40\" height=\"46\" viewBox=\"0 0 30 34\"><path d=\"M15 2C8 2 4 7 4 14v18l4-3 3.5 3 3.5-3 3.5 3 3.5-3 4 3V14C26 7 22 2 15 2z\" fill=\"#e4deea\"/><circle cx=\"11\" cy=\"14\" r=\"2\" fill=\"#2b2530\"/><circle cx=\"19\" cy=\"14\" r=\"2\" fill=\"#2b2530\"/><ellipse cx=\"15\" cy=\"21\" rx=\"2.2\" ry=\"2.8\" fill=\"#2b2530\"/></svg>",
  hghost2: "<svg width=\"26\" height=\"30\" viewBox=\"0 0 30 34\"><path d=\"M15 2C8 2 4 7 4 14v18l4-3 3.5 3 3.5-3 3.5 3 3.5-3 4 3V14C26 7 22 2 15 2z\" fill=\"#cfc8d8\"/><circle cx=\"11\" cy=\"14\" r=\"2\" fill=\"#2b2530\"/><circle cx=\"19\" cy=\"14\" r=\"2\" fill=\"#2b2530\"/><path d=\"M11.5 21q3.5 3 7 0\" stroke=\"#2b2530\" stroke-width=\"1.6\" fill=\"none\" stroke-linecap=\"round\"/></svg>",
  hcat: "<svg width=\"44\" height=\"52\" viewBox=\"0 0 44 52\"><path d=\"M34 48q10 0 8-14\" stroke=\"#4c4556\" stroke-width=\"4\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M10 50c-2-14 2-22 12-22s14 8 12 22z\" fill=\"#4c4556\" stroke=\"#7a7188\" stroke-width=\"1.2\"/><circle cx=\"22\" cy=\"20\" r=\"10\" fill=\"#4c4556\" stroke=\"#7a7188\" stroke-width=\"1.2\"/><path d=\"M13 14l-2-10 8 5zM31 14l2-10-8 5z\" fill=\"#4c4556\" stroke=\"#7a7188\" stroke-width=\"1.2\" stroke-linejoin=\"round\"/><circle cx=\"18\" cy=\"19\" r=\"1.9\" fill=\"#d6b05a\"/><circle cx=\"26\" cy=\"19\" r=\"1.9\" fill=\"#d6b05a\"/><path d=\"M21 24l1 1.2 1-1.2z\" fill=\"#b0a6c0\"/></svg>",
  hcandy1: "<svg width=\"32\" height=\"22\" viewBox=\"0 0 30 20\"><path d=\"M2 4l7 6-7 6zM28 4l-7 6 7 6z\" fill=\"#a58cbd\"/><ellipse cx=\"15\" cy=\"10\" rx=\"8\" ry=\"6\" fill=\"#c98a4e\"/><path d=\"M10 6l8 8\" stroke=\"#ecd9b8\" stroke-width=\"2\"/></svg>",
  hcandy2: "<svg width=\"28\" height=\"20\" viewBox=\"0 0 30 20\"><path d=\"M2 4l7 6-7 6zM28 4l-7 6 7 6z\" fill=\"#c98a4e\"/><ellipse cx=\"15\" cy=\"10\" rx=\"8\" ry=\"6\" fill=\"#8b7aa8\"/><path d=\"M10 6l8 8\" stroke=\"#e4deea\" stroke-width=\"2\"/></svg>"
};

/* ── 春節 ── */
(function () {
  var LAN = "<path d='M12 2v4' stroke='#a69a86' stroke-width='1.4'/><rect x='7' y='5' width='10' height='3' rx='1.2' fill='#b89a4e'/><ellipse cx='12' cy='19' rx='9.5' ry='11' fill='#b5554b'/><path d='M8 8q-4 11 0 22M16 8q4 11 0 22M12 8v22' stroke='#8f3a33' stroke-width='1' fill='none'/><rect x='7' y='29' width='10' height='3' rx='1.2' fill='#b89a4e'/><path d='M12 32v8M9 32v6M15 32v6' stroke='#b89a4e' stroke-width='1.3' stroke-linecap='round'/>";
  var PLUM = "<g fill='#e2b8ba'><circle cx='16' cy='7' r='6'/><circle cx='25' cy='14' r='6'/><circle cx='21.5' cy='25' r='6'/><circle cx='10.5' cy='25' r='6'/><circle cx='7' cy='14' r='6'/></g><g fill='#ecc9ca' opacity='.8'><circle cx='16' cy='9' r='3'/><circle cx='22.5' cy='14' r='3'/><circle cx='20' cy='22' r='3'/><circle cx='12' cy='22' r='3'/><circle cx='9.5' cy='14' r='3'/></g><circle cx='16' cy='16' r='3' fill='#b89a4e'/><path d='M16 16l-1-4M16 16l3-3M16 16l3 3M16 16l-3 3M16 16l-3-3' stroke='#b89a4e' stroke-width='.8'/>";
  var BRANCH = "<path d='M2 38C14 30 22 24 34 22S58 12 64 4' stroke='#7d6650' stroke-width='3' fill='none' stroke-linecap='round'/><path d='M34 22q6 0 10 6M22 28q-2-6-8-8' stroke='#7d6650' stroke-width='2' fill='none' stroke-linecap='round'/><g transform='translate(46 -2) scale(.55)'>" + PLUM + "</g><g transform='translate(20 4) scale(.5)'>" + PLUM + "</g><g transform='translate(26 24) scale(.4)'>" + PLUM + "</g><circle cx='12' cy='20' r='2.2' fill='#d9a9ab'/><circle cx='52' cy='24' r='2' fill='#d9a9ab'/>";
  var HB = "<rect x='4' y='2' width='30' height='42' rx='3' fill='#b5554b'/><path d='M4 2h30v15q-15 11-30 0z' fill='#a14840'/><circle cx='19' cy='20' r='6' fill='#d2b05a'/><circle cx='19' cy='20' r='3.4' fill='none' stroke='#b5554b' stroke-width='1.3'/>";
  var ING = "<path d='M3 22q0-10 10-10h22q10 0 10 10l-4 10H7z' fill='#cfae58'/><path d='M13 12q4-9 11-9t11 9z' fill='#dcc178'/><path d='M12 22h24' stroke='#b08d3c' stroke-width='1.3' stroke-linecap='round'/>";
  function svg(w, h, vb, body, cls) { return "<svg" + (cls ? " class='" + cls + "'" : "") + " width='" + w + "' height='" + h + "' viewBox='" + vb + "' aria-hidden='true'>" + body + "</svg>"; }
  PT_SVG.clan = svg(26, 44, '0 0 24 42', LAN);
  PT_SVG.clan2 = svg(26, 30, '0 0 24 42', LAN);
  PT_SVG.cplum = svg(30, 30, '0 0 32 32', PLUM);
  PT_SVG.cbranch = svg(64, 44, '0 0 66 42', BRANCH);
  PT_SVG.cbranchr = svg(64, 44, '0 0 66 42', "<g transform='translate(66 0) scale(-1 1)'>" + BRANCH + "</g>");
  PT_SVG.chb = svg(40, 48, '0 0 38 46', HB);
  PT_SVG.chb2 = svg(34, 46, '0 0 38 46', HB);
  PT_SVG.cing = svg(40, 28, '0 0 48 34', ING);
  PT_SVG.cmark = svg(12, 17, '0 0 24 42', LAN, 'star25');
})();

/* ── 元宵 ── */
(function () {
  function svg(w, h, vb, body, cls) { return '<svg' + (cls ? ' class=\'' + cls + '\'' : '') + ' width=\'' + w + '\' height=\'' + h + '\' viewBox=\'' + vb + '\' aria-hidden=\'true\'>' + body + '</svg>'; }
  var LAN = "<path d='M12 2v4' stroke='#a69a86' stroke-width='1.4'/><rect x='7' y='5' width='10' height='3' rx='1.2' fill='#8f7a4a'/><ellipse cx='12' cy='19' rx='10' ry='11' fill='#d4893f'/><ellipse cx='12' cy='19' rx='5' ry='11' fill='#e2a45c'/><path d='M12 8v22M7.5 9q-3 10 0 20M16.5 9q3 10 0 20' stroke='#a8642a' stroke-width='.9' fill='none'/><rect x='7' y='29' width='10' height='3' rx='1.2' fill='#8f7a4a'/><path d='M12 32v8M9 32v6M15 32v6' stroke='#8f7a4a' stroke-width='1.3' stroke-linecap='round'/>", LAN2 = "<path d='M12 2v4' stroke='#a69a86' stroke-width='1.4'/><rect x='7' y='5' width='10' height='3' rx='1.2' fill='#8f7a4a'/><ellipse cx='12' cy='19' rx='10' ry='11' fill='#e6c577'/><ellipse cx='12' cy='19' rx='5' ry='11' fill='#f0d896'/><path d='M12 8v22M7.5 9q-3 10 0 20M16.5 9q3 10 0 20' stroke='#bf9a4c' stroke-width='.9' fill='none'/><rect x='7' y='29' width='10' height='3' rx='1.2' fill='#8f7a4a'/><path d='M12 32v8M9 32v6M15 32v6' stroke='#8f7a4a' stroke-width='1.3' stroke-linecap='round'/>", SKY = "<path d='M5 7q7-8 14 0l1.5 21h-17z' fill='#e9ad62'/><path d='M5 7q7-8 14 0' fill='none' stroke='#c98741' stroke-width='1'/><path d='M9 5.5q-1 11 .5 22.5M15 5.5q1 11-.5 22.5' stroke='#d49650' stroke-width='.8' fill='none'/><rect x='2.5' y='27.5' width='19' height='2.6' rx='1.2' fill='#8f7a4a'/><circle cx='12' cy='33.5' r='4.6' fill='#f8e3a2' opacity='.55'/><ellipse cx='12' cy='33' rx='2.2' ry='3.2' fill='#f4c768'/><ellipse cx='12' cy='34' rx='1' ry='1.7' fill='#fff1c4'/>", MOON = "<circle cx='16' cy='16' r='14' fill='#f6e9b8' opacity='.55'/><circle cx='16' cy='16' r='10.5' fill='#f3e0a0'/><circle cx='12.5' cy='13' r='2' fill='#e8d38a'/><circle cx='20' cy='19' r='2.6' fill='#e8d38a'/><circle cx='18' cy='10.5' r='1.3' fill='#e8d38a'/>", BOWL = "<path d='M10 14q2-4 0-8M18 14q2-4 0-8M26 14q2-4 0-8' stroke='#c9bfa8' stroke-width='1.4' fill='none' stroke-linecap='round'/><ellipse cx='18' cy='25' rx='15' ry='4' fill='#efe4cb'/><circle cx='11' cy='22' r='5.2' fill='#fbf7ec' stroke='#e2d8c0'/><circle cx='19' cy='21' r='5.6' fill='#fbf7ec' stroke='#e2d8c0'/><circle cx='26' cy='23' r='4.8' fill='#f0cbc4' stroke='#e2b6ad'/><path d='M3 24h30q-1 10-15 10T3 24z' fill='#fbf7ec' stroke='#7f8fae' stroke-width='1.3'/><path d='M4.5 28h27' stroke='#7f8fae' stroke-width='1.3'/><path d='M12 34h12v2H12z' fill='#7f8fae'/>";
  PT_SVG.llan = svg(26, 44, '0 0 24 42', LAN);
  PT_SVG.llan2 = svg(24, 40, '0 0 24 42', LAN2);
  PT_SVG.lsky = svg(24, 34, '0 0 24 38', SKY);
  PT_SVG.lsky2 = svg(22, 32, '0 0 24 38', SKY);
  PT_SVG.lmoon = svg(30, 30, '0 0 32 32', MOON);
  PT_SVG.lbowl = svg(40, 36, '0 0 36 38', BOWL);
  PT_SVG.lbowl2 = svg(36, 38, '0 0 36 38', BOWL);
  PT_SVG.lmark = svg(10, 16, '0 0 24 38', SKY, 'star25');
})();

/* 每個節慶一組：css（配色＋專屬裝飾）、hello（問候卡裡的裝飾）、mark（日曆節慶日記號）、foot（頁尾小場景）、fx（動態效果：snow 飄雪／bats 飛蝙蝠／petals 飄梅花瓣／lanterns 天燈往上浮） */
var PT_ASSETS = {
  xmas: {
    fx: 'snow',
    mark: function () { return PT_SVG.star; },
    foot: function () { return PT_SVG.gift2 + '<span class="pt-g">' + PT_SVG.snowman + '</span>' + PT_SVG.tree2 + '<span class="pt-g">' + PT_SVG.santa + '</span>' + PT_SVG.tree + '<span class="pt-g">' + PT_SVG.deer + '</span>' + PT_SVG.tree2 + PT_SVG.gift1; },
    hello: function (g) { return PT_SVG.poin + '<div class="gr">' + g[0] + '<small>' + g[1] + '</small></div>'; },
    side: function () { return { a: PT_SVG.flakes, b: PT_SVG.holly, c: PT_SVG.snowman }; },
    css: [
      '[data-theme=xmas]{--bg:#e7ebe1;--card:#f6f6f0;--line:#d2d9c9;--text:#33382f;--sub:#6d7667;--accent:#4d6b52;--accent-soft:#dbe4d6;--done:#5f8a63;--off:#a9b1a0;--warn:#9b3b36}',
      '[data-theme=xmas] .day.out{color:#bcc4b2}',
      '[data-theme=xmas] .day.st-done{background:#dbe7da;color:#35553a;border-color:#b6cdb8}',
      '[data-theme=xmas] .day.st-up{background:#f1dfd9;color:#6b2a26;border-color:#d8aaa2}',
      '[data-theme=xmas] .day.st-off{background:#e6e9e0;color:#98a090;border-color:#d2d9c9}',
      '[data-theme=xmas] .sw.up{background:#f1dfd9;border-color:#d8aaa2}[data-theme=xmas] .sw.done{background:#dbe7da;border-color:#b6cdb8}[data-theme=xmas] .sw.off{background:#e6e9e0;border-color:#d2d9c9}',
      '[data-theme=xmas] .day.sel{box-shadow:0 0 0 2px #33382f}[data-theme=xmas] .day.today.sel{box-shadow:inset 0 0 0 2px var(--accent),0 0 0 2px #33382f}',
      '[data-theme=xmas] .chip.submitted,[data-theme=xmas] .rv.h{background:#f1dfd9;color:#6b2a26}[data-theme=xmas] .chip.todo{background:#e6e9e0;color:#6d7667}',
      '[data-theme=xmas] .lbar,[data-theme=xmas] .lchip,[data-theme=xmas] .bub{background:#e6e9e0}',
      '[data-theme=xmas] .bank,[data-theme=xmas] .tnote{background:#eceee5}[data-theme=xmas] .lgrid div{background:#eef0e8}',
      '[data-theme=xmas] .hwq input[type=checkbox],[data-theme=xmas] .hwq input[type=radio]{accent-color:#4d6b52}',
      '[data-theme=xmas] .card h2::before{content:"❄";color:#a9b8a6;margin-right:6px;font-size:.8em}',,
      '[data-theme=xmas]{--pt-gr:#9b3b36;--pt-gr2:#8a7a45}',
      '.pt-snow i{position:absolute;top:-10px;border-radius:50%;background:#fff;opacity:.85;box-shadow:0 0 2px rgba(120,130,115,.35);animation:ptfall linear infinite}',
      '@keyframes ptfall{to{transform:translateY(110vh) translateX(24px)}}',
  '[data-theme=xmas] .pt-lights{display:block;height:34px;margin:-4px -2px 6px;background:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'96\' height=\'34\' viewBox=\'0 0 96 34\'><path d=\'M0 4 Q24 22 48 4 T96 4\' fill=\'none\' stroke=\'%238a9482\' stroke-width=\'1.4\'/><g><circle cx=\'12\' cy=\'15\' r=\'4.2\' fill=\'%23b8504a\'/><circle cx=\'36\' cy=\'15\' r=\'4.2\' fill=\'%23d2b05a\'/><circle cx=\'60\' cy=\'15\' r=\'4.2\' fill=\'%235f8a63\'/><circle cx=\'84\' cy=\'15\' r=\'4.2\' fill=\'%23b8504a\'/></g><g fill=\'%23666e5f\'><rect x=\'10\' y=\'9\' width=\'4\' height=\'3\'/><rect x=\'34\' y=\'9\' width=\'4\' height=\'3\'/><rect x=\'58\' y=\'9\' width=\'4\' height=\'3\'/><rect x=\'82\' y=\'9\' width=\'4\' height=\'3\'/></g></svg>") repeat-x;background-size:96px 34px}'
    ].join('\n')
  },
  halloween: {
    fx: 'bats',
    mark: function () { return PT_SVG.hmark; },
    foot: function () { return PT_SVG.hcandy1 + '<span class="pt-g">' + PT_SVG.hghost + '</span>' + PT_SVG.hpump2 + '<span class="pt-g">' + PT_SVG.hcat + '</span>' + PT_SVG.hpump + '<span class="pt-g">' + PT_SVG.hghost2 + '</span>' + PT_SVG.hpump2 + PT_SVG.hcandy2; },
    hello: function (g) { return PT_SVG.hpump + '<div class="gr">' + g[0] + '<small>' + g[1] + '</small></div>'; },
    side: function () { return { a: PT_SVG.hbats, b: PT_SVG.hbat, c: PT_SVG.hghost }; },
    css: [
      /* 深色：暖紫炭底、米白字、霧橘當主色（低飽和） */
      '[data-theme=halloween]{--bg:#232027;--card:#2d2932;--line:#46404f;--text:#e8e2d6;--sub:#a69fae;--accent:#c99a62;--accent-soft:#3d3541;--done:#8ea88c;--off:#6f6978;--warn:#d68b7b;--pt-gr:#d9a56c;--pt-gr2:#a69fae;color-scheme:dark}',
      '[data-theme=halloween] .lang button.on,[data-theme=halloween] .lt button.on,[data-theme=halloween] button.primary,[data-theme=halloween] .btn,[data-theme=halloween] .bub.me{color:#231f27}',
      '[data-theme=halloween] input,[data-theme=halloween] select,[data-theme=halloween] .compose textarea,[data-theme=halloween] .hwq input[type=text],[data-theme=halloween] .hwq textarea,[data-theme=halloween] .hwq select,[data-theme=halloween] .mk,[data-theme=halloween] .tok{background:#26222c;color:var(--text)}',
      '[data-theme=halloween] .day.out{color:#5e5867}',
      '[data-theme=halloween] .day.st-done{background:#2f3d33;color:#b4d0b0;border-color:#476049}',
      '[data-theme=halloween] .day.st-up{background:#4a3524;color:#f0c79a;border-color:#7a5836}',
      '[data-theme=halloween] .day.st-off{background:#2a2730;color:#7d7685;border-color:#3c3745}',
      '[data-theme=halloween] .sw.done{background:#2f3d33;border-color:#476049}[data-theme=halloween] .sw.up{background:#4a3524;border-color:#7a5836}[data-theme=halloween] .sw.off{background:#2a2730;border-color:#3c3745}',
      '[data-theme=halloween] .day.sel{box-shadow:0 0 0 2px #e8e2d6}[data-theme=halloween] .day.today.sel{box-shadow:inset 0 0 0 2px var(--accent),0 0 0 2px #e8e2d6}',
      '[data-theme=halloween] .chip.submitted,[data-theme=halloween] .rv.h{background:#4a3524;color:#f0c79a}[data-theme=halloween] .chip.todo{background:#38333f;color:#a69fae}[data-theme=halloween] .chip.graded,[data-theme=halloween] .rv.y{background:#2f3d33;color:#b4d0b0}[data-theme=halloween] .rv.n{background:#4a2f2f}',
      '[data-theme=halloween] .lbar,[data-theme=halloween] .lchip,[data-theme=halloween] .bub{background:#3a3540}',
      '[data-theme=halloween] .bank,[data-theme=halloween] .tnote{background:#332f3a}[data-theme=halloween] .lgrid div{background:#36313d}',
      '[data-theme=halloween] .abcmp th,[data-theme=halloween] .abcmp td{border-color:#46404f}',
      '[data-theme=halloween] .nudc.q{background:#2b3238;border-color:#3f4b54;border-top-color:#6f8c9a}[data-theme=halloween] .nudc.q .nudk{color:#9fbac6}',
      '[data-theme=halloween] .nudc.enc{background:#3a3326;border-color:#54492f;border-top-color:#b79b52}[data-theme=halloween] .nudc.enc .nudk{color:#d6bd7a}',
      '[data-theme=halloween] .nudc.rem{background:#3b2d2c;border-color:#573f3c;border-top-color:#c0796a}[data-theme=halloween] .nudc.rem .nudk{color:#e0a496}',
      '[data-theme=halloween] .hwq input[type=checkbox],[data-theme=halloween] .hwq input[type=radio]{accent-color:#c99a62}',
      '[data-theme=halloween] .card h2::before{content:"";display:inline-block;width:16px;height:9px;margin-right:7px;vertical-align:middle;background:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 40 24\'><g fill=\'%238d84a0\'><path d=\'M20 12C16 4 8 3 1 7c3 1 4 3 4 6 2-2 4-2 6 0 1-2 3-3 5-2z\'/><path d=\'M20 12c4-8 12-9 19-5-3 1-4 3-4 6-2-2-4-2-6 0-1-2-3-3-5-2z\'/><ellipse cx=\'20\' cy=\'13\' rx=\'4\' ry=\'6\'/></g></svg>") no-repeat center/contain}',
      /* 頂部小三角旗 */
      '[data-theme=halloween] .pt-lights{display:block;height:34px;margin:-4px -2px 6px;background:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'96\' height=\'34\' viewBox=\'0 0 96 34\'><path d=\'M0 4 Q24 16 48 4 T96 4\' fill=\'none\' stroke=\'%238a82a0\' stroke-width=\'1.4\'/><polygon points=\'5,9 19,9 12,26\' fill=\'%23c99a62\'/><polygon points=\'29,12 43,12 36,29\' fill=\'%238b7aa8\'/><polygon points=\'53,12 67,12 60,29\' fill=\'%23c99a62\'/><polygon points=\'77,9 91,9 84,26\' fill=\'%238b7aa8\'/></svg>") repeat-x;background-size:96px 34px}',
      /* 問候卡左上角的蜘蛛網 */
      '[data-theme=halloween] .hello::before{content:"";position:absolute;left:0;top:0;width:56px;height:56px;pointer-events:none;opacity:.7;background:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'56\' height=\'56\' viewBox=\'0 0 56 56\'><g fill=\'none\' stroke=\'%23746c84\' stroke-width=\'1\'><path d=\'M0 0L56 0M0 0L0 56M0 0L50 18M0 0L36 36M0 0L18 50\'/><path d=\'M0 14Q5 5 14 0M0 28Q10 10 28 0M0 42Q16 16 42 0M0 54Q20 20 54 0\'/></g></svg>") no-repeat}',
      /* 飛過的蝙蝠 */
      '[data-theme=halloween] .pt-snow i{position:absolute;left:-50px;animation:ptfly linear infinite}',
      '[data-theme=halloween] .pt-snow i::before{content:"";position:absolute;left:0;top:0;right:0;bottom:0;background:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 40 24\'><g fill=\'%239a91ad\'><path d=\'M20 12C16 4 8 3 1 7c3 1 4 3 4 6 2-2 4-2 6 0 1-2 3-3 5-2z\'/><path d=\'M20 12c4-8 12-9 19-5-3 1-4 3-4 6-2-2-4-2-6 0-1-2-3-3-5-2z\'/><ellipse cx=\'20\' cy=\'13\' rx=\'4\' ry=\'6\'/></g></svg>") no-repeat center/contain;animation:ptflap .45s ease-in-out infinite alternate}',
      '@keyframes ptfly{0%{transform:translate(0,0)}25%{transform:translate(28vw,-18px)}50%{transform:translate(55vw,10px)}75%{transform:translate(82vw,-14px)}100%{transform:translate(115vw,6px)}}',
      '@keyframes ptflap{from{transform:scaleY(1)}to{transform:scaleY(.45)}}'
    ].join('\n')
  },
  cny: {
    fx: 'petals',
    mark: function () { return PT_SVG.cmark; },
    foot: function () { return PT_SVG.chb2 + PT_SVG.cbranch + PT_SVG.clan + PT_SVG.cing + PT_SVG.clan + PT_SVG.cbranchr + PT_SVG.chb2; },
    hello: function (g) { return PT_SVG.chb + '<div class="gr">' + g[0] + '<small>' + g[1] + '</small></div>'; },
    side: function () { return { a: PT_SVG.clan2, b: PT_SVG.cplum, c: PT_SVG.cing }; },
    css: [
      /* 淺色：米白底、霧紅當主色、暗金當輔色（低飽和） */
      '[data-theme=cny]{--bg:#efe9dd;--card:#faf6ee;--line:#ddd2bf;--text:#3b352c;--sub:#7a7062;--accent:#a5473e;--accent-soft:#eadcd0;--done:#6f8a5f;--off:#b3a994;--warn:#8f3a33;--pt-gr:#a5473e;--pt-gr2:#9a8650}',
      '[data-theme=cny] .day.out{color:#c4b9a6}',
      '[data-theme=cny] .day.st-done{background:#e0e6d6;color:#46573f;border-color:#bdc9b0}',
      '[data-theme=cny] .day.st-up{background:#f0ddd4;color:#6b2d27;border-color:#d9aea1}',
      '[data-theme=cny] .day.st-off{background:#ebe5d8;color:#a39a86;border-color:#ddd2bf}',
      '[data-theme=cny] .sw.up{background:#f0ddd4;border-color:#d9aea1}[data-theme=cny] .sw.done{background:#e0e6d6;border-color:#bdc9b0}[data-theme=cny] .sw.off{background:#ebe5d8;border-color:#ddd2bf}',
      '[data-theme=cny] .day.sel{box-shadow:0 0 0 2px #3b352c}[data-theme=cny] .day.today.sel{box-shadow:inset 0 0 0 2px var(--accent),0 0 0 2px #3b352c}',
      '[data-theme=cny] .chip.submitted,[data-theme=cny] .rv.h{background:#f0ddd4;color:#6b2d27}[data-theme=cny] .chip.todo{background:#ebe5d8;color:#7a7062}',
      '[data-theme=cny] .lbar,[data-theme=cny] .lchip,[data-theme=cny] .bub{background:#ebe5d8}',
      '[data-theme=cny] .bank,[data-theme=cny] .tnote{background:#f1ebde}[data-theme=cny] .lgrid div{background:#f3eee2}',
      '[data-theme=cny] .hwq input[type=checkbox],[data-theme=cny] .hwq input[type=radio]{accent-color:#a5473e}',
      /* 卡片標題前的小梅花 */
      '[data-theme=cny] .card h2::before{content:"";display:inline-block;width:13px;height:13px;margin-right:7px;vertical-align:-1px;background:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\'><g fill=\'%23d9a9ab\'><circle cx=\'12\' cy=\'6\' r=\'5\'/><circle cx=\'18\' cy=\'11\' r=\'5\'/><circle cx=\'16\' cy=\'18\' r=\'5\'/><circle cx=\'8\' cy=\'18\' r=\'5\'/><circle cx=\'6\' cy=\'11\' r=\'5\'/></g><circle cx=\'12\' cy=\'12\' r=\'2.6\' fill=\'%23b89a4e\'/></svg>") no-repeat center/contain}',
      /* 頂部小燈籠串 */
      '[data-theme=cny] .pt-lights{display:block;height:58px;margin:-4px -2px 6px;background:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'96\' height=\'58\' viewBox=\'0 0 96 58\'><path d=\'M0 4 Q24 12 48 4 T96 4\' fill=\'none\' stroke=\'%23a69a86\' stroke-width=\'1.4\'/><g transform=\'translate(24 3)\'><path d=\'M12 9v5\' stroke=\'%23a69a86\' stroke-width=\'1.2\'/><rect x=\'8\' y=\'13\' width=\'8\' height=\'2.5\' rx=\'1\' fill=\'%23b89a4e\'/><ellipse cx=\'12\' cy=\'23\' rx=\'7.5\' ry=\'8.5\' fill=\'%23b5554b\'/><path d=\'M9 15q-3 8 0 16M15 15q3 8 0 16\' stroke=\'%238f3a33\' stroke-width=\'.9\' fill=\'none\'/><rect x=\'8.5\' y=\'30.5\' width=\'7\' height=\'2.5\' rx=\'1\' fill=\'%23b89a4e\'/><path d=\'M12 33v7\' stroke=\'%23b89a4e\' stroke-width=\'1.2\'/></g><g transform=\'translate(72 3)\'><path d=\'M12 9v5\' stroke=\'%23a69a86\' stroke-width=\'1.2\'/><rect x=\'8\' y=\'13\' width=\'8\' height=\'2.5\' rx=\'1\' fill=\'%23b89a4e\'/><ellipse cx=\'12\' cy=\'23\' rx=\'7.5\' ry=\'8.5\' fill=\'%23b5554b\'/><path d=\'M9 15q-3 8 0 16M15 15q3 8 0 16\' stroke=\'%238f3a33\' stroke-width=\'.9\' fill=\'none\'/><rect x=\'8.5\' y=\'30.5\' width=\'7\' height=\'2.5\' rx=\'1\' fill=\'%23b89a4e\'/><path d=\'M12 33v7\' stroke=\'%23b89a4e\' stroke-width=\'1.2\'/></g></svg>") repeat-x;background-size:96px 58px}',
      /* 問候卡左上角的梅花枝 */
      '[data-theme=cny] .hello::before{content:"";position:absolute;left:0;top:0;width:56px;height:50px;pointer-events:none;background:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 66 42\'><path d=\'M2 38C14 30 22 24 34 22S58 12 64 4\' stroke=\'%237d6650\' stroke-width=\'3\' fill=\'none\' stroke-linecap=\'round\'/><g fill=\'%23e2b8ba\'><circle cx=\'52\' cy=\'10\' r=\'5\'/><circle cx=\'30\' cy=\'14\' r=\'4.5\'/><circle cx=\'30\' cy=\'30\' r=\'3.6\'/></g><g fill=\'%23b89a4e\'><circle cx=\'52\' cy=\'10\' r=\'1.6\'/><circle cx=\'30\' cy=\'14\' r=\'1.5\'/><circle cx=\'30\' cy=\'30\' r=\'1.2\'/></g></svg>") no-repeat;background-size:contain}',
      /* 飄落的梅花瓣 */
      '[data-theme=cny] .pt-snow i{position:absolute;top:-16px;background:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 12 12\'><path d=\'M5 0q6 3 4 10-6-1-4-10z\' fill=\'%23e8c4c4\'/></svg>") no-repeat center/contain;opacity:.85;animation:ptpetal linear infinite}',
      '@keyframes ptpetal{0%{transform:translate(0,0) rotate(0)}50%{transform:translate(34px,55vh) rotate(180deg)}100%{transform:translate(-12px,110vh) rotate(360deg)}}'
    ].join('\n')
  },
  lantern: {
    fx: 'lanterns',
    mark: function () { return PT_SVG.lmark; },
    foot: function () { return PT_SVG.lbowl2 + PT_SVG.llan + PT_SVG.lmoon + PT_SVG.lsky2 + PT_SVG.llan2 + PT_SVG.lbowl2; },
    hello: function (g) { return PT_SVG.llan + '<div class="gr">' + g[0] + '<small>' + g[1] + '</small></div>'; },
    side: function () { return { a: PT_SVG.lsky, b: PT_SVG.lmoon, c: PT_SVG.lbowl }; },
    css: [
      /* 淺色：暖米黃底、燈籠橘當主色、灰藍當輔色（低飽和） */
      '[data-theme=lantern]{--bg:#f0e6cc;--card:#faf3e0;--line:#e0d3b2;--text:#3a3426;--sub:#766c55;--accent:#b5652f;--accent-soft:#f0dcc0;--done:#7a8a5a;--off:#b8ab8c;--warn:#8f3a33;--pt-gr:#b5652f;--pt-gr2:#5f6c8c}',
      '[data-theme=lantern] .day.out{color:#c9bd9f}',
      '[data-theme=lantern] .day.st-done{background:#e3e6cf;color:#4b5a37;border-color:#c3cba9}',
      '[data-theme=lantern] .day.st-up{background:#f3dfc2;color:#6b3f1d;border-color:#dcb88a}',
      '[data-theme=lantern] .day.st-off{background:#ebe3cd;color:#a89e82;border-color:#e0d3b2}',
      '[data-theme=lantern] .sw.up{background:#f3dfc2;border-color:#dcb88a}[data-theme=lantern] .sw.done{background:#e3e6cf;border-color:#c3cba9}[data-theme=lantern] .sw.off{background:#ebe3cd;border-color:#e0d3b2}',
      '[data-theme=lantern] .day.sel{box-shadow:0 0 0 2px #3a3426}[data-theme=lantern] .day.today.sel{box-shadow:inset 0 0 0 2px var(--accent),0 0 0 2px #3a3426}',
      '[data-theme=lantern] .chip.submitted,[data-theme=lantern] .rv.h{background:#f3dfc2;color:#6b3f1d}[data-theme=lantern] .chip.todo{background:#ebe3cd;color:#766c55}',
      '[data-theme=lantern] .lbar,[data-theme=lantern] .lchip,[data-theme=lantern] .bub{background:#ebe3cd}',
      '[data-theme=lantern] .bank,[data-theme=lantern] .tnote{background:#f4ecd6}[data-theme=lantern] .lgrid div{background:#f5eedb}',
      '[data-theme=lantern] .hwq input[type=checkbox],[data-theme=lantern] .hwq input[type=radio]{accent-color:#b5652f}',
      /* 卡片標題前的小月亮 */
      '[data-theme=lantern] .card h2::before{content:"";display:inline-block;width:13px;height:13px;margin-right:7px;vertical-align:-1px;background:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\'><circle cx=\'12\' cy=\'12\' r=\'10\' fill=\'%23f3e0a0\'/><circle cx=\'9\' cy=\'10\' r=\'1.6\' fill=\'%23e8d38a\'/><circle cx=\'15\' cy=\'15\' r=\'2\' fill=\'%23e8d38a\'/></svg>") no-repeat center/contain}',
      /* 頂部小燈籠串 */
      '[data-theme=lantern] .pt-lights{display:block;height:58px;margin:-4px -2px 6px;background:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'96\' height=\'58\' viewBox=\'0 0 96 58\'><path d=\'M0 4 Q24 12 48 4 T96 4\' fill=\'none\' stroke=\'%23a69a86\' stroke-width=\'1.4\'/><g transform=\'translate(8 5) scale(.8)\'><path d=\'M12 2v4\' stroke=\'%23a69a86\' stroke-width=\'1.4\'/><rect x=\'7\' y=\'5\' width=\'10\' height=\'3\' rx=\'1.2\' fill=\'%238f7a4a\'/><ellipse cx=\'12\' cy=\'19\' rx=\'10\' ry=\'11\' fill=\'%23d4893f\'/><ellipse cx=\'12\' cy=\'19\' rx=\'5\' ry=\'11\' fill=\'%23e2a45c\'/><path d=\'M12 8v22M7.5 9q-3 10 0 20M16.5 9q3 10 0 20\' stroke=\'%23a8642a\' stroke-width=\'.9\' fill=\'none\'/><rect x=\'7\' y=\'29\' width=\'10\' height=\'3\' rx=\'1.2\' fill=\'%238f7a4a\'/><path d=\'M12 32v8M9 32v6M15 32v6\' stroke=\'%238f7a4a\' stroke-width=\'1.3\' stroke-linecap=\'round\'/></g><g transform=\'translate(56 8) scale(.7)\'><path d=\'M12 2v4\' stroke=\'%23a69a86\' stroke-width=\'1.4\'/><rect x=\'7\' y=\'5\' width=\'10\' height=\'3\' rx=\'1.2\' fill=\'%238f7a4a\'/><ellipse cx=\'12\' cy=\'19\' rx=\'10\' ry=\'11\' fill=\'%23e6c577\'/><ellipse cx=\'12\' cy=\'19\' rx=\'5\' ry=\'11\' fill=\'%23f0d896\'/><path d=\'M12 8v22M7.5 9q-3 10 0 20M16.5 9q3 10 0 20\' stroke=\'%23bf9a4c\' stroke-width=\'.9\' fill=\'none\'/><rect x=\'7\' y=\'29\' width=\'10\' height=\'3\' rx=\'1.2\' fill=\'%238f7a4a\'/><path d=\'M12 32v8M9 32v6M15 32v6\' stroke=\'%238f7a4a\' stroke-width=\'1.3\' stroke-linecap=\'round\'/></g></svg>") repeat-x;background-size:96px 58px}',
      /* 問候卡左上角的小星星 */
      '[data-theme=lantern] .hello::before{content:"";position:absolute;left:0;top:0;width:44px;height:44px;pointer-events:none;opacity:.9;background:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 40 40\'><g fill=\'%23d6b560\'><path d=\'M10 4l1.4 4.6L16 10l-4.6 1.4L10 16l-1.4-4.6L4 10l4.6-1.4z\'/><path d=\'M30 14l1 3.2 3.2 1-3.2 1-1 3.2-1-3.2-3.2-1 3.2-1z\' opacity=\'.8\'/><path d=\'M20 30l.8 2.4 2.4.8-2.4.8-.8 2.4-.8-2.4-2.4-.8 2.4-.8z\' opacity=\'.7\'/></g></svg>") no-repeat;background-size:contain}',
      /* 往上浮的小天燈 */
      '[data-theme=lantern] .pt-snow i{position:absolute;top:100%;background:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 38\'><path d=\'M5 7q7-8 14 0l1.5 21h-17z\' fill=\'%23e9ad62\'/><path d=\'M5 7q7-8 14 0\' fill=\'none\' stroke=\'%23c98741\' stroke-width=\'1\'/><path d=\'M9 5.5q-1 11 .5 22.5M15 5.5q1 11-.5 22.5\' stroke=\'%23d49650\' stroke-width=\'.8\' fill=\'none\'/><rect x=\'2.5\' y=\'27.5\' width=\'19\' height=\'2.6\' rx=\'1.2\' fill=\'%238f7a4a\'/><circle cx=\'12\' cy=\'33.5\' r=\'4.6\' fill=\'%23f8e3a2\' opacity=\'.55\'/><ellipse cx=\'12\' cy=\'33\' rx=\'2.2\' ry=\'3.2\' fill=\'%23f4c768\'/><ellipse cx=\'12\' cy=\'34\' rx=\'1\' ry=\'1.7\' fill=\'%23fff1c4\'/></svg>") no-repeat center/contain;opacity:0;animation:ptrise linear infinite}',
      '@keyframes ptrise{0%{transform:translate(0,0);opacity:0}12%{opacity:.9}50%{transform:translate(16px,-55vh)}88%{opacity:.9}100%{transform:translate(-10px,-112vh);opacity:0}}'
    ].join('\n')
  }
};

var PT_BASE_CSS = [
  '.pt-lights,.pt-snow,.pt-trees,.pt-hollyd,.pt-flakesd,.pt-smd,.pt-star,.pt-deco{display:none}',
  '[data-theme] .pt-trees{display:flex;justify-content:center;align-items:flex-end;gap:8px;flex-wrap:wrap;margin:6px 0 18px}',
  '[data-theme] .pt-trees .pt-g{display:inline-flex;align-items:flex-end}',
  '[data-theme] .pt-snow{display:block;position:fixed;left:0;top:0;right:0;bottom:0;pointer-events:none;z-index:5;overflow:hidden}',
  '@media (prefers-reduced-motion:reduce){.pt-snow{display:none!important}}',
  '[data-theme] .hello{position:relative;overflow:hidden}',
  '[data-theme] .day{position:relative}',
  '[data-theme] .pt-star{display:block;position:absolute;top:2px;right:3px;pointer-events:none}',
  '[data-theme] .pt-deco{display:flex;align-items:center;gap:10px;margin-top:6px}',
  '[data-theme] .pt-deco .gr{font-size:15px;color:var(--pt-gr);font-weight:600;letter-spacing:.02em}',
  '[data-theme] .pt-deco .gr small{display:block;font-size:12px;color:var(--pt-gr2);font-weight:500;letter-spacing:.04em}',
  '[data-theme] .pt-hollyd{display:block;position:absolute;right:70px;top:4px}',
  '[data-theme] .pt-flakesd{display:block;position:absolute;right:122px;top:8px;opacity:.9}',
  '[data-theme] .pt-smd{display:block;position:absolute;right:14px;bottom:-4px;transform:scale(.8);transform-origin:bottom right}',
  '@media (min-width:1024px){[data-theme] .hello{align-items:center}[data-theme] .pt-deco{margin:0 0 0 auto}[data-theme] .pt-hollyd,[data-theme] .pt-flakesd,[data-theme] .pt-smd{position:static;display:block;transform:none;margin:0}[data-theme] .pt-smd svg{width:37px;height:51px}}'
].join('\n');

/* 首頁問候卡裡的裝飾（放在 .hi 後面）；沒有主題就回空字串 */
function ptHelloDeco(lang) {
  var a = PT_ACTIVE && PT_ASSETS[PT_ACTIVE]; if (!a) return '';
  var g = PT_GREET[PT_ACTIVE][ptLangKey(lang)], s = a.side();
  return '<div class="pt-deco">' + a.hello(g) + '</div>'
    + '<span class="pt-flakesd">' + s.a + '</span><span class="pt-hollyd">' + s.b + '</span><span class="pt-smd">' + s.c + '</span>';
}
/* 日曆節慶當天的小記號（iso = YYYY-MM-DD）；非節慶日回空字串 */
function ptDayMark(iso) {
  if (!PT_ACTIVE) return '';
  var f = ptFestById(PT_ACTIVE); if (!f) return '';
  var y = +String(iso).slice(0, 4), p = String(iso).split('-');
  return ptDayNum(y, +p[1], +p[2]) === ptFestDay(f, y) ? '<span class="pt-star">' + PT_ASSETS[PT_ACTIVE].mark() + '</span>' : '';
}

/* 真的改畫面（只在瀏覽器裡做；測試環境沒有 document 就跳過） */
function ptApply(id) {
  PT_ACTIVE = id && PT_ASSETS[id] ? id : null;
  if (typeof document === 'undefined') return;
  var root = document.documentElement;
  var st = document.getElementById('ptCss');
  if (!st) { st = document.createElement('style'); st.id = 'ptCss'; document.head.appendChild(st); }
  st.textContent = PT_BASE_CSS + (PT_ACTIVE ? '\n' + PT_ASSETS[PT_ACTIVE].css : '');
  if (PT_ACTIVE) root.setAttribute('data-theme', PT_ACTIVE); else root.removeAttribute('data-theme');
  var wrap = document.querySelector('.wrap');
  var lights = document.getElementById('ptLights'), trees = document.getElementById('ptTrees'), snow = document.getElementById('ptSnow');
  /* 換了別的節慶（例如老師在後台切換）就整組重做；同一個節慶就保留，不讓動態效果重頭來 */
  [lights, trees, snow].forEach(function (e) { if (e && e.getAttribute('data-pt') !== PT_ACTIVE) { e.remove(); if (e === lights) lights = null; if (e === trees) trees = null; if (e === snow) snow = null; } });
  if (!PT_ACTIVE) return;
  var A = PT_ASSETS[PT_ACTIVE];
  if (wrap && !lights) { lights = document.createElement('div'); lights.id = 'ptLights'; lights.className = 'pt-lights'; lights.setAttribute('data-pt', PT_ACTIVE); wrap.insertBefore(lights, wrap.firstChild); }
  var foot = document.getElementById('foot');
  if (wrap && !trees) { trees = document.createElement('div'); trees.id = 'ptTrees'; trees.className = 'pt-trees'; trees.setAttribute('data-pt', PT_ACTIVE); wrap.insertBefore(trees, foot || null); trees.innerHTML = A.foot(); }
  if (!snow) {
    snow = document.createElement('div'); snow.id = 'ptSnow'; snow.className = 'pt-snow'; snow.setAttribute('aria-hidden', 'true'); snow.setAttribute('data-pt', PT_ACTIVE);
    var narrow = window.innerWidth < 600, bats = A.fx === 'bats', petals = A.fx === 'petals', lanterns = A.fx === 'lanterns', n = bats ? (narrow ? 4 : 7) : lanterns ? (narrow ? 4 : 7) : petals ? (narrow ? 7 : 12) : (narrow ? 9 : 16);
    for (var i = 0; i < n; i++) {
      var e = document.createElement('i');
      if (bats) {
        var w = 20 + Math.random() * 14;
        e.style.cssText = 'top:' + (4 + Math.random() * 55).toFixed(1) + '%;width:' + w.toFixed(1) + 'px;height:' + (w * 0.6).toFixed(1) + 'px;animation-duration:' + (14 + Math.random() * 12).toFixed(1) + 's;animation-delay:-' + (Math.random() * 20).toFixed(1) + 's';
      } else if (lanterns) {
        var lw = 14 + Math.random() * 8;
        e.style.cssText = 'left:' + (4 + Math.random() * 92).toFixed(1) + '%;width:' + lw.toFixed(1) + 'px;height:' + (lw * 1.55).toFixed(1) + 'px;animation-duration:' + (12 + Math.random() * 6).toFixed(1) + 's;animation-delay:-' + (Math.random() * 14).toFixed(1) + 's';
      } else if (petals) {
        var pz = 9 + Math.random() * 6;
        e.style.cssText = 'left:' + (Math.random() * 100).toFixed(1) + '%;width:' + pz.toFixed(1) + 'px;height:' + pz.toFixed(1) + 'px;animation-duration:' + (11 + Math.random() * 8).toFixed(1) + 's;animation-delay:-' + (Math.random() * 16).toFixed(1) + 's';
      } else {
        var z = 3 + Math.random() * 4;
        e.style.cssText = 'left:' + (Math.random() * 100).toFixed(1) + '%;width:' + z.toFixed(1) + 'px;height:' + z.toFixed(1) + 'px;animation-duration:' + (9 + Math.random() * 10).toFixed(1) + 's;animation-delay:-' + (Math.random() * 14).toFixed(1) + 's';
      }
      snow.appendChild(e);
    }
    document.body.appendChild(snow);
  }
}
if (typeof document !== 'undefined') { try { ptApply(ptPick(ptTodayIso())); } catch (e) { console.error(e); } }

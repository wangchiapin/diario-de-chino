/* 節慶主題（學生頁用）：依日期自動換配色＋小裝飾，也可由後台手動指定。
   規則：節慶當天的「前 3 天到後 2 天」套用；兩個節慶重疊時，離哪個節慶當天近就用哪個。
   後台設定存在 portal/{老師uid}/config/theme：{ mode:'auto'|'off'|'force', id:'xmas', updatedAt }
   新增節慶：在 PT_FEST 加一筆（日期規則＋名稱），並在 PT_ASSETS 加同 id 的 css 與裝飾。 */
var PT_BEFORE = 3, PT_AFTER = 2;

var PT_FEST = [
  { id: 'xmas', name: { es: 'Navidad', en: 'Christmas', tc: '聖誕節', sc: '圣诞节' }, date: function (y) { return [12, 25]; } },
  { id: 'halloween', name: { es: 'Halloween', en: 'Halloween', tc: '萬聖節', sc: '万圣节' }, date: function (y) { return [10, 31]; } }
];

var PT_GREET = {
  xmas: { es: ['¡Feliz Navidad!', '聖誕快樂'], en: ['Merry Christmas!', '聖誕快樂'], tc: ['聖誕快樂', 'Feliz Navidad'], sc: ['圣诞快乐', 'Feliz Navidad'] },
  halloween: { es: ['¡Feliz Halloween!', '萬聖節快樂'], en: ['Happy Halloween!', '萬聖節快樂'], tc: ['萬聖節快樂', 'Feliz Halloween'], sc: ['万圣节快乐', 'Feliz Halloween'] }
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

/* 每個節慶一組：css（配色＋專屬裝飾）、hello（問候卡裡的裝飾）、mark（日曆節慶日記號）、foot（頁尾小場景）、fx（動態效果：snow 飄雪／bats 飛蝙蝠） */
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
    var narrow = window.innerWidth < 600, bats = A.fx === 'bats', n = bats ? (narrow ? 4 : 7) : (narrow ? 9 : 16);
    for (var i = 0; i < n; i++) {
      var e = document.createElement('i');
      if (bats) {
        var w = 20 + Math.random() * 14;
        e.style.cssText = 'top:' + (4 + Math.random() * 55).toFixed(1) + '%;width:' + w.toFixed(1) + 'px;height:' + (w * 0.6).toFixed(1) + 'px;animation-duration:' + (14 + Math.random() * 12).toFixed(1) + 's;animation-delay:-' + (Math.random() * 20).toFixed(1) + 's';
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

/* =====================================================================
   Diario de chino · 「學習」分頁共用程式（純計算，不碰網頁和 Firebase；tests/run.js 會單獨測）

   內容：
   1. 上課紀錄：日誌每堂課的「課程進度」（studentDoc.log），新的在上面，依月份分組。
   2. 單字／語法點總表：練習單自動匯入＋老師在後台補充（portal/{tid}/lists/{sid}），見 learnTotals。
   3. 複習：卡片（新學的優先，中→西或西→中）、單字總表、語法總表；學生自己標「記得／還不熟」，存在雲端（只有自己和老師看得到）。
   4. 能力：已完成作業數、單字數、語法點數、各題型答對率、最近幾份作業的分數走向。
      老師設成「不顯示分數」的作業，不算進答對率（尊重老師的設定）。
   5. 教材：Drive 裡這位學生資料夾的 PDF（portal/{tid}/materials/{sid}，由老師的 Apps Script 寫入）。
   需要先載入 portal-nudge.js（用到 nudParseVocab、nudSplitPoints）。
===================================================================== */

var LEARN_I18N = {
  es: {
    learn: 'Mi aprendizaje', learnBtn: 'Abrir', learnBack: '‹ Volver',
    tLog: 'Clases', tReview: 'Repasar', tAbility: 'Mi nivel', tFiles: 'Materiales',
    logEmpty: 'Aún no hay registro de clases.', nextUp: 'Próxima clase', logCount: '{n} clases registradas',
    wordsHead: 'Palabras ({n})', pointsHead: 'Gramática ({n})', rvCards: 'Tarjetas', rvWords: 'Lista de palabras', rvPoints: 'Lista de gramática', dirZE: 'Chino → español', dirEZ: 'Español → chino', speak: 'Escuchar',
    wordsNone: 'Todavía no hay palabras.', pointsNone: 'Todavía no hay puntos de gramática.', colWord: 'Palabra', colPy: 'Pinyin', colEs: 'Significado',
    revEmpty: 'Aún no hay palabras para repasar. Aparecerán cuando recibas tareas.', revShow: 'Ver significado', revKnow: 'Lo recuerdo', revNot: 'Aún no',
    revOnlyNot: 'Solo las que aún no recuerdo', revAll: 'Todas', revDone: '¡Terminaste este repaso!', revAgain: 'Repasar otra vez', revLeft: 'Quedan {n}',
    revNoNot: 'No tienes palabras marcadas como «Aún no». ¡Muy bien!',
    abHw: 'Tareas corregidas', abWords: 'Palabras', abPoints: 'Puntos de gramática', abClasses: 'Clases', abByType: 'Aciertos por tipo de ejercicio', abTrend: 'Tus últimas tareas',
    abEmpty: 'Cuando tu profesor corrija tus tareas, aquí verás cómo vas.', abNote: 'No se cuentan las tareas cuyo puntaje el profesor decidió no mostrar.',
    abGLearned: 'Aprendidos', abGCefr: 'Nivel aproximado', abGFew: 'Aún no hay suficientes puntos para estimar el nivel.',
    abTestH: 'Test de nivel', abTestD: 'Una estimación rápida de tu nivel de chino (unas 20 preguntas). No es un examen oficial.', abTestGo: 'Hacer el test',
    abStart: 'Punto de partida fijado por tu profesor: {l}.',
    abLv: 'Nivel según tu vocabulario', abReached: 'Alcanzado', abLearning: 'Estudiando', abFew: 'Aún hay pocas palabras para estimar tu nivel.', abNone: 'todavía ninguno', abRef: 'Es solo una referencia basada en las palabras que has estudiado, no el resultado de un examen.', abLvName: 'Nivel {n}', abOf: '{a} de {b}',
    fEmpty: 'Todavía no hay materiales.', fOpen: 'Abrir',
    types: { fill: 'Completar', cloze: 'Párrafo', order: 'Ordenar', choice: 'Opción múltiple', fix: 'Corregir', translate: 'Traducir al español', zh2es: 'Traducir al chino', match: 'Unir', sentence: 'Crear frases' }
  },
  tc: {
    learn: '我的學習', learnBtn: '打開', learnBack: '‹ 返回',
    tLog: '上課紀錄', tReview: '複習', tAbility: '我的能力', tFiles: '教材',
    logEmpty: '還沒有上課紀錄。', nextUp: '下次預告', logCount: '共 {n} 堂紀錄',
    wordsHead: '單字（{n}）', pointsHead: '語法（{n}）', rvCards: '卡片', rvWords: '單字總表', rvPoints: '語法總表', dirZE: '中文 → 西文', dirEZ: '西文 → 中文', speak: '聽發音',
    wordsNone: '還沒有單字。', pointsNone: '還沒有語法點。', colWord: '單字', colPy: '拼音', colEs: '西文意思',
    revEmpty: '還沒有可以複習的單字，收到作業後就會出現。', revShow: '看意思', revKnow: '我記得', revNot: '還不熟',
    revOnlyNot: '只複習還不熟的', revAll: '全部', revDone: '這一輪複習完了！', revAgain: '再複習一次', revLeft: '還剩 {n} 個',
    revNoNot: '沒有標成「還不熟」的單字，太棒了！',
    abHw: '已批改的作業', abWords: '單字', abPoints: '語法點', abClasses: '上課堂數', abByType: '各題型答對率', abTrend: '最近幾份作業',
    abEmpty: '老師批改作業後，這裡會看到你的進步。', abNote: '老師設成「不顯示分數」的作業，不會算進來。',
    abGLearned: '學過', abGCefr: '約', abGFew: '學過的語法點還太少，先不評估。',
    abTestH: '能力分級測驗', abTestD: '用大約 20 題快速估計你的中文程度（西文介面）。這不是正式考試。', abTestGo: '開始測驗',
    abStart: '起點由老師設定：{l}。',
    abLv: '單字量對照等級', abReached: '已達到', abLearning: '正在學', abFew: '學過的單字還太少，先不評估。', abNone: '還沒有', abRef: '這只是依你學過的單字做的參考，不是考試成績。', abLvName: '第{n}級', abOf: '{a}／{b}',
    fEmpty: '還沒有教材。', fOpen: '打開',
    types: { fill: '填空', cloze: '段落填空', order: '排序', choice: '選擇', fix: '改錯', translate: '西翻中', zh2es: '中翻西', match: '配對', sentence: '造句' }
  },
  sc: {
    learn: '我的学习', learnBtn: '打开', learnBack: '‹ 返回',
    tLog: '上课纪录', tReview: '复习', tAbility: '我的能力', tFiles: '教材',
    logEmpty: '还没有上课纪录。', nextUp: '下次预告', logCount: '共 {n} 堂纪录',
    wordsHead: '单字（{n}）', pointsHead: '语法（{n}）', rvCards: '卡片', rvWords: '单字总表', rvPoints: '语法总表', dirZE: '中文 → 西文', dirEZ: '西文 → 中文', speak: '听发音',
    wordsNone: '还没有单字。', pointsNone: '还没有语法点。', colWord: '单字', colPy: '拼音', colEs: '西文意思',
    revEmpty: '还没有可以复习的单字，收到作业后就会出现。', revShow: '看意思', revKnow: '我记得', revNot: '还不熟',
    revOnlyNot: '只复习还不熟的', revAll: '全部', revDone: '这一轮复习完了！', revAgain: '再复习一次', revLeft: '还剩 {n} 个',
    revNoNot: '没有标成「还不熟」的单字，太棒了！',
    abHw: '已批改的作业', abWords: '单字', abPoints: '语法点', abClasses: '上课堂数', abByType: '各题型答对率', abTrend: '最近几份作业',
    abEmpty: '老师批改作业后，这里会看到你的进步。', abNote: '老师设成「不显示分数」的作业，不会算进来。',
    abGLearned: '学过', abGCefr: '约', abGFew: '学过的语法点还太少，先不评估。',
    abTestH: '能力分级测验', abTestD: '用大约 20 题快速估计你的中文程度（西文介面）。这不是正式考试。', abTestGo: '开始测验',
    abStart: '起点由老师设定：{l}。',
    abLv: '单字量对照等级', abReached: '已达到', abLearning: '正在学', abFew: '学过的单字还太少，先不评估。', abNone: '还没有', abRef: '这只是依你学过的单字做的参考，不是考试成绩。', abLvName: '第{n}级', abOf: '{a}／{b}',
    fEmpty: '还没有教材。', fOpen: '打开',
    types: { fill: '填空', cloze: '段落填空', order: '排序', choice: '选择', fix: '改错', translate: '西翻中', zh2es: '中翻西', match: '配对', sentence: '造句' }
  }
};
function learnT(lang, key, p) {
  var l = lang === 'es' || lang === 'sc' ? lang : 'tc';
  var s = LEARN_I18N[l][key];
  if (s == null) s = LEARN_I18N.tc[key];
  if (typeof s !== 'string') return s;
  return s.replace(/\{(\w+)\}/g, function (m, k) { return p && p[k] != null ? p[k] : m; });
}
function learnTypeName(lang, type) {
  var l = lang === 'es' || lang === 'sc' ? lang : 'tc';
  return LEARN_I18N[l].types[type] || type;
}

/* ───────── 1. 上課紀錄 ───────── */
/* log: [{d:'YYYY-MM-DD', p:'把'}] → [{ym:'2026-11', rows:[{d,p}]}]，月份新到舊，月內也是新到舊 */
function learnLogGroups(log) {
  var rows = (Array.isArray(log) ? log : []).filter(function (r) { return r && /^\d{4}-\d{2}-\d{2}$/.test(r.d || '') && String(r.p || '').trim(); })
    .map(function (r) { return { d: r.d, p: String(r.p).trim() }; });
  rows.sort(function (a, b) { return a.d < b.d ? 1 : a.d > b.d ? -1 : 0; });
  var out = [], cur = null;
  rows.forEach(function (r) {
    var ym = r.d.slice(0, 7);
    if (!cur || cur.ym !== ym) { cur = { ym: ym, rows: [] }; out.push(cur); }
    cur.rows.push(r);
  });
  return out;
}

/* ───────── 3. 複習 ───────── */
/* marks：{ '做菜': 1 } 表示「還不熟」；沒有記錄的算「還沒標」。
   onlyNot=true 時只留標過「還不熟」的。回傳卡片陣列（照 mode 的洗牌種子打散；同一輪順序固定） */
function learnDeck(words, marks, onlyNot, seed, dir) {
  var list = (words || []).filter(function (w) { return w && w.zh; });
  if (dir === 'e2z') list = list.filter(function (w) { return w.es; });   // 西文→中文：沒有西文意思的單字沒辦法出
  if (onlyNot) list = list.filter(function (w) { return marks && marks[w.zh] === 1; });
  function h(s) {   // 簡單雜湊＋最後再攪一次，種子差 1 順序也會明顯不同
    var x = 2166136261; s = String(s);
    for (var i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); }
    x ^= x >>> 15; x = Math.imul(x, 2246822519); x ^= x >>> 13; x = Math.imul(x, 3266489917); x ^= x >>> 16;
    return x >>> 0;
  }
  // 新學的優先（t 大的在前）；同一批（t 一樣）才用種子打散
  return list.map(function (w) { return { w: w, t: +w.t || 0, k: h(w.zh + '|' + (seed || 0)) }; })
    .sort(function (a, b) { return (b.t - a.t) || (a.k - b.k); })
    .map(function (x) { return x.w; });
}

/* ───────── 3b. 單字總表／語法總表 ───────── */
/* hwDocs：學生的作業；list：老師在後台為這位學生存的清單 { words:[{zh,py,es,t}], hideW:[zh], points:[{n,t}], hideP:[n] }
   練習單的單字、語法點自動匯入（t = 作業派出的時間，同一個只算一次）；老師的清單可以補充、改拼音和意思、或隱藏。
   回傳 { words:[{zh,py,es,t,src}], points:[{n,t,src}] }，新的在前。src: 'hw' 來自練習單、'tc' 老師自己加的 */
function learnTotals(hwDocs, list) {
  list = list || {};
  var ids = Object.keys(hwDocs || {});
  function ts(d) { return +(d && (d.assignedAt || d.submittedAt)) || 0; }
  ids.sort(function (a, b) { return ts(hwDocs[a]) - ts(hwDocs[b]) || (a < b ? -1 : 1); });
  var W = {}, Wo = [], P = {}, Po = [];
  function addW(zh, es, t, src) {
    zh = String(zh || '').trim(); if (!zh) return;
    var x = W[zh];
    if (!x) { x = W[zh] = { zh: zh, py: '', es: '', t: t, src: src }; Wo.push(x); }
    if (!x.es && es) x.es = String(es).trim();
  }
  function addP(n, t, src) { n = String(n || '').trim(); if (n && !P[n]) { P[n] = { n: n, t: t, src: src }; Po.push(P[n]); } }
  ids.forEach(function (id) {
    var d = hwDocs[id] || {}, t = ts(d);
    nudSplitPoints(d.grammar).forEach(function (n) { addP(n, t, 'hw'); });
    (Array.isArray(d.vocab) ? d.vocab : []).forEach(function (v) { if (v) addW(v.zh, v.es, t, 'hw'); });
    (d.sections || []).forEach(function (sec) {
      (sec.items || []).forEach(function (it) { if (it && it.vocab) nudParseVocab(it.vocab).forEach(function (v) { addW(v.zh, v.es, t, 'hw'); }); });
    });
  });
  (Array.isArray(list.words) ? list.words : []).forEach(function (e) {
    if (!e || !String(e.zh || '').trim()) return;
    var zh = String(e.zh).trim(), had = !!W[zh];
    addW(zh, '', +e.t || 0, 'tc');
    var x = W[zh];
    x.py = String(e.py || '').trim();
    if (String(e.es || '').trim()) x.es = String(e.es).trim();
    if (!had) x.t = +e.t || 0;
  });
  (Array.isArray(list.points) ? list.points : []).forEach(function (e) { if (e) addP(e.n, +e.t || 0, 'tc'); });
  var hw = {}, hp = {};
  (Array.isArray(list.hideW) ? list.hideW : []).forEach(function (z) { hw[z] = 1; });
  (Array.isArray(list.hideP) ? list.hideP : []).forEach(function (z) { hp[z] = 1; });
  function byT(a, b) { return (b.t - a.t); }
  return {
    words: Wo.filter(function (x) { return !hw[x.zh]; }).map(function (x, i) { x.i = i; return x; }).sort(function (a, b) { return byT(a, b) || (b.i - a.i); }),
    points: Po.filter(function (x) { return !hp[x.n]; }).map(function (x, i) { x.i = i; return x; }).sort(function (a, b) { return byT(a, b) || (b.i - a.i); })
  };
}

/* ───────── 3c. 單字量對照（TOCFL 八千詞／HSK 3.0）─────────
   data = window.LEVELS_DATA：{ t:{詞:級}, h:{詞:級}, ts:[各級總字數], hs:[…] }
   每一級的「覆蓋率」＝學過屬於那一級的單字數 ÷ 那一級的總字數。
   從第 1 級連續往上，覆蓋率都 ≥ 75% 才算「已達到」，下一級就是「正在學」。
   對到的單字少於 30 個就不評估（回傳 enough:false）。 */
var LEARN_CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
function learnLevels(words, data, threshold, minWords, start) {
  threshold = threshold || 0.75; minWords = minWords || 30;
  var out = { tocfl: null, hsk: null };
  if (!data) return out;
  function forms(zh) {
    var a = [String(zh || '').trim()];
    String(zh || '').split(/[\/／、,，;；\s]+/).forEach(function (x) { x = x.replace(/[()（）]/g, ''); if (x) a.push(x); });
    return a;
  }
  var base = Math.max(0, LEARN_CEFR.indexOf(start && start.cefr) + 1);   // 老師設的起點：這一級以下都算已會
  function calc(map, sizes) {
    var cnt = sizes.map(function () { return 0; }), seen = {}, matched = 0;
    (words || []).forEach(function (w) {
      var f = forms(w.zh), lv = 0;
      for (var i = 0; i < f.length; i++) { if (map[f[i]]) { lv = map[f[i]]; break; } }
      if (lv && !seen[lv + ':' + f[0]]) { seen[lv + ':' + f[0]] = 1; cnt[lv - 1]++; matched++; }
    });
    var levels = sizes.map(function (n, i) { return i < base ? { lv: i + 1, n: n, of: n, pct: 100, fixed: true } : { lv: i + 1, n: cnt[i], of: n, pct: Math.min(100, Math.round(cnt[i] / n * 100)) }; });
    var enough = matched >= minWords || base > 0, reached = Math.min(base, sizes.length);
    if (enough) { while (reached < sizes.length && cnt[reached] / sizes[reached] >= threshold) reached++; }
    return { levels: levels, matched: matched, enough: enough, reached: reached, learning: reached < sizes.length ? reached + 1 : 0 };
  }
  out.tocfl = calc(data.t || {}, data.ts || []);
  out.hsk = calc(data.h || {}, data.hs || []);
  out.start = base ? start.cefr : '';
  out.cefr = { reached: out.tocfl.reached, learning: out.tocfl.learning, enough: out.tocfl.enough,
    levels: out.tocfl.levels.map(function (l, i) { return { lv: LEARN_CEFR[i], n: l.n, of: l.of, pct: l.pct }; }) };
  return out;
}

/* ───────── 3d. 語法點對照（約 CEFR）─────────
   map = window.GRAMMAR_MAP：{ books:{冊:'A1–A2'}, titles:{標題:冊} }；manual：老師手動分的 { 標題:冊 }（0 ＝不分類）。
   「約 CEFR」＝學過 3 個以上語法點的最高那一冊的範圍（不到 3 個就只看最高的一冊）。 */
function learnGramNorm(s) { return String(s || '').replace(/[\s「」『』"“”'’、，。]/g, '').toLowerCase(); }
function learnGrammar(points, map, manual) {
  var out = { matched: 0, unmatched: [], cefr: '', byBook: {} };
  if (!map) return out;
  manual = manual || {};
  (points || []).forEach(function (p) {
    var n = String(p.n || p || ''), k = learnGramNorm(n);
    var b = map.titles[k] || manual[n] || 0;
    if (b) { out.byBook[b] = (out.byBook[b] || 0) + 1; out.matched++; }
    else if (!(n in manual)) out.unmatched.push(n);
  });
  var books = Object.keys(out.byBook).map(Number).sort(function (a, b) { return a - b; }), pick = 0;
  books.forEach(function (b) { if (out.byBook[b] >= 3) pick = b; });
  if (!pick && books.length) pick = books[books.length - 1];
  if (out.matched >= 1 && pick) out.cefr = map.books[pick] || '';
  return out;
}

/* 「還不熟」的標記：存在雲端的格式是字串陣列 nf（單字本身當欄位名稱不安全，所以不用 map） */
function learnMarksFromDoc(d) {
  var m = {};
  (d && Array.isArray(d.nf) ? d.nf : []).forEach(function (z) { if (typeof z === 'string' && z) m[z] = 1; });
  return m;
}
function learnMarksToDoc(marks, nowMs) {
  return { v: 1, nf: Object.keys(marks || {}).filter(function (z) { return marks[z] === 1; }).slice(0, 500), updatedAt: nowMs };
}

/* ───────── 4. 能力 ───────── */
/* hwDocs：{ id: 學生那份作業 }。只算 status==='graded'、有 result、老師沒設「不顯示分數」的。
   回傳 { graded:數量, byType:{type:{got,max,pct}}, trend:[{title,pct,ts}]（舊到新，最多 8 份） } */
function learnAbility(hwDocs) {
  var byType = {}, trend = [], graded = 0;
  Object.keys(hwDocs || {}).forEach(function (id) {
    var d = hwDocs[id] || {};
    if (d.status !== 'graded') return;
    graded++;
    if (d.review && d.review.hideScore) return;
    if (d.result && d.result.max > 0) trend.push({ title: d.title || '', pct: Math.round(100 * d.result.got / d.result.max), ts: (d.review && d.review.gradedAt) || d.submittedAt || d.assignedAt || 0 });
    var items = d.review && d.review.items;
    if (!items) return;
    (d.sections || []).forEach(function (sec) {
      (sec.items || []).forEach(function (it) {
        var r = items[it.id];
        if (!r || !(r.max > 0)) return;
        var b = byType[sec.type] || (byType[sec.type] = { got: 0, max: 0 });
        b.got += r.got || 0; b.max += r.max;
      });
    });
  });
  Object.keys(byType).forEach(function (k) { byType[k].pct = Math.round(100 * byType[k].got / byType[k].max); });
  trend.sort(function (a, b) { return a.ts - b.ts; });
  return { graded: graded, byType: byType, trend: trend.slice(-8) };
}

/* ───────── 5. 教材 ───────── */
/* 只收 https 的 Google Drive／Docs 連結；檔名沒有就用「教材」；新的在上面 */
function learnFiles(doc) {
  var files = doc && Array.isArray(doc.files) ? doc.files : [];
  return files.filter(function (f) { return f && /^https:\/\/(drive|docs)\.google\.com\//.test(String(f.u || '')); })
    .map(function (f) { return { n: String(f.n || '').trim() || '教材', u: String(f.u), t: +f.t || 0 }; })
    .sort(function (a, b) { return b.t - a.t || (a.n < b.n ? -1 : 1); });
}

/* ───────── 6. 「有新內容」紅點用的特徵 ─────────
   o：{ studentDoc, hwDocs, hwLoaded, tot（learnTotals 的結果）, listReady（老師清單讀完了）, files（教材陣列；還沒讀好給 null）}
   資料還沒讀好的項目回傳 null（不判斷，免得一載入就亮） */
function learnSigs(o) {
  var sd = o.studentDoc || {}, log = learnLogGroups(sd.log), n = 0, latest = '';
  log.forEach(function (g) { n += g.rows.length; if (!latest) latest = g.rows[0].d; });
  var graded = 0, lastTs = 0;
  Object.keys(o.hwDocs || {}).forEach(function (id) {
    var d = o.hwDocs[id] || {};
    if (d.status === 'graded') { graded++; var t = +(d.review && d.review.gradedAt) || 0; if (t > lastTs) lastTs = t; }
  });
  var files = o.files ? o.files.reduce(function (m, f) { return Math.max(m, f.t || 0); }, 0) : 0;
  return {
    log: n + '|' + latest + '|' + (sd.next && sd.next.n || ''),
    review: o.hwLoaded && o.listReady && o.tot ? o.tot.words.length + '/' + o.tot.points.length : null,
    ability: o.hwLoaded ? graded + '|' + lastTs : null,
    files: o.files ? o.files.length + '|' + files : null
  };
}

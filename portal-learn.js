/* =====================================================================
   Diario de chino · 「學習」分頁共用程式（純計算，不碰網頁和 Firebase；tests/run.js 會單獨測）

   五塊內容：
   1. 上課紀錄：日誌每堂課的「課程進度」（studentDoc.log），新的在上面，依月份分組。
   2. 已學清單：學生收到的練習單裡的單字和語法點（沿用彈跳視窗的 nudBuildPool）。
   3. 複習：只從學過的單字出卡片；學生自己標「記得／還不熟」，存在這台裝置。
   4. 能力：已完成作業數、單字數、語法點數、各題型答對率、最近幾份作業的分數走向。
      老師設成「不顯示分數」的作業，不算進答對率（尊重老師的設定）。
   5. 教材：Drive 裡這位學生資料夾的 PDF（portal/{tid}/materials/{sid}，由老師的 Apps Script 寫入）。
   需要先載入 portal-nudge.js（用到 nudBuildPool）。
===================================================================== */

var LEARN_I18N = {
  es: {
    learn: 'Mi aprendizaje', learnBtn: 'Abrir', learnBack: '‹ Volver',
    tLog: 'Clases', tWords: 'Lo aprendido', tReview: 'Repasar', tAbility: 'Mi nivel', tFiles: 'Materiales',
    logEmpty: 'Aún no hay registro de clases.', nextUp: 'Próxima clase', logCount: '{n} clases registradas',
    wordsHead: 'Palabras ({n})', pointsHead: 'Gramática ({n})', wordsEmpty: 'Cuando hagas tus tareas, aquí aparecerán las palabras y la gramática que has estudiado.',
    revEmpty: 'Aún no hay palabras para repasar. Aparecerán cuando recibas tareas.', revShow: 'Ver significado', revKnow: 'Lo recuerdo', revNot: 'Aún no',
    revOnlyNot: 'Solo las que aún no recuerdo', revAll: 'Todas', revDone: '¡Terminaste este repaso!', revAgain: 'Repasar otra vez', revLeft: 'Quedan {n}',
    revNoNot: 'No tienes palabras marcadas como «Aún no». ¡Muy bien!',
    abHw: 'Tareas corregidas', abWords: 'Palabras', abPoints: 'Puntos de gramática', abClasses: 'Clases', abByType: 'Aciertos por tipo de ejercicio', abTrend: 'Tus últimas tareas',
    abEmpty: 'Cuando tu profesor corrija tus tareas, aquí verás cómo vas.', abNote: 'No se cuentan las tareas cuyo puntaje el profesor decidió no mostrar.',
    fEmpty: 'Todavía no hay materiales.', fOpen: 'Abrir',
    types: { fill: 'Completar', cloze: 'Párrafo', order: 'Ordenar', choice: 'Opción múltiple', fix: 'Corregir', translate: 'Traducir al español', zh2es: 'Traducir al chino', match: 'Unir', sentence: 'Crear frases' }
  },
  tc: {
    learn: '我的學習', learnBtn: '打開', learnBack: '‹ 返回',
    tLog: '上課紀錄', tWords: '已學清單', tReview: '複習', tAbility: '我的能力', tFiles: '教材',
    logEmpty: '還沒有上課紀錄。', nextUp: '下次預告', logCount: '共 {n} 堂紀錄',
    wordsHead: '單字（{n}）', pointsHead: '語法（{n}）', wordsEmpty: '做完作業後，學過的單字和語法會出現在這裡。',
    revEmpty: '還沒有可以複習的單字，收到作業後就會出現。', revShow: '看意思', revKnow: '我記得', revNot: '還不熟',
    revOnlyNot: '只複習還不熟的', revAll: '全部', revDone: '這一輪複習完了！', revAgain: '再複習一次', revLeft: '還剩 {n} 個',
    revNoNot: '沒有標成「還不熟」的單字，太棒了！',
    abHw: '已批改的作業', abWords: '單字', abPoints: '語法點', abClasses: '上課堂數', abByType: '各題型答對率', abTrend: '最近幾份作業',
    abEmpty: '老師批改作業後，這裡會看到你的進步。', abNote: '老師設成「不顯示分數」的作業，不會算進來。',
    fEmpty: '還沒有教材。', fOpen: '打開',
    types: { fill: '填空', cloze: '段落填空', order: '排序', choice: '選擇', fix: '改錯', translate: '西翻中', zh2es: '中翻西', match: '配對', sentence: '造句' }
  },
  sc: {
    learn: '我的学习', learnBtn: '打开', learnBack: '‹ 返回',
    tLog: '上课纪录', tWords: '已学清单', tReview: '复习', tAbility: '我的能力', tFiles: '教材',
    logEmpty: '还没有上课纪录。', nextUp: '下次预告', logCount: '共 {n} 堂纪录',
    wordsHead: '单字（{n}）', pointsHead: '语法（{n}）', wordsEmpty: '做完作业后，学过的单字和语法会出现在这里。',
    revEmpty: '还没有可以复习的单字，收到作业后就会出现。', revShow: '看意思', revKnow: '我记得', revNot: '还不熟',
    revOnlyNot: '只复习还不熟的', revAll: '全部', revDone: '这一轮复习完了！', revAgain: '再复习一次', revLeft: '还剩 {n} 个',
    revNoNot: '没有标成「还不熟」的单字，太棒了！',
    abHw: '已批改的作业', abWords: '单字', abPoints: '语法点', abClasses: '上课堂数', abByType: '各题型答对率', abTrend: '最近几份作业',
    abEmpty: '老师批改作业后，这里会看到你的进步。', abNote: '老师设成「不显示分数」的作业，不会算进来。',
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
function learnDeck(words, marks, onlyNot, seed) {
  var list = (words || []).filter(function (w) { return w && w.zh; });
  if (onlyNot) list = list.filter(function (w) { return marks && marks[w.zh] === 1; });
  function h(s) {   // 簡單雜湊＋最後再攪一次，種子差 1 順序也會明顯不同
    var x = 2166136261; s = String(s);
    for (var i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); }
    x ^= x >>> 15; x = Math.imul(x, 2246822519); x ^= x >>> 13; x = Math.imul(x, 3266489917); x ^= x >>> 16;
    return x >>> 0;
  }
  return list.map(function (w) { return { w: w, k: h(w.zh + '|' + (seed || 0)) }; })
    .sort(function (a, b) { return a.k - b.k; })
    .map(function (x) { return x.w; });
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

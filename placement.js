/* =====================================================================
   Diario de chino · 能力分級測驗（參考用，不是考試成績）
   題庫：placement-bank.js（window.PLACEMENT_BANK）。等級 1–6 ＝ A1–C2 ＝ TOCFL 第 1–6 級。
   兩個版本：快速版（約 20 題、兩階段：先 8 題粗估，再 12 題集中考邊界附近）、完整版（約 50 題，每級 8 題）。
   「不知道」不扣分的意思是：不算猜對，也不鼓勵瞎猜（照答錯算進正確率，但學生不會被提示答錯）。
   畫面一律用西文；學生頁和獨立網頁共用這支：plRender(容器, { mode, name, needName, onDone, onExit })
   ===================================================================== */
var PL_CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
var PL_PASS = 0.6;   // 一級的正確率達到這個比例才算「過」

/* ---------- 出題（純函式，rnd 可以換成固定的亂數方便測試） ---------- */
function plShuffle(a, rnd) {
  a = a.slice(); rnd = rnd || Math.random;
  for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}
function plPool(bank, lv, k) { return bank.items.filter(function (x) { return x.lv === lv && x.k === k; }); }
function plPassageIds(bank, lv) { return Object.keys(bank.pass).filter(function (id) { return bank.pass[id].lv === lv; }); }
function plPassageItems(bank, pid) { return bank.items.filter(function (x) { return x.p === pid; }); }
function plPick(arr, n, rnd, used) {
  return plShuffle(arr.filter(function (x) { return !used || !used[x.id]; }), rnd).slice(0, n);
}
/* 完整版：每級 3 題單字、3 題語法、1 篇短文（2 題）＝ 8 題，共 48 題，由易到難 */
function plBuildFull(bank, rnd) {
  var out = [];
  for (var lv = 1; lv <= 6; lv++) {
    var set = plPick(plPool(bank, lv, 'v'), 3, rnd).concat(plPick(plPool(bank, lv, 'g'), 3, rnd));
    var out1 = plShuffle(set, rnd), ps = plShuffle(plPassageIds(bank, lv), rnd);
    out = out.concat(out1);
    if (ps.length) out = out.concat(plPassageItems(bank, ps[0]));
  }
  return out;
}
/* 快速版第一階段：8 題，每級 1,1,2,2,1,1 題，單字和語法輪流 */
function plStage1(bank, rnd) {
  var plan = [1, 1, 2, 2, 1, 1], out = [], flip = 0;
  plan.forEach(function (n, i) {
    for (var c = 0; c < n; c++) {
      var k = (flip++ % 2) ? 'g' : 'v';
      out = out.concat(plPick(plPool(bank, i + 1, k), 1, rnd, out.reduce(function (m, x) { m[x.id] = 1; return m; }, {})));
    }
  });
  return out;
}
/* 粗估：答對的最高一級，而且它的下一級（較低那一級）也有答對，避免一題猜中就跳級 */
function plEstimate(ans) {
  var ok = {}; ans.forEach(function (a) { if (a.ok) ok[a.lv] = 1; });
  var est = 1;
  for (var l = 1; l <= 6; l++) { if (ok[l] && (l === 1 || ok[l - 1])) est = l; }
  return est;
}
/* 快速版第二階段：粗估那級的上下各一級（共三級），每級 4 題；粗估那級用 1 單字＋1 語法＋1 篇短文（2 題） */
function plStage2(bank, est, usedIds, rnd) {
  var lo = Math.max(1, Math.min(est - 1, 4)), out = [], used = {};
  (usedIds || []).forEach(function (id) { used[id] = 1; });
  for (var lv = lo; lv <= lo + 2; lv++) {
    var set;
    var ps = plPassageIds(bank, lv);
    if (lv === est && ps.length) {
      set = plPick(plPool(bank, lv, 'v'), 1, rnd, used).concat(plPick(plPool(bank, lv, 'g'), 1, rnd, used));
      set = plShuffle(set, rnd).concat(plPassageItems(bank, plShuffle(ps, rnd)[0]));
    } else {
      set = plShuffle(plPick(plPool(bank, lv, 'v'), 2, rnd, used).concat(plPick(plPool(bank, lv, 'g'), 2, rnd, used)), rnd);
    }
    out = out.concat(set);
  }
  return out;
}
/* ---------- 計分 ---------- */
function plScore(ans) {
  var by = {}, minL = 7;
  ans.forEach(function (a) { var s = by[a.lv] || (by[a.lv] = { n: 0, c: 0 }); s.n++; if (a.ok) s.c++; if (a.lv < minL) minL = a.lv; });
  var reached = 0;
  for (var l = 1; l <= 6; l++) {
    var s = by[l];
    if (!s) { if (l < minL) { reached = l; continue; } break; }   // 沒考的更低級視為已過
    if (s.c / s.n >= PL_PASS) reached = l; else break;
  }
  var nx = by[reached + 1], next = !!(nx && nx.c / nx.n >= 0.4 && reached < 6);
  var cefr = reached === 0 ? '<A1' : (next ? PL_CEFR[reached - 1] + '–' + PL_CEFR[reached] : PL_CEFR[reached - 1]);
  if (reached === 0 && by[1] && by[1].c / by[1].n >= 0.4) cefr = 'A1';
  var total = ans.length, right = ans.filter(function (a) { return a.ok; }).length;
  var tocfl = reached === 0 ? '—' : (next ? reached + '–' + (reached + 1) : String(reached));
  return { reached: reached, next: next, cefr: cefr, tocfl: tocfl, by: by, total: total, right: right };
}

/* ---------- 畫面（西文） ---------- */
var PL_T = {
  title: 'Test de nivel de chino', intro: 'Una estimación rápida de tu nivel. No es un examen oficial.',
  quick: 'Versión rápida', quickD: 'Unas 20 preguntas, 3–5 minutos', full: 'Versión completa', fullD: 'Unas 50 preguntas, 15–20 minutos',
  start: 'Empezar', q: 'Pregunta', of: 'de', dk: 'No sé', py: 'Pinyin', script: '简 / 繁',
  meaning: '¿Qué significa?', pick: 'Elige la opción correcta', read: 'Lee el texto y responde',
  doneH: 'Tu nivel aproximado', tocflL: 'Equivale a TOCFL nivel', right: 'Respuestas correctas',
  note: 'Es solo una referencia basada en pocas preguntas, no el resultado de un examen. Tu profesor confirmará tu nivel en clase.',
  copy: 'Copiar resultado', copied: '¡Copiado!', send: 'Enviar a mi profesor', sent: '✓ Enviado a tu profesor', sending: 'Enviando…', sendErr: 'No se pudo enviar. Inténtalo de nuevo.',
  again: 'Repetir el test', exit: 'Volver', name: 'Tu nombre', nameReq: 'Escribe tu nombre para empezar.', saved: '✓ Resultado guardado. Tu profesor podrá verlo.', saving: 'Guardando…', saveErr: 'No se pudo guardar el resultado. Inténtalo de nuevo.', retry: 'Guardar de nuevo', below: 'Todavía por debajo de A1',
  lvl: 'Nivel', byLevel: 'Resultado por nivel', stage: 'Parte', loading: 'Cargando…'
};
function plEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function plTidyPy(p) { return String(p || '').replace(/ ([，。？！、；：,.?!;:])/g, '$1').replace(/＿＿/g, '＿＿'); }
function plResultText(r, st) {
  var lvl = r.reached === 0 ? PL_T.below : r.cefr;
  return 'Test de nivel (' + (st.mode === 'quick' ? 'rápido' : 'completo') + ') · Nivel aproximado: ' + lvl + (r.reached ? ' · TOCFL ' + r.tocfl : '') +
    ' · Aciertos: ' + r.right + '/' + r.total + ' · Pinyin: ' + (st.pyUsed ? 'sí' : 'no') + (st.name ? ' · ' + st.name : '');
}
function plCss() {
  if (document.getElementById('plCss')) return;
  var s = document.createElement('style'); s.id = 'plCss';
  s.textContent = '.pl{max-width:560px;margin:0 auto;font-family:inherit;color:inherit}.pl h2{margin:0 0 6px;font-size:20px}.pl .plc{background:#fff;border:1px solid #e3ddd0;border-radius:12px;padding:16px;margin:10px 0}' +
    '.pl .plm{color:#7a7468;font-size:13px}.pl .plb{display:block;width:100%;text-align:left;padding:12px 14px;margin:8px 0;border:1px solid #d8d1c2;background:#faf8f3;border-radius:10px;font-size:18px;cursor:pointer;font-family:inherit;color:inherit}' +
    '.pl .plb:hover{background:#f0ebe0}.pl .plb.es{font-size:16px}.pl .plb small{display:block;font-size:12px;color:#7a7468;margin-top:2px}.pl .pld{background:none;border:0;color:#7a7468;text-decoration:underline;cursor:pointer;font-size:14px;margin-top:6px;font-family:inherit}' +
    '.pl .plq{font-size:24px;line-height:1.5}.pl .plq small{display:block;font-size:14px;color:#7a7468}.pl .plpass{font-size:19px;line-height:1.7;background:#f3efe6;border-radius:10px;padding:12px;margin-bottom:10px}.pl .plpass small{display:block;font-size:13px;color:#7a7468;line-height:1.4}' +
    '.pl .plbar{height:8px;background:#ece7dc;border-radius:6px;overflow:hidden;margin:6px 0}.pl .plbar i{display:block;height:100%;background:#7a6a4f}.pl .plbig{font-size:34px;line-height:1.2;font-weight:700;margin:6px 0}.pl .plrow{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap}' +
    '.pl .plbtn{padding:10px 16px;border:1px solid #7a6a4f;background:#7a6a4f;color:#fff;border-radius:10px;cursor:pointer;font-size:16px;font-family:inherit}.pl .plbtn.q{background:#fff;color:#7a6a4f}.pl .plsw{font-size:13px;padding:4px 10px;border:1px solid #d8d1c2;background:#fff;border-radius:14px;cursor:pointer;font-family:inherit;color:inherit}.pl .plsw.on{background:#7a6a4f;color:#fff;border-color:#7a6a4f}.pl input{padding:8px;border:1px solid #d8d1c2;border-radius:8px;font-size:15px;width:100%;box-sizing:border-box}';
  document.head.appendChild(s);
}
/* opts：{ mode:'quick'|'full'|null（null 先讓使用者選）, name:名字, needName:要先填名字, onDone:function(紀錄)→Promise（測完自動呼叫一次）, onExit:function, rnd, bank } */
function plRender(root, opts) {
  opts = opts || {};
  plCss();
  var bank = opts.bank || window.PLACEMENT_BANK, rnd = opts.rnd || Math.random;
  var st = { mode: opts.mode || null, phase: 'pick', queue: [], i: 0, ans: [], est: 0, script: 's', pyUser: null, pyUsed: false, saveState: '', saved: false, stage: 1, name: opts.name || '' };
  function begin(mode) {
    st.mode = mode; st.rec = null; st.saveState = ''; st.ans = []; st.i = 0; st.stage = 1; st.phase = 'q';
    st.queue = mode === 'quick' ? plStage1(bank, rnd) : plBuildFull(bank, rnd);
    draw();
  }
  function total() { return st.mode === 'quick' ? 20 : st.queue.length; }
  function pyOn(lv) { return st.pyUser === null ? lv <= 2 : st.pyUser; }
  function tx(o, lv, big) {   // 中文：簡／繁，加上拼音
    if (o.e != null) return plEsc(o.e);
    var z = st.script === 't' ? o.t : o.s, h = plEsc(z);
    if (pyOn(lv) && o.p) { st.pyUsed = true; h += '<small>' + plEsc(plTidyPy(o.p)) + '</small>'; }
    return h;
  }
  function draw() {
    var h = '<div class="pl">';
    if (st.phase === 'pick') {
      h += '<div class="plc"><h2>' + PL_T.title + '</h2><div class="plm">' + PL_T.intro + '</div>' +
        '<button class="plb es" data-m="quick"><b>' + PL_T.quick + '</b><small>' + PL_T.quickD + '</small></button>' +
        '<button class="plb es" data-m="full"><b>' + PL_T.full + '</b><small>' + PL_T.fullD + '</small></button>' +
        (opts.needName ? '<div style="margin-top:8px"><div class="plm">' + PL_T.name + '</div><input id="plName" maxlength="40" value="' + plEsc(st.name) + '">' + (st.nameErr ? '<div class="plm" style="color:#b3402a;margin-top:4px">' + PL_T.nameReq + '</div>' : '') + '</div>' : '') +
        (opts.onExit ? '<button class="pld" id="plExit">' + PL_T.exit + '</button>' : '') + '</div>';
    } else if (st.phase === 'q') {
      var it = st.queue[st.i], lv = it.lv, n = st.ans.length + 1, p = it.p ? bank.pass[it.p] : null;
      var ckey = st.stage + ':' + st.i + ':' + st.ans.length;   // 同一題重畫（開關拼音）時選項順序不能變
      if (st.curKey !== ckey) { st.curKey = ckey; st.cur = plShuffle(it.o.map(function (o, k) { return { o: o, ok: k === 0 }; }), rnd); }
      var order = st.cur;
      h += '<div class="plrow"><span class="plm">' + PL_T.q + ' ' + n + ' ' + PL_T.of + ' ' + total() + '</span><span><button class="plsw' + (pyOn(lv) ? ' on' : '') + '" id="plPy">' + PL_T.py + '</button> <button class="plsw" id="plSc">' + PL_T.script + '</button></span></div>' +
        '<div class="plbar"><i style="width:' + Math.round((n - 1) / total() * 100) + '%"></i></div><div class="plc">';
      if (p) h += '<div class="plm" style="margin-bottom:6px">' + PL_T.read + '</div><div class="plpass">' + tx(p, lv) + '</div>' + '<div class="plq" style="font-size:18px">' + plEsc(it.q.e) + '</div>';
      else if (it.k === 'v') h += '<div class="plm">' + PL_T.meaning + '</div><div class="plq">' + tx(it.q, lv) + '</div>';
      else h += '<div class="plm">' + PL_T.pick + '</div><div class="plq">' + tx(it.q, lv) + '</div>';
      order.forEach(function (x, k) { h += '<button class="plb' + (x.o.e != null ? ' es' : '') + '" data-k="' + k + '">' + tx(x.o, lv) + '</button>'; });
      h += '<button class="pld" id="plDk">' + PL_T.dk + '</button></div></div>';
    } else {
      var r = plScore(st.ans), lvl = r.reached === 0 ? PL_T.below : r.cefr;
      var rows = Object.keys(r.by).sort().map(function (l) { var s = r.by[l], pc = Math.round(s.c / s.n * 100); return '<div class="plrow"><span>' + PL_CEFR[l - 1] + '</span><span class="plm">' + s.c + '/' + s.n + '</span></div><div class="plbar"><i style="width:' + pc + '%"></i></div>'; }).join('');
      h += '<div class="plc"><div class="plm">' + PL_T.doneH + '</div><div class="plbig">' + plEsc(lvl) + '</div>' +
        (r.reached ? '<div>' + PL_T.tocflL + ' ' + plEsc(r.tocfl) + '</div>' : '') +
        '<div class="plm" style="margin-top:6px">' + PL_T.right + ': ' + r.right + '/' + r.total + '</div></div>' +
        '<div class="plc"><b>' + PL_T.byLevel + '</b>' + rows + '</div><div class="plm" style="margin:8px 2px">' + PL_T.note + '</div><div class="plrow" style="justify-content:flex-start">';
      if (opts.onDone) h += '<div class="plm" style="width:100%;color:' + (st.saveState === 'err' ? '#b3402a' : 'inherit') + '">' + (st.saveState === 'ok' ? PL_T.saved : st.saveState === 'err' ? PL_T.saveErr : PL_T.saving) + '</div>' + (st.saveState === 'err' ? '<button class="plbtn" id="plRetry">' + PL_T.retry + '</button>' : '');
      h += '<button class="plbtn q" id="plAgain">' + PL_T.again + '</button>' + (opts.onExit ? '<button class="plbtn q" id="plExit">' + PL_T.exit + '</button>' : '') + '</div>' +
        '</div>';
    }
    root.innerHTML = h;
    bind();
  }
  function record() {
    var r = plScore(st.ans), by = {};
    Object.keys(r.by).forEach(function (l) { by[l] = { n: r.by[l].n, c: r.by[l].c }; });
    return { mode: st.mode, ts: Date.now(), reached: r.reached, cefr: r.cefr, tocfl: r.tocfl, right: r.right, total: r.total, by: by, py: !!st.pyUsed, name: st.name || '' };
  }
  function save() {
    if (!opts.onDone) return;
    st.saveState = 'busy'; draw();
    Promise.resolve(opts.onDone(st.rec)).then(function () { st.saveState = 'ok'; draw(); }, function () { st.saveState = 'err'; draw(); });
  }
  function advance(ok) {
    var it = st.queue[st.i];
    st.ans.push({ lv: it.lv, ok: ok, id: it.id });
    st.i++;
    if (st.i >= st.queue.length) {
      if (st.mode === 'quick' && st.stage === 1) {   // 第一階段結束：粗估，接著出第二階段
        st.est = plEstimate(st.ans); st.stage = 2; st.i = 0;
        st.queue = plStage2(bank, st.est, st.ans.map(function (a) { return a.id; }), rnd);
        if (!st.queue.length) { st.phase = 'done'; }
      } else st.phase = 'done';
    }
    if (st.phase === 'done' && !st.rec) { st.rec = record(); if (opts.onDone) { st.saveState = 'busy'; Promise.resolve(opts.onDone(st.rec)).then(function () { st.saveState = 'ok'; draw(); }, function () { st.saveState = 'err'; draw(); }); } }
    draw();
  }
  function bind() {
    var q = function (s) { return root.querySelector(s); };
    root.querySelectorAll('[data-m]').forEach(function (b) { b.onclick = function () { var nm = q('#plName'); if (nm) st.name = nm.value.trim(); if (opts.needName && !st.name) { st.nameErr = true; draw(); return; } st.nameErr = false; begin(b.getAttribute('data-m')); }; });
    root.querySelectorAll('[data-k]').forEach(function (b) { b.onclick = function () { advance(!!st.cur[+b.getAttribute('data-k')].ok); }; });
    var e;
    if ((e = q('#plDk'))) e.onclick = function () { advance(false); };
    if ((e = q('#plPy'))) e.onclick = function () { var it = st.queue[st.i]; st.pyUser = !pyOn(it.lv); draw(); };
    if ((e = q('#plSc'))) e.onclick = function () { st.script = st.script === 's' ? 't' : 's'; draw(); };
    if ((e = q('#plExit'))) e.onclick = function () { opts.onExit(); };
    if ((e = q('#plAgain'))) e.onclick = function () { st.saveState = ''; st.saved = false; st.rec = null; st.pyUsed = false; st.pyUser = null; if (opts.mode) begin(opts.mode); else { st.phase = 'pick'; draw(); } };
    if ((e = q('#plRetry'))) e.onclick = function () { save(); };
  }
  if (opts.mode) begin(opts.mode); else draw();
  return st;
}

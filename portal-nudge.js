/* =====================================================================
   彈跳視窗（學生頁）：練習題、激勵句、提醒。這個檔案只放「純函式」，不碰畫面，方便自動檢查。

   三種視窗：
     q   練習題：從學生收到的練習單裡，隨機抽「單字」或「語法點」，出 5 種題型（不用作答、不給答案）
     enc 激勵句：預設 20 句，後台可以改
     rem 提醒：有事才出現（作業沒交、明天有課、作業批改好了、課堂快用完、單堂付費）
   老師後台可以改的文字放在 portal/{老師}/config/nudge；沒設定就用這裡的預設。
===================================================================== */

var NUD_LANGS = ['es', 'tc', 'sc'];

/* ───────── 激勵句預設（{n} 已上堂數、{t} 學了多久；缺資料的句子自動跳過） ───────── */
var NUD_ENC = {
  tc: [
    '每天練習一點點，你的中文就會突飛猛進！',
    '繼續努力學習，你可以的！',
    '你已經跟 Ben 上了 {n} 堂課了，好棒！',
    '你已經學習中文 {t} 了，繼續保持！',
    '說錯沒關係，每個錯誤都會讓你進步一點。',
    '今天只要練一題，就是進步。',
    '開口說，比說得完美更重要！',
    '你昨天不會的，今天已經會了。',
    '學語言像種樹，每天澆一點水，慢慢就長大了。',
    '你比自己想的還要厲害喔！',
    '慢慢來，沒有人一天就學會中文。',
    '記得的字，都是你一次一次練出來的。',
    '今天也來複習一下吧，五分鐘就夠了！',
    '已經走了這麼遠，不要停下來喔。',
    '能把一句話說出口，就已經很勇敢了！',
    '每學會一個新字，你就多認識台灣一點。',
    '持續比快速更重要，你做得很好。',
    '今天的你，比昨天的你更會說中文了。',
    '不懂就問，發問也是學習的一部分！',
    '每一次開口，都是在為自己的中文打好基礎。'
  ],
  sc: [
    '每天练习一点点，你的中文就会突飞猛进！',
    '继续努力学习，你可以的！',
    '你已经跟 Ben 上了 {n} 堂课了，好棒！',
    '你已经学习中文 {t} 了，继续保持！',
    '说错没关系，每个错误都会让你进步一点。',
    '今天只要练一题，就是进步。',
    '开口说，比说得完美更重要！',
    '你昨天不会的，今天已经会了。',
    '学语言像种树，每天浇一点水，慢慢就长大了。',
    '你比自己想的还要厉害喔！',
    '慢慢来，没有人一天就学会中文。',
    '记得的字，都是你一次一次练出来的。',
    '今天也来复习一下吧，五分钟就够了！',
    '已经走了这么远，不要停下来喔。',
    '能把一句话说出口，就已经很勇敢了！',
    '每学会一个新字，你就多认识台湾一点。',
    '持续比快速更重要，你做得很好。',
    '今天的你，比昨天的你更会说中文了。',
    '不懂就问，发问也是学习的一部分！',
    '每一次开口，都是在为自己的中文打好基础。'
  ],
  es: [
    '¡Practica un poquito cada día y tu chino mejorará muchísimo!',
    '¡Sigue esforzándote, tú puedes!',
    '¡Ya llevas {n} clases con Ben, muy bien!',
    '¡Ya llevas {t} aprendiendo chino, sigue así!',
    'No pasa nada si te equivocas: cada error te hace avanzar un poco.',
    'Con practicar una sola pregunta hoy, ya avanzaste.',
    '¡Hablar es más importante que hablar perfecto!',
    'Lo que ayer no sabías, hoy ya lo sabes.',
    'Aprender un idioma es como plantar un árbol: con un poco de agua cada día, poco a poco crece.',
    '¡Eres mejor de lo que piensas!',
    'Con calma: nadie aprende chino en un día.',
    'Los caracteres que recuerdas los lograste practicando una y otra vez.',
    '¡Repasemos un poco hoy también, bastan cinco minutos!',
    'Ya has llegado muy lejos, ¡no te detengas!',
    '¡Decir una frase en voz alta ya es de valientes!',
    'Cada palabra nueva te acerca un poco más a Taiwán.',
    'Ser constante importa más que ser rápido. ¡Lo estás haciendo muy bien!',
    'El tú de hoy habla mejor chino que el tú de ayer.',
    'Si no entiendes, pregunta: preguntar también es aprender.',
    'Cada vez que hablas, estás construyendo la base de tu chino.'
  ]
};

/* ───────── 提醒文字預設（{n} 數量、{day} 今天／明天、{time} 時間） ───────── */
var NUD_REM = {
  hwTodo:    { tc: '你有 {n} 份作業還沒交，記得寫完傳上來喔！', sc: '你有 {n} 份作业还没交，记得写完传上来喔！', es: 'Tienes {n} tarea(s) sin entregar. ¡Recuerda completarla(s) y enviarla(s)!' },
  graded:    { tc: '你的作業批改好了，快去看看吧！', sc: '你的作业批改好了，快去看看吧！', es: '¡Tu tarea ya fue corregida, ve a verla!' },
  classSoon: { tc: '{day} {time} 有課，別忘了喔！', sc: '{day} {time} 有课，别忘了喔！', es: '¡{day} a las {time} tienes clase, no lo olvides!' },
  payLow:    { tc: '你的課堂只剩 {n} 堂了，記得提前續購喔！', sc: '你的课堂只剩 {n} 堂了，记得提前续购喔！', es: 'Te quedan solo {n} clase(s). ¡Recuerda renovar con tiempo!' },
  paySingle: { tc: '上課前記得提前付費唷！', sc: '上课前记得提前付费唷！', es: '¡Recuerda pagar antes de la clase!' }
};
var NUD_REM_KEYS = ['hwTodo', 'graded', 'classSoon', 'payLow', 'paySingle'];
var NUD_DAY = { today: { tc: '今天', sc: '今天', es: 'Hoy' }, tomorrow: { tc: '明天', sc: '明天', es: 'Mañana' } };

/* ───────── 題目樣板（{x} 是單字或語法點） ───────── */
var NUD_Q = {
  zhOf:     { tc: '「{x}」的中文怎麼說？', sc: '「{x}」的中文怎么说？', es: '¿Cómo se dice «{x}» en chino?' },
  meaning:  { tc: '「{x}」是什麼意思？', sc: '「{x}」是什么意思？', es: '¿Qué significa «{x}»?' },
  sentWord: { tc: '用「{x}」造一個句子吧！然後傳給 Ben！', sc: '用「{x}」造一个句子吧！然后传给 Ben！', es: '¡Haz una oración con «{x}» y mándasela a Ben!' },
  sentGram: { tc: '用「{x}」造一個句子吧！然後傳給 Ben！', sc: '用「{x}」造一个句子吧！然后传给 Ben！', es: '¡Haz una oración con «{x}» y mándasela a Ben!' },
  recall:   { tc: '你還記得「{x}」怎麼用嗎？', sc: '你还记得「{x}」怎么用吗？', es: '¿Recuerdas cómo se usa «{x}»?' }
};

function nudLang(l) { return l === 'es' || l === 'sc' ? l : 'tc'; }
function nudFill(tpl, vars) {
  return String(tpl).replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] != null ? vars[k] : m; });
}
function nudPick(list, rnd) {
  if (!list || !list.length) return null;
  var r = typeof rnd === 'function' ? rnd() : Math.random();
  return list[Math.min(list.length - 1, Math.floor(r * list.length))];
}

/* ───────── 題庫：從學生收到的練習單抽單字和語法點 ───────── */
/* 「媽媽 mamá · 做菜 cocinar」→ [{zh:'媽媽', es:'mamá'}, {zh:'做菜', es:'cocinar'}] */
function nudParseVocab(str) {
  var out = [];
  String(str || '').split(/[·•|\n；;]/).forEach(function (piece) {
    piece = piece.trim();
    if (!piece) return;
    var m = piece.match(/^([㐀-鿿豈-﫿～~…\s]+?)\s*([A-Za-zÀ-ÿ¿¡(].*)$/);
    if (m) out.push({ zh: m[1].replace(/\s+/g, ''), es: m[2].trim() });
    else if (/^[㐀-鿿豈-﫿～~…]+$/.test(piece)) out.push({ zh: piece, es: '' });
  });
  return out;
}
/* 「比較句 ＋ 得字補語」→ ['比較句', '得字補語'] */
function nudSplitPoints(str) {
  return String(str || '').split(/[＋+]/).map(function (s) { return s.trim(); }).filter(Boolean);
}
/* hwDocs：{ 作業id: 學生那份作業 } → { words:[{zh,es}], points:[文字] }（去重複） */
function nudBuildPool(hwDocs) {
  var words = [], points = [], seenW = {}, seenP = {};
  function addWord(w) { if (!w || !w.zh) return; var k = w.zh + '|' + (w.es || ''); if (!seenW[k]) { seenW[k] = 1; words.push(w); } }
  function addPoint(p) { if (p && !seenP[p]) { seenP[p] = 1; points.push(p); } }
  Object.keys(hwDocs || {}).forEach(function (id) {
    var d = hwDocs[id] || {};
    nudSplitPoints(d.grammar).forEach(addPoint);
    (Array.isArray(d.vocab) ? d.vocab : []).forEach(function (v) { addWord({ zh: String(v.zh || ''), es: String(v.es || '') }); });
    (d.sections || []).forEach(function (sec) {
      (sec.items || []).forEach(function (it) { if (it && it.vocab) nudParseVocab(it.vocab).forEach(addWord); });
    });
  });
  return { words: words, points: points };
}
/* 隨機出一題。回傳 { kind, text }；題庫是空的回傳 null。 */
function nudMakeQuestion(pool, lang, rnd) {
  lang = nudLang(lang);
  var kinds = [];
  var withEs = (pool.words || []).filter(function (w) { return w.es; });
  if (withEs.length) kinds.push('zhOf');
  if ((pool.words || []).length) { kinds.push('meaning'); kinds.push('sentWord'); }
  if ((pool.points || []).length) { kinds.push('sentGram'); kinds.push('recall'); }
  var kind = nudPick(kinds, rnd);
  if (!kind) return null;
  var x;
  if (kind === 'zhOf') x = nudPick(withEs, rnd).es;
  else if (kind === 'meaning' || kind === 'sentWord') x = nudPick(pool.words, rnd).zh;
  else x = nudPick(pool.points, rnd);
  return { kind: kind, text: nudFill(NUD_Q[kind][lang], { x: x }) };
}

/* ───────── 激勵句 ───────── */
/* 學了多久：開始日（YYYY-MM-DD）到今天 */
function nudSpan(sinceIso, todayIso, lang) {
  lang = nudLang(lang);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(sinceIso || '')) || !/^\d{4}-\d{2}-\d{2}$/.test(String(todayIso || ''))) return '';
  var a = sinceIso.split('-'), b = todayIso.split('-');
  var days = Math.round((Date.UTC(+b[0], +b[1] - 1, +b[2]) - Date.UTC(+a[0], +a[1] - 1, +a[2])) / 86400000);
  if (days < 1) return '';
  var months = (+b[0] - +a[0]) * 12 + (+b[1] - +a[1]) - (+b[2] < +a[2] ? 1 : 0);
  var y = Math.floor(months / 12), mo = months % 12;
  var zh = lang !== 'es';
  if (months < 1) return zh ? days + ' 天' : days + (days === 1 ? ' día' : ' días');
  if (y < 1) return zh ? months + ' 個月'.replace('個', lang === 'sc' ? '个' : '個') : months + (months === 1 ? ' mes' : ' meses');
  if (zh) return y + ' 年' + (mo ? ' ' + mo + (lang === 'sc' ? ' 个月' : ' 個月') : '');
  return y + (y === 1 ? ' año' : ' años') + (mo ? ' y ' + mo + (mo === 1 ? ' mes' : ' meses') : '');
}
/* 取出某語言的激勵句清單：後台有設定就用後台的（該語言沒有就退回繁體），沒有就用預設 */
function nudEncList(cfg, lang) {
  lang = nudLang(lang);
  var enc = cfg && cfg.enc;
  if (enc && Array.isArray(enc.tc) && enc.tc.length) {
    var base = enc.tc, mine = Array.isArray(enc[lang]) ? enc[lang] : [];
    var out = base.map(function (t, i) { return String(mine[i] || '').trim() || (lang === 'tc' ? t : String(t)); });
    return out.filter(function (s) { return s.trim(); });
  }
  return NUD_ENC[lang].slice();
}
/* vars：{ n, t, d }。有缺資料的句子（含沒填到的 { }）會被跳過。 */
function nudMakeEnc(cfg, lang, vars, rnd) {
  var ok = nudEncList(cfg, lang).filter(function (s) {
    var need = s.match(/\{(\w+)\}/g) || [];
    return need.every(function (k) { var v = vars && vars[k.slice(1, -1)]; return v != null && v !== '' && v !== 0; });
  });
  var s = nudPick(ok, rnd);
  return s ? { kind: 'enc', text: nudFill(s, vars) } : null;
}

/* ───────── 提醒 ─────────
   ctx：{ lang, hwDocs, seenGraded:{id:1}, pay:'package'|'single'|'', remaining, next:{dd, localStart}|null,
          now, payOn:true|false } */
function nudRemText(cfg, key, lang) {
  lang = nudLang(lang);
  var c = cfg && cfg.rem && cfg.rem[key], d = NUD_REM[key];
  var mine = c && typeof c[lang] === 'string' && c[lang].trim() ? c[lang] : (c && typeof c.tc === 'string' && c.tc.trim() && lang !== 'es' ? c.tc : '');
  return mine || d[lang];
}
function nudReminders(cfg, ctx) {
  var lang = nudLang(ctx.lang), out = [], docs = ctx.hwDocs || {}, now = ctx.now || Date.now();
  var late = 0, ready = 0;
  Object.keys(docs).forEach(function (id) {
    var d = docs[id] || {};
    if (d.status === 'todo' && d.assignedAt && now - d.assignedAt >= 3 * 86400000) late++;
    if (d.status === 'graded' && !(ctx.seenGraded && ctx.seenGraded[id])) ready++;
  });
  if (late) out.push({ kind: 'rem', key: 'hwTodo', text: nudFill(nudRemText(cfg, 'hwTodo', lang), { n: late }) });
  if (ready) out.push({ kind: 'rem', key: 'graded', text: nudRemText(cfg, 'graded', lang) });
  var nx = ctx.next;
  if (nx && nx.dd >= 0 && nx.dd <= 1 && nx.localStart) {
    out.push({ kind: 'rem', key: 'classSoon', text: nudFill(nudRemText(cfg, 'classSoon', lang), { day: NUD_DAY[nx.dd === 0 ? 'today' : 'tomorrow'][lang], time: nx.localStart }) });
  }
  if (ctx.payOn !== false) {
    if (ctx.pay === 'package' && ctx.remaining != null && ctx.remaining <= 2) {
      out.push({ kind: 'rem', key: 'payLow', text: nudFill(nudRemText(cfg, 'payLow', lang), { n: Math.max(0, ctx.remaining) }) });
    }
    if (ctx.pay === 'single' && nx && nx.dd >= 0 && nx.dd <= 1) {
      out.push({ kind: 'rem', key: 'paySingle', text: nudRemText(cfg, 'paySingle', lang) });
    }
  }
  return out;
}

/* ───────── 進頁面時：從可用的視窗種類裡隨機挑一種；每 5 分鐘：只出練習題 ───────── */
function nudOnEnter(opts, rnd) {
  /* opts：{ cfg, lang, pool, enc 的 vars, reminders[] } → 一個視窗或 null */
  var kinds = [];
  if (opts.pool && (opts.pool.words.length || opts.pool.points.length)) kinds.push('q');
  kinds.push('enc');
  if (opts.reminders && opts.reminders.length) kinds.push('rem');
  var k = nudPick(kinds, rnd);
  if (k === 'q') return nudMakeQuestion(opts.pool, opts.lang, rnd);
  if (k === 'rem') return nudPick(opts.reminders, rnd);
  return nudMakeEnc(opts.cfg, opts.lang, opts.vars, rnd);
}

/* =====================================================================
   Diario de chino · 作業共用程式（學生頁、老師後台都會載入；純計算，不碰網頁和 Firebase）

   做三件事：
   1. hwBuildStudent：把練習單產生器的練習單（含答案）轉成「學生版」——只有題目，沒有答案。
   2. hwAutoGrade：對學生交上來的答案做一鍵自動批改（選擇、填空、排序、配對、改錯）。
      西翻中、中翻西、造句沒辦法自動判斷，標成「要老師批改」。
   3. 配對題右欄的順序：跟練習單產生器用同一套算法打散，答案用「位置」記，不會洩漏。

   練習單格式（來自練習單產生器的 state）：
     sections: [{ id, type, enabled, bank:[], items:[{ id, enabled, ... }] }]
   學生答案格式：answers[題目id] =
     fill / fix / translate / zh2es / sentence：字串
     cloze：字串陣列（每個空一格）
     order：詞語陣列（照學生排的順序）
     choice：選項的原始編號（0 開始）
     match：右欄位置（0 開始）
===================================================================== */

var HW_TYPES = ['fill', 'cloze', 'order', 'choice', 'fix', 'translate', 'zh2es', 'match', 'sentence'];
var HW_AUTO = { fill: 1, cloze: 1, order: 1, choice: 1, fix: 1, match: 1 };     // 其餘（translate / zh2es / sentence）要老師批改

function hwNorm(s) {
  return String(s == null ? '' : s).replace(/[。！？，、；：「」『』（）,.!?;:'"()\s　]/g, '').toLowerCase();
}
function hwHash(s) { var h = 0; for (var i = 0; i < String(s).length; i++) { h = (h * 31 + String(s).charCodeAt(i)) | 0; } return h >>> 0; }
/* 配對題右欄順序：跟練習單產生器的 matchPerm 一模一樣。perm[k] = 右欄第 k 格放第幾題 */
function hwMatchPerm(items) {
  var idx = items.map(function (_, i) { return i; });
  idx.sort(function (a, b) { return hwHash(items[a].id + 'm') - hwHash(items[b].id + 'm'); });
  if (idx.length > 1 && idx.every(function (v, i) { return v === i; })) idx.push(idx.shift());
  return idx;
}
function hwActiveItems(sec) { return (sec.items || []).filter(function (i) { return i.enabled !== false; }); }
function hwActiveSections(state) {
  return ((state && state.sections) || []).filter(function (s) { return s.enabled !== false && hwActiveItems(s).length; });
}
/* 一題的分數：段落填空每個空 1 分，其他每題 1 分 */
function hwItemMax(type, it) { return type === 'cloze' ? (it.answers || []).length : 1; }
function hwTotal(state) {
  var t = 0;
  hwActiveSections(state).forEach(function (s) { hwActiveItems(s).forEach(function (it) { t += hwItemMax(s.type, it); }); });
  return t;
}

/* ───────── 學生版（沒有答案） ───────── */
function hwBuildStudent(state) {
  var cue = !(state.opts && state.opts.cueEs === false);
  var sections = hwActiveSections(state).map(function (sec) {
    var items = hwActiveItems(sec);
    var out = { id: sec.id, type: sec.type, bank: (sec.bank || []).slice(), items: [] };
    items.forEach(function (it) {
      var q = { id: it.id };
      switch (sec.type) {
        case 'fill': q.zh = it.zh; if (cue && it.es) q.es = it.es; break;
        case 'cloze': q.text = it.text; q.n = (it.answers || []).length; break;
        case 'order': q.tokens = (it.tokens || []).slice(); if (cue && it.es) q.es = it.es; break;
        case 'choice':
          if (cue && it.es) q.es = it.es;
          q.options = (it.options || []).map(function (t, i) { return { i: i, t: t }; }).filter(function (o) { return o.t; });
          break;
        case 'fix': q.wrong = it.wrong; break;
        case 'translate': q.es = it.es; if (it.vocab) q.vocab = it.vocab; break;
        case 'zh2es': q.zh = it.zh; if (it.vocab) q.vocab = it.vocab; break;
        case 'match': q.zh = it.zh; break;
        case 'sentence': q.cue = it.cue; if (it.es) q.es = it.es; break;
      }
      out.items.push(q);
    });
    if (sec.type === 'match') out.rights = hwMatchPerm(items).map(function (i) { return items[i].es; });   // 右欄只放西文，順序已打散
    return out;
  });
  return { title: state.meta && (state.meta.title || state.meta.grammar) || '', grammar: (state.meta && state.meta.grammar) || '', sections: sections, total: hwTotal(state) };
}

/* ───────── 自動批改 ─────────
   回傳 { items: { 題目id: { max, got, auto, ok, blanks? } }, max, got, autoMax, autoGot, manual }
   auto=false 的題目 got 是 null，等老師批改（算進 manual 題數，不算進 got）。 */
function hwAutoGrade(state, answers) {
  answers = answers || {};
  var res = { items: {}, max: 0, got: 0, autoMax: 0, autoGot: 0, manual: 0 };
  hwActiveSections(state).forEach(function (sec) {
    var items = hwActiveItems(sec);
    var perm = sec.type === 'match' ? hwMatchPerm(items) : null;
    items.forEach(function (it, r) {
      var a = answers[it.id], max = hwItemMax(sec.type, it), r1 = { max: max, got: null, auto: !!HW_AUTO[sec.type], ok: null };
      if (r1.auto) {
        switch (sec.type) {
          case 'fill': r1.got = hwNorm(a) !== '' && hwNorm(a) === hwNorm(it.answer) ? 1 : 0; break;
          case 'cloze':
            r1.blanks = (it.answers || []).map(function (ans, k) { return Array.isArray(a) && hwNorm(a[k]) !== '' && hwNorm(a[k]) === hwNorm(ans); });
            r1.got = r1.blanks.filter(Boolean).length; break;
          case 'order': r1.got = Array.isArray(a) && a.length && hwNorm(a.join('')) === hwNorm(it.answer) ? 1 : 0; break;
          case 'choice': r1.got = typeof a === 'number' && a === it.answer ? 1 : 0; break;
          case 'fix': r1.got = hwNorm(a) !== '' && hwNorm(a) === hwNorm(it.correct) ? 1 : 0; break;
          case 'match': r1.got = typeof a === 'number' && perm[a] === r ? 1 : 0; break;
        }
        r1.ok = r1.got === max;
        res.autoMax += max; res.autoGot += r1.got;
      } else { res.manual++; }
      res.max += max;
      res.items[it.id] = r1;
    });
  });
  res.got = res.autoGot;
  return res;
}


/* ───────── 批改：標準答案的文字、老師標記的安全過濾、批改結果 ───────── */
function hwLetter(i) { return String.fromCharCode(65 + i); }
/* 一題的標準答案（給學生看；批改完成時才寫進學生的資料） */
function hwKeyText(type, it, sec, items) {
  switch (type) {
    case 'fill': case 'order': case 'translate': case 'zh2es': case 'sentence': return String(it.answer || '');
    case 'cloze': return (it.answers || []).join('、');
    case 'choice': { var o = (it.options || [])[it.answer]; return typeof it.answer === 'number' ? hwLetter(it.answer) + (o ? '　' + o : '') : ''; }
    case 'fix': return String(it.correct || '');
    case 'match': return String(it.es || '');
  }
  return '';
}
/* 老師的標記只留這幾種：粗體、底線、刪除線、背景色、換行。其他全部拿掉。 */
function hwCleanMark(html) {
  var box = document.createElement('div'); box.innerHTML = String(html || '');
  var OK = { B: 1, STRONG: 1, U: 1, S: 1, STRIKE: 1, DEL: 1, BR: 1, DIV: 1, P: 1, SPAN: 1, FONT: 1, MARK: 1 };
  var COLORS = /^(#[0-9a-f]{3,8}|rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)|rgba\([^)]*\)|[a-z]+)$/i;
  function walk(node) {
    Array.prototype.slice.call(node.childNodes).forEach(function (c) {
      if (c.nodeType === 3) return;
      if (c.nodeType !== 1 || !OK[c.tagName]) { if (c.nodeType === 1 && !OK[c.tagName]) { walk(c); while (c.firstChild) node.insertBefore(c.firstChild, c); } node.removeChild(c); return; }
      var bg = '', fw = '', td = '';
      if (c.style) { bg = c.style.backgroundColor || ''; fw = c.style.fontWeight || ''; td = c.style.textDecorationLine || c.style.textDecoration || ''; }
      var tag = c.tagName, color = c.getAttribute('color');
      while (c.attributes.length) c.removeAttribute(c.attributes[0].name);
      var st = '';
      if (bg && COLORS.test(bg)) st += 'background-color:' + bg + ';';
      if (fw === 'bold' || +fw >= 600) st += 'font-weight:700;';
      if (/underline/.test(td)) st += 'text-decoration-line:underline;';
      if (/line-through/.test(td)) st += (/underline/.test(td) ? '' : 'text-decoration-line:line-through;');
      if (st) c.setAttribute('style', st);
      walk(c);
    });
  }
  walk(box);
  return box.innerHTML;
}
/* 批改結果：reviewItems = { 題目id: { got, max, ... } }，算總分 */
function hwSumReview(items) {
  var got = 0, max = 0;
  Object.keys(items).forEach(function (k) { max += items[k].max || 0; got += items[k].got || 0; });
  return { got: Math.round(got * 2) / 2, max: max };
}

/* ───────── 發給學生的那一份（存進學生自己的資料夾） ───────── */
function hwAssignDoc(wid, state, now) {
  var s = hwBuildStudent(state);
  return { v: 1, wid: wid, title: s.title, grammar: s.grammar, sections: s.sections, total: s.total, assignedAt: now, status: 'todo', answers: {} };
}

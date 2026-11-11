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

/* ───────── Word（.docx）：下載空白作業、讀回學生上傳的檔案 ─────────
   下載：用 JSZip 手工組出最簡單的 .docx（標題、題目、空格），不依賴別的套件。
   labels：{ name, date, typeName:{fill:'…',…}, matchNote }  由頁面依學生語言給 */
function hwXml(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function hwP(text, o) {
  o = o || {};
  var rpr = '<w:rFonts w:ascii="Calibri" w:eastAsia="PMingLiU" w:hAnsi="Calibri"/>' + (o.bold ? '<w:b/>' : '') + (o.color ? '<w:color w:val="' + o.color + '"/>' : '') + '<w:sz w:val="' + (o.size || 24) + '"/>';
  var ppr = '<w:spacing w:before="' + (o.before || 0) + '" w:after="' + (o.after == null ? 80 : o.after) + '"/>' + (o.shade ? '<w:shd w:val="clear" w:color="auto" w:fill="' + o.shade + '"/>' : '');
  return '<w:p><w:pPr>' + ppr + '</w:pPr><w:r><w:rPr>' + rpr + '</w:rPr><w:t xml:space="preserve">' + hwXml(text) + '</w:t></w:r></w:p>';
}
function hwBuildDocx(d, labels) {
  var NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'], L = labels || {}, tn = L.typeName || {}, body = '';
  var line = '＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿';
  body += hwP(d.title || '', { bold: true, size: 36, after: 120 });
  body += hwP((L.name || 'Nombre') + '：' + line.slice(0, 10) + '    ' + (L.date || 'Fecha') + '：' + line.slice(0, 6), { color: '777777', after: 200 });
  (d.sections || []).forEach(function (sec, si) {
    body += hwP((NUM[si] || (si + 1)) + '、' + (tn[sec.type] || sec.type), { bold: true, size: 28, before: 240, after: 120 });
    if (sec.bank && sec.bank.length && (sec.type === 'fill' || sec.type === 'cloze')) body += hwP(sec.bank.join('　'), { shade: 'F0ECE1', after: 120 });
    if (sec.type === 'match') {
      body += hwP((L.matchNote || ''), { color: '777777', size: 20 });
      sec.rights.forEach(function (r, k) { body += hwP(hwLetter(k) + '　' + r, { after: 40 }); });
    }
    sec.items.forEach(function (q, qi) {
      var n = (qi + 1) + '. ';
      switch (sec.type) {
        case 'fill': body += hwP(n + String(q.zh || '').replace('__', '（　　　）') + (q.es ? '    ' + q.es : '')); break;
        case 'cloze': body += hwP(n + String(q.text || '').replace(/\{(\d+)\}/g, '（$1　　）')); break;
        case 'order': body += hwP(n + (q.tokens || []).join(' ／ ') + (q.es ? '    ' + q.es : '')); body += hwP('→ ' + line, { color: '999999' }); break;
        case 'choice':
          body += hwP(n + (q.es || ''));
          (q.options || []).forEach(function (o) { body += hwP('　　' + hwLetter(o.i) + '　' + o.t, { after: 20 }); });
          body += hwP('→ ' + (L.pick || 'A / B / C'), { color: '999999' }); break;
        case 'fix': body += hwP(n + q.wrong); body += hwP('→ ' + line, { color: '999999' }); break;
        case 'translate': body += hwP(n + q.es + (q.vocab ? '  (' + q.vocab + ')' : '')); body += hwP('→ ' + line, { color: '999999' }); break;
        case 'zh2es': body += hwP(n + q.zh + (q.vocab ? '  (' + q.vocab + ')' : '')); body += hwP('→ ' + line, { color: '999999' }); break;
        case 'match': body += hwP(n + q.zh + '　→　' + (L.letter || 'A/B/C'), {}); break;
        case 'sentence': body += hwP(n + q.cue + (q.es ? '    ' + q.es : '')); body += hwP('→ ' + line, { color: '999999' }); break;
      }
    });
  });
  var doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + body + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>';
  var zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', doc);
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
var HW_FILE_MAX = 600 * 1024;   // 一個 Word 檔最大 600KB（轉成文字存放後要小於 Firestore 單筆 1MB）
function hwDownloadBlob(blob, name) {
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
function hwBlobToB64(blob) {
  return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(String(r.result).split(',')[1] || ''); }; r.onerror = rej; r.readAsDataURL(blob); });
}
function hwB64ToBlob(b64, type) {
  var bin = atob(b64), n = bin.length, u = new Uint8Array(n); for (var i = 0; i < n; i++) u[i] = bin.charCodeAt(i);
  return new Blob([u], { type: type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
/* 標準答案整理成一行一題，批改 Word 時寫給學生看 */
function hwKeyLines(state) {
  var out = [];
  hwActiveSections(state).forEach(function (sec, si) {
    var items = hwActiveItems(sec);
    items.forEach(function (it, qi) { out.push({ sec: si, no: qi + 1, type: sec.type, key: hwKeyText(sec.type, it) }); });
  });
  return out;
}

/* ───────── 發給學生的那一份（存進學生自己的資料夾） ───────── */
function hwAssignDoc(wid, state, now) {
  var s = hwBuildStudent(state);
  return { v: 1, wid: wid, title: s.title, grammar: s.grammar, sections: s.sections, total: s.total, assignedAt: now, status: 'todo', answers: {} };
}

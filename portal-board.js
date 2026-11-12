/* =====================================================================
   Diario de chino · 「公布欄／留言板／私訊」與「有新內容」紅點的共用程式
   純計算，不碰網頁和 Firebase；tests/run.js 會單獨測。學生頁和老師後台都會載入。

   資料（都在 portal/{老師uid}/ 底下）：
   - board/{id}   公布欄：{ text, ts }                老師寫、所有學生讀
   - wall/{id}    公開留言：{ sid, name, text, ts }    學生寫（只能用自己的名字）、所有學生讀
   - dm/{id}      私訊：{ sid, from:'s'|'t', text, ts }  只有老師和那位學生讀；學生寫 's'、老師寫 't'
   - members/{電子郵件} 學生名單鏡像：{ sid, name }     老師寫；規則用它判斷「是不是老師的學生」
===================================================================== */

var BOARD_MAX = 500;

var BOARD_I18N = {
  es: {
    bTitle: 'Tablón y mensajes', bBtn: 'Abrir', bBack: '‹ Volver',
    tBoard: 'Avisos', tWall: 'Mensajes', tDm: 'Para el profesor',
    boardEmpty: 'Todavía no hay avisos.', wallEmpty: 'Todavía no hay mensajes. ¡Sé el primero!', dmEmpty: 'Aquí puedes escribirle al profesor. Solo tú y el profesor verán estos mensajes.',
    wallHint: 'Todos los alumnos pueden ver lo que escribas aquí.', dmHint: 'Solo tú y el profesor ven estos mensajes.',
    wallPh: 'Escribe un mensaje…', dmPh: 'Escribe un mensaje para el profesor…', send: 'Enviar', del: 'Borrar', teacher: 'Profesor',
    sending: 'Enviando…', sendErr: 'No se pudo enviar. Inténtalo de nuevo.', tooLong: 'Máximo {n} caracteres.', confirmDel: '¿Borrar este mensaje?'
  },
  tc: {
    bTitle: '公布欄與留言', bBtn: '打開', bBack: '‹ 返回',
    tBoard: '公布欄', tWall: '留言板', tDm: '給老師',
    boardEmpty: '還沒有公布事項。', wallEmpty: '還沒有留言，來寫第一則吧！', dmEmpty: '想跟老師說的話可以寫在這裡，只有你和老師看得到。',
    wallHint: '這裡寫的字，所有同學都看得到。', dmHint: '只有你和老師看得到。',
    wallPh: '寫點什麼…', dmPh: '想跟老師說…', send: '送出', del: '刪除', teacher: '老師',
    sending: '送出中…', sendErr: '送出失敗，請再試一次。', tooLong: '最多 {n} 個字。', confirmDel: '要刪除這則留言嗎？'
  },
  sc: {
    bTitle: '公布栏与留言', bBtn: '打开', bBack: '‹ 返回',
    tBoard: '公布栏', tWall: '留言板', tDm: '给老师',
    boardEmpty: '还没有公布事项。', wallEmpty: '还没有留言，来写第一则吧！', dmEmpty: '想跟老师说的话可以写在这里，只有你和老师看得到。',
    wallHint: '这里写的字，所有同学都看得到。', dmHint: '只有你和老师看得到。',
    wallPh: '写点什么…', dmPh: '想跟老师说…', send: '送出', del: '删除', teacher: '老师',
    sending: '送出中…', sendErr: '送出失败，请再试一次。', tooLong: '最多 {n} 个字。', confirmDel: '要删除这则留言吗？'
  }
};
function boardT(lang, key, p) {
  var l = lang === 'es' || lang === 'sc' ? lang : 'tc';
  var s = BOARD_I18N[l][key];
  if (s == null) s = BOARD_I18N.tc[key];
  if (typeof s !== 'string') return s;
  return s.replace(/\{(\w+)\}/g, function (m, k) { return p && p[k] != null ? p[k] : m; });
}

/* 輸入整理：去掉前後空白、統一換行、連續空行最多一行；空的回傳 ''；超過上限回傳 null（呼叫的人要提示太長） */
function boardClean(txt) {
  var s = String(txt == null ? '' : txt).replace(/\r\n?/g, '\n').replace(/[ \t　]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return s.length > BOARD_MAX ? null : s;
}

/* 一批文件 → 新的在前（時間一樣用代號排，結果固定）。每筆補上 id */
function boardSortDesc(list) {
  return (Array.isArray(list) ? list : []).filter(function (x) { return x && typeof x.text === 'string' && x.text; })
    .slice().sort(function (a, b) { return (+b.ts || 0) - (+a.ts || 0) || (String(a.id) < String(b.id) ? -1 : 1); });
}
/* 私訊：舊的在前（像對話）。只收這位學生的 */
function dmThread(msgs, sid) {
  return (Array.isArray(msgs) ? msgs : []).filter(function (m) { return m && m.sid === sid && (m.from === 's' || m.from === 't') && typeof m.text === 'string' && m.text; })
    .slice().sort(function (a, b) { return (+a.ts || 0) - (+b.ts || 0) || (String(a.id) < String(b.id) ? -1 : 1); });
}
function boardMaxTs(list, pred) {
  var m = 0;
  (list || []).forEach(function (x) { if (x && (!pred || pred(x)) && (+x.ts || 0) > m) m = +x.ts; });
  return m;
}

/* 老師後台：每位學生的未讀私訊數。msgs：全部私訊；seen：{ 學生代號: 老師看到哪個時間 } */
function dmUnreadBySid(msgs, seen) {
  var out = {};
  (msgs || []).forEach(function (m) {
    if (!m || m.from !== 's' || !m.sid) return;
    if ((+m.ts || 0) > ((seen && +seen[m.sid]) || 0)) out[m.sid] = (out[m.sid] || 0) + 1;
  });
  return out;
}

/* 紅點：sigs 是每個項目「現在的內容特徵」（資料還沒載入好就給 null）；seen 是學生看過時記下的特徵。
   第一次（沒記錄）不亮，直接記下現在的；之後特徵變了就亮，看過之後呼叫的人把特徵存回 seen。
   回傳 { dot:{項目:true/false}, seed:{第一次要記下的} } */
function newDots(seen, sigs) {
  var dot = {}, seed = {};
  Object.keys(sigs || {}).forEach(function (k) {
    var s = sigs[k];
    if (s === null || s === undefined) { dot[k] = false; return; }
    if (!seen || seen[k] === undefined) { seed[k] = String(s); dot[k] = false; return; }
    dot[k] = String(s) !== String(seen[k]);
  });
  return { dot: dot, seed: seed };
}

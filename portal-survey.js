/* =====================================================================
   Diario de chino · 「問卷調查」的共用程式
   純計算，不碰網頁和 Firebase；tests/run.js 會單獨測。學生頁和學生日誌管理後台都會載入。

   資料（都在 portal/{老師uid}/ 底下）：
   - surveys/{問卷代號}              老師的問卷（題目樣板）：{ title, questions:[題目], createdAt, updatedAt }   只有老師讀寫
   - svRounds/{發布代號}             一次發布：{ surveyId, title, qs:[題目＋固定最後一題], zh:'tc'|'sc', fl:'es'|'en', sids:[學生代號], createdAt }   只有老師
   - students/{sid}/sv/{發布代號}    發給某位學生的那一份：{ rid, title, qs, zh, fl, status:'todo'|'submitted', answers, assignedAt, submittedAt }
                                     學生讀自己的；只能改 answers／status／submittedAt（做法同作業 hw）

   題目：{ id, t:'text'|'single'|'multi'|'scale', zh, es, en, opts:[{ id, zh, es, en }] }
   固定最後一題「是否同意使用問卷內容」：id 固定 'consent'，t:'consent'，選項 y／n，不能刪、不能移動。
   答案 answers：{ 題目id: 文字 | 選項id | [選項id…] }
===================================================================== */

var SV_TEXT_MAX = 2000;      // 開放題每題最多字數
var SV_TITLE_MAX = 60;
var SV_Q_MAX = 60;           // 一份問卷最多幾題
var SV_TYPES = ['text', 'single', 'multi', 'scale'];
var SV_NAME_MAX = 60;        // 公開連結：填寫者的名字最多幾個字

var SV_I18N = {
  es: {
    svTitle: 'Encuestas', svStart: 'Responder', svView: 'Ver', svBack: 'Volver', svSubmit: 'Enviar encuesta',
    svStTodo: 'Pendiente', svStDone: 'Enviada', svPosted: 'Publicada', svLocked: 'Ya enviaste esta encuesta. ¡Gracias!',
    svConfirm: '¿Enviar la encuesta? Después ya no podrás cambiar las respuestas.', svYes: 'Sí, enviar', svNo: 'Todavía no',
    svSaving: 'Guardando…', svSaved: 'Guardado', svSaveErr: 'No se pudo guardar. Inténtalo de nuevo.',
    svPreviewRO: 'Vista previa: solo lectura.', svOptional: '(opcional)', svRequiredMsg: 'Falta contestar: {n}',
    svType: 'Escribe tu respuesta…', svPick: 'Elige una', svPickMany: 'Puedes elegir varias', svYesOpt: 'Sí, estoy de acuerdo', svNoOpt: 'No'
  },
  en: {
    svTitle: 'Surveys', svStart: 'Start', svView: 'View', svBack: 'Back', svSubmit: 'Submit survey',
    svStTodo: 'To do', svStDone: 'Submitted', svPosted: 'Posted', svLocked: 'You have already submitted this survey. Thank you!',
    svConfirm: 'Submit the survey? You will not be able to change your answers afterwards.', svYes: 'Yes, submit', svNo: 'Not yet',
    svSaving: 'Saving…', svSaved: 'Saved', svSaveErr: 'Could not save. Please try again.',
    svPreviewRO: 'Preview: read only.', svOptional: '(optional)', svRequiredMsg: 'Unanswered: {n}',
    svType: 'Type your answer…', svPick: 'Choose one', svPickMany: 'You can choose more than one', svYesOpt: 'Yes, I agree', svNoOpt: 'No'
  },
  tc: {
    svTitle: '問卷調查', svStart: '開始填寫', svView: '查看', svBack: '返回', svSubmit: '交出問卷',
    svStTodo: '還沒填', svStDone: '已交出', svPosted: '發布', svLocked: '這份問卷你已經交出了，謝謝你！',
    svConfirm: '要交出問卷嗎？交出後就不能再改答案。', svYes: '是，交出', svNo: '還沒',
    svSaving: '儲存中…', svSaved: '已儲存', svSaveErr: '儲存失敗，請再試一次。',
    svPreviewRO: '預覽：只能看，不能填。', svOptional: '（選填）', svRequiredMsg: '還有 {n} 題沒回答',
    svType: '請寫下你的回答…', svPick: '請選一個', svPickMany: '可以複選', svYesOpt: '同意', svNoOpt: '不同意'
  },
  sc: {
    svTitle: '问卷调查', svStart: '开始填写', svView: '查看', svBack: '返回', svSubmit: '交出问卷',
    svStTodo: '还没填', svStDone: '已交出', svPosted: '发布', svLocked: '这份问卷你已经交出了，谢谢你！',
    svConfirm: '要交出问卷吗？交出后就不能再改答案。', svYes: '是，交出', svNo: '还没',
    svSaving: '储存中…', svSaved: '已储存', svSaveErr: '储存失败，请再试一次。',
    svPreviewRO: '预览：只能看，不能填。', svOptional: '（选填）', svRequiredMsg: '还有 {n} 题没回答',
    svType: '请写下你的回答…', svPick: '请选一个', svPickMany: '可以复选', svYesOpt: '同意', svNoOpt: '不同意'
  }
};
/* 公開連結頁（survey.html）用的字 */
(function () {
  var add = {
    es: { svName: 'Tu nombre', svNamePh: 'Escribe tu nombre', svNameReq: 'Escribe tu nombre antes de enviar.', svDone: '¡Gracias! Tu respuesta ya fue enviada.', svClosed: 'Esta encuesta ya está cerrada.', svNotFound: 'No se encontró la encuesta. Pide a tu profesor el enlace correcto.', svSendErr: 'No se pudo enviar. Revisa tu conexión e inténtalo de nuevo.', svDraftKept: 'Tus respuestas se guardan en este dispositivo mientras escribes.' },
    en: { svName: 'Your name', svNamePh: 'Type your name', svNameReq: 'Please type your name before submitting.', svDone: 'Thank you! Your answers have been sent.', svClosed: 'This survey is closed.', svNotFound: 'Survey not found. Ask your teacher for the correct link.', svSendErr: 'Could not send. Check your connection and try again.', svDraftKept: 'Your answers are kept on this device while you write.' },
    tc: { svName: '你的名字', svNamePh: '請寫下你的名字', svNameReq: '請先寫下你的名字再交出。', svDone: '謝謝你！你的回答已經送出。', svClosed: '這份問卷已經關閉了。', svNotFound: '找不到這份問卷，請向老師要正確的連結。', svSendErr: '送出失敗，請檢查網路後再試一次。', svDraftKept: '你填寫時，答案會暫存在這個裝置上。' },
    sc: { svName: '你的名字', svNamePh: '请写下你的名字', svNameReq: '请先写下你的名字再交出。', svDone: '谢谢你！你的回答已经送出。', svClosed: '这份问卷已经关闭了。', svNotFound: '找不到这份问卷，请向老师要正确的链接。', svSendErr: '送出失败，请检查网络后再试一次。', svDraftKept: '你填写时，答案会暂存在这个装置上。' }
  };
  Object.keys(add).forEach(function (l) { Object.keys(add[l]).forEach(function (k) { SV_I18N[l][k] = add[l][k]; }); });
})();
function svT(lang, key, p) {
  var l = lang === 'es' || lang === 'en' || lang === 'sc' ? lang : 'tc';
  var s = SV_I18N[l][key];
  if (s == null) s = SV_I18N.tc[key];
  if (typeof s !== 'string') return s;
  return s.replace(/\{(\w+)\}/g, function (m, k) { return p && p[k] != null ? p[k] : m; });
}

/* 固定最後一題：是否同意使用問卷內容（三種語言都在這裡，老師不用管） */
function svConsentQ() {
  return {
    id: 'consent', t: 'consent',
    zh: '是否同意我使用問卷內容？', es: '¿Estás de acuerdo con que utilice el contenido de esta encuesta?', en: 'Do you agree to let me use the content of this survey?',
    opts: [
      { id: 'y', zh: '同意', es: 'Sí, estoy de acuerdo', en: 'Yes, I agree' },
      { id: 'n', zh: '不同意', es: 'No', en: 'No' }
    ]
  };
}

/* 常用選項組 */
function svScaleOpts(kind) {
  var sets = {
    good: [['很好', 'Muy bien', 'Very good'], ['好', 'Bien', 'Good'], ['普通', 'Normal', 'Average'], ['不太好', 'No muy bien', 'Not very good'], ['不好', 'Mal', 'Poor']],
    easy: [['很容易', 'Muy fácil', 'Very easy'], ['容易', 'Fácil', 'Easy'], ['普通', 'Normal', 'Average'], ['有點難', 'Un poco difícil', 'A bit difficult'], ['很難', 'Muy difícil', 'Very difficult']]
  };
  return (sets[kind] || sets.good).map(function (r, i) { return { id: 'o' + (i + 1), zh: r[0], es: r[1], en: r[2] }; });
}
function svOpts(rows) { return rows.map(function (r, i) { return { id: 'o' + (i + 1), zh: r[0], es: r[1], en: r[2] }; }); }

/* 基本模板：最新版滿意度調查（開放回答版）＋學生日誌使用的問題。老師在後台可以隨便改。 */
function svTemplate() {
  var n = 0;
  function q(t, zh, es, en, opts) { n++; var o = { id: 'q' + n, t: t, zh: zh, es: es, en: en }; if (opts) o.opts = opts; return o; }
  return {
    title: '課程滿意度調查',
    questions: [
      q('text', '你覺得課程內容的實用性如何？有哪些特別對你有幫助的地方？', '¿Qué opinas sobre la utilidad del contenido del curso? ¿Hay algo en particular que te haya sido de gran ayuda?', 'What do you think about the usefulness of the course content? Is there anything that has been especially helpful to you?'),
      q('single', '你覺得課程的節奏如何？', '¿Qué opinas sobre el ritmo del curso?', 'What do you think about the pace of the course?', svOpts([['太快', 'Demasiado rápido', 'Too fast'], ['剛剛好', 'Justo', 'Just right'], ['太慢', 'Demasiado lento', 'Too slow']])),
      q('single', '你覺得上課內容的難度如何？', '¿Qué opinas sobre la dificultad del contenido del curso?', 'What do you think about the difficulty level of the course content?', svOpts([['太簡單', 'Demasiado fácil', 'Too easy'], ['剛剛好', 'Adecuado', 'Just right'], ['太難', 'Demasiado difícil', 'Too difficult']])),
      q('text', '你覺得你的中文能力有哪些具體的進步？', '¿Qué avances concretos crees que has logrado en tus habilidades de chino?', 'What specific improvements do you think you have made in your Chinese?'),
      q('text', '你對老師的教學態度有什麼感受？', '¿Qué opinas sobre la actitud del profesor al enseñar?', 'What do you think about the teacher’s attitude toward teaching?'),
      q('text', '你覺得老師在講解課程內容時，表達是否清晰易懂？需要改進的地方會是哪些？', '¿Consideras que el profesor explica el contenido del curso de manera clara y comprensible? ¿Qué aspectos crees que podrían mejorarse?', 'Do you think the teacher explains the course content clearly? What could be improved?'),
      q('text', '當你在課堂上提出問題時，老師的回應是否解答了你的疑惑？', 'Cuando haces preguntas en clase, ¿las respuestas del profesor aclaran tus dudas?', 'When you ask questions in class, do the teacher’s answers clear up your doubts?'),
      q('text', '你覺得這個課程的優點是什麼？', '¿Cuáles son las ventajas de este curso, según tu opinión?', 'In your opinion, what are the advantages of this course?'),
      q('text', '你覺得老師的教學方式或課程內容，可以在哪些部分做得更好？', '¿Qué aspectos del método de enseñanza o del contenido del curso crees que podrían mejorarse?', 'In what ways could the teaching method or the course content be improved?'),
      q('text', '接下來這一年，你的中文學習目標是什麼？', '¿Cuáles son tus objetivos de aprendizaje de chino para el próximo año?', 'What are your Chinese learning goals for the coming year?'),
      q('scale', '整體來說，你覺得學生日誌好用嗎？', 'En general, ¿te parece útil el Diario de chino?', 'Overall, do you find the student diary (Diario de chino) useful?', svScaleOpts('good')),
      q('multi', '你最常使用學生日誌的哪些功能？', '¿Qué funciones del Diario de chino usas más?', 'Which features of the student diary do you use most?', svOpts([
        ['下一堂課與行事曆', 'Próxima clase y calendario', 'Next class and calendar'], ['作業', 'Tareas', 'Homework'], ['上課紀錄與單字複習', 'Registro de clases y repaso de vocabulario', 'Class log and vocabulary review'],
        ['能力分級測驗', 'Prueba de nivel', 'Level placement test'], ['公布欄、留言板、私訊老師', 'Tablón, mensajes y mensajes al profesor', 'Board, messages and messages to the teacher'], ['都很少用', 'Casi no los uso', 'I hardly use them']])),
      q('scale', '學生日誌的操作容易嗎？', '¿Es fácil usar el Diario de chino?', 'Is the student diary easy to use?', svScaleOpts('easy')),
      q('single', '頁面上的「台灣時間」和「你的當地時間」清楚嗎？', '¿Se entiende bien la “Hora de Taiwán” y “Tu hora” en la página?', 'Are “Taiwan time” and “Your time” clear on the page?', svOpts([['很清楚', 'Muy claro', 'Very clear'], ['還可以', 'Más o menos', 'Fairly clear'], ['不太清楚', 'No muy claro', 'Not clear']])),
      q('text', '使用學生日誌時，你有遇到什麼問題或錯誤嗎？', '¿Has tenido algún problema o error al usar el Diario de chino?', 'Have you run into any problems or errors while using the student diary?'),
      q('text', '你希望學生日誌增加什麼功能？', '¿Qué funciones te gustaría que tuviera el Diario de chino?', 'What features would you like the student diary to have?')
    ]
  };
}

var _svSeq = 0;
function svNewId(prefix) { _svSeq++; return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + _svSeq; }
function svBlankQ(t) {
  var q = { id: svNewId('q'), t: SV_TYPES.indexOf(t) > -1 ? t : 'text', zh: '', es: '', en: '' };
  if (q.t === 'scale') q.opts = svScaleOpts('good').map(function (o) { return { id: svNewId('o'), zh: o.zh, es: o.es, en: o.en }; });
  else if (q.t === 'single' || q.t === 'multi') q.opts = [0, 1].map(function () { return { id: svNewId('o'), zh: '', es: '', en: '' }; });
  return q;
}
function svBlankOpt() { return { id: svNewId('o'), zh: '', es: '', en: '' }; }

/* 檢查一份問卷能不能儲存或發布；回傳錯誤文字（空字串＝沒問題） */
function svValidate(sv) {
  if (!sv || !String(sv.title || '').trim()) return '請先幫問卷取個名字';
  if (String(sv.title).length > SV_TITLE_MAX) return '問卷名稱最多 ' + SV_TITLE_MAX + ' 個字';
  var qs = sv.questions || [];
  if (!qs.length) return '至少要有一題';
  if (qs.length > SV_Q_MAX) return '一份問卷最多 ' + SV_Q_MAX + ' 題';
  var seen = {};
  for (var i = 0; i < qs.length; i++) {
    var q = qs[i], no = '第 ' + (i + 1) + ' 題';
    if (SV_TYPES.indexOf(q.t) < 0) return no + '的題型不對';
    if (!String(q.zh || '').trim()) return no + '還沒有中文題目';
    if (seen[q.id]) return no + '的代號重複了';
    seen[q.id] = 1;
    if (q.t !== 'text') {
      var os = q.opts || [];
      if (os.length < 2) return no + '至少要有 2 個選項';
      for (var j = 0; j < os.length; j++) if (!String(os[j].zh || '').trim()) return no + '的第 ' + (j + 1) + ' 個選項還沒有中文';
    }
  }
  return '';
}

/* 發布用：深拷貝題目，後面接上固定的最後一題；空白的外語欄位去掉 */
function svPublishQs(sv) {
  var qs = JSON.parse(JSON.stringify(sv.questions || []));
  qs.forEach(function (q) {
    ['zh', 'es', 'en'].forEach(function (k) { q[k] = String(q[k] || '').trim(); if (!q[k] && k !== 'zh') delete q[k]; });
    (q.opts || []).forEach(function (o) { ['zh', 'es', 'en'].forEach(function (k) { o[k] = String(o[k] || '').trim(); if (!o[k] && k !== 'zh') delete o[k]; }); });
  });
  qs.push(svConsentQ());
  return qs;
}

/* 顯示：中文＋外語。fl 要的外語沒有，就退到另一種外語，再沒有就只有中文。回傳 { zh, fl } */
function svPick(obj, fl) {
  var other = fl === 'en' ? 'es' : 'en';
  var f = String(obj[fl] || '').trim() || String(obj[other] || '').trim();
  return { zh: String(obj.zh || ''), fl: f };
}

/* 這題有沒有答：文字要有字、單選要有選項、複選至少一個 */
function svAnswered(q, a) {
  if (q.t === 'text') return typeof a === 'string' && a.trim() !== '';
  if (q.t === 'multi') return Array.isArray(a) && a.length > 0;
  return typeof a === 'string' && a !== '';
}
function svUnansweredCount(qs, answers) {
  var n = 0;
  (qs || []).forEach(function (q) { if (!svAnswered(q, (answers || {})[q.id])) n++; });
  return n;
}

/* 存進資料庫前整理答案：文字去頭尾空白、限制長度；選項要真的存在；不是這題的答案丟掉 */
function svCleanAnswers(qs, answers) {
  var out = {};
  (qs || []).forEach(function (q) {
    var a = (answers || {})[q.id];
    if (q.t === 'text') { if (typeof a === 'string' && a.trim()) out[q.id] = a.replace(/\r\n?/g, '\n').trim().slice(0, SV_TEXT_MAX); return; }
    var ids = (q.opts || []).map(function (o) { return o.id; });
    if (q.t === 'multi') { var arr = (Array.isArray(a) ? a : []).filter(function (x, i, s) { return ids.indexOf(x) > -1 && s.indexOf(x) === i; }); if (arr.length) out[q.id] = arr; return; }
    if (typeof a === 'string' && ids.indexOf(a) > -1) out[q.id] = a;
  });
  return out;
}

/* 彙整：entries ＝ [{ answers, ... }]（只放已交出的）。每題回傳：
   text → { n, texts:[{ text, entry }] }；選擇題 → { n, counts:{選項id:人數}, avg（量表才有，1＝第一個選項最好） } */
function svTally(qs, entries) {
  var res = {};
  (qs || []).forEach(function (q) {
    var r = { n: 0 };
    if (q.t === 'text') r.texts = []; else { r.counts = {}; (q.opts || []).forEach(function (o) { r.counts[o.id] = 0; }); }
    var sum = 0, cnt = 0;
    (entries || []).forEach(function (e) {
      var a = (e.answers || {})[q.id];
      if (!svAnswered(q, a)) return;
      r.n++;
      if (q.t === 'text') r.texts.push({ text: a, entry: e });
      else if (q.t === 'multi') a.forEach(function (id) { if (r.counts[id] != null) r.counts[id]++; });
      else if (r.counts[a] != null) {
        r.counts[a]++;
        if (q.t === 'scale') { var idx = (q.opts || []).findIndex(function (o) { return o.id === a; }); if (idx > -1) { sum += idx + 1; cnt++; } }
      }
    });
    if (q.t === 'scale' && cnt) r.avg = Math.round(sum / cnt * 100) / 100;
    res[q.id] = r;
  });
  return res;
}

/* 單一答案轉成人看得懂的文字（匯出和列表用）：選項用中文，複選用「、」連起來 */
function svAnswerText(q, a) {
  if (!svAnswered(q, a)) return '';
  if (q.t === 'text') return a;
  var name = function (id) { var o = (q.opts || []).find(function (x) { return x.id === id; }); return o ? o.zh : id; };
  return q.t === 'multi' ? a.map(name).join('、') : name(a);
}

/* 匯出表格：第一列標題（時間、學生、題目…），之後一份回覆一列 */
function svExportRows(qs, entries) {
  var head = ['填寫時間', '學生／名字'].concat((qs || []).map(function (q, i) { return (i + 1) + '. ' + q.zh; }));
  var rows = (entries || []).map(function (e) {
    return [e.when || '', e.who || ''].concat((qs || []).map(function (q) { return svAnswerText(q, (e.answers || {})[q.id]); }));
  });
  return [head].concat(rows);
}


/* ===== 公開連結（沒有用學生日誌的學生）=====
   - svPublic/{發布代號}   任何人拿到連結都讀得到的那一份：{ title, qs, zh, fl, open:true|false, createdAt }（不放老師和學生的資料）
   - svResp/{回覆代號}     公開連結的回覆：{ rid, name, answers, ts, sid? }；任何人只能新增；老師讀、改 sid（對應到哪位學生）、刪 */
function svCleanName(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, SV_NAME_MAX); }
function svPublicDoc(round) {
  return { title: round.title, qs: round.qs, zh: round.zh, fl: round.fl, open: true, createdAt: round.createdAt };
}
function svPublicUrl(base, tid, rid) { return base + 'survey.html?t=' + encodeURIComponent(tid) + '&r=' + encodeURIComponent(rid); }

/* 把一次發布的所有回覆合在一起：學生日誌裡交出的＋公開連結的。
   studentDocs：{ 學生代號: { 發布代號: 那份 } }；resps：[{ id, rid, name, answers, ts, sid? }]；nameOf(sid)：學生名字
   回傳 [{ key, kind:'student'|'public', sid, who, ts, status:'todo'|'submitted', answers, id? }] */
function svCollect(rid, round, studentDocs, resps, nameOf) {
  var out = [];
  ((round && round.sids) || []).forEach(function (sid) {
    var d = (studentDocs[sid] || {})[rid];
    if (!d) return;
    out.push({ key: 's:' + sid, kind: 'student', sid: sid, who: nameOf(sid), ts: d.submittedAt || d.assignedAt || 0, status: d.status === 'submitted' ? 'submitted' : 'todo', answers: d.answers || {} });
  });
  (resps || []).filter(function (r) { return r.rid === rid; }).sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); }).forEach(function (r) {
    var matched = r.sid ? nameOf(r.sid) : '';
    out.push({ key: 'p:' + r.id, kind: 'public', id: r.id, sid: r.sid || '', who: matched ? matched + '（公開連結：' + r.name + '）' : r.name + '（公開連結）', name: r.name, ts: r.ts || 0, status: 'submitted', answers: r.answers || {} });
  });
  return out;
}

/* ===== 匯出 Excel（.xlsx）=====
   不靠任何外掛：只產生 xlsx 裡面需要的幾個 XML 檔（{ 路徑: 內容 }），網頁再用 JSZip 包成一個檔案。
   rows：二維陣列（第一列是標題）；全部存成文字。 */
function svXmlEsc(s) {
  return String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
}
function svColName(i) { var s = ''; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
function svSheetName(s) { return (String(s || '').replace(/[\[\]\*\?\/\\:]/g, ' ').trim() || '問卷').slice(0, 31); }
function svXlsxFiles(rows, sheetName) {
  var cols = 0; rows.forEach(function (r) { if (r.length > cols) cols = r.length; });
  var colsXml = '<cols>';
  for (var c = 0; c < cols; c++) colsXml += '<col min="' + (c + 1) + '" max="' + (c + 1) + '" width="' + (c < 2 ? 22 : 40) + '" customWidth="1"/>';
  colsXml += '</cols>';
  var data = rows.map(function (r, ri) {
    var cells = r.map(function (v, ci) {
      return '<c r="' + svColName(ci) + (ri + 1) + '" t="inlineStr" s="' + (ri === 0 ? 1 : 0) + '"><is><t xml:space="preserve">' + svXmlEsc(v) + '</t></is></c>';
    }).join('');
    return '<row r="' + (ri + 1) + '">' + cells + '</row>';
  }).join('');
  var f = {};
  f['[Content_Types].xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>';
  f['_rels/.rels'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  f['xl/workbook.xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="' + svXmlEsc(svSheetName(sheetName)) + '" sheetId="1" r:id="rId1"/></sheets></workbook>';
  f['xl/_rels/workbook.xml.rels'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
  f['xl/styles.xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  f['xl/worksheets/sheet1.xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' + colsXml + '<sheetData>' + data + '</sheetData></worksheet>';
  return f;
}

/* ===== 翻譯學生的回答 =====
   先用 Chrome 內建翻譯（電腦版 Chrome 138 以上；學生回答的語言→繁體中文）；不能用就開 Google 翻譯。 */
function svLooksChinese(text) { var m = String(text || '').match(/[㐀-鿿]/g); return !!m && m.length >= Math.max(2, String(text).replace(/\s/g, '').length * 0.3); }
function svGoogleTranslateUrl(text, sl) {
  return 'https://translate.google.com/?sl=' + (sl || 'auto') + '&tl=zh-TW&op=translate&text=' + encodeURIComponent(String(text || '').slice(0, 1500));
}

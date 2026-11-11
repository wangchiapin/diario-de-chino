/* =====================================================================
   Diario de chino · 學生頁與老師後台共用的程式
   （純計算與文字，不碰網頁和 Firebase，tests/run.js 會直接載入這個檔案來測）

   時間規則：日誌（老師）存的上課時間一律是「台灣時間」（UTC+8，沒有夏令）。
   學生看到的是兩個時間：台灣時間、學生所在地的當地時間。當地時間用瀏覽器內建的
   Intl 依「那一天」的日期換算，所以有夏令／冬令的國家，換季那天前後自動正確。
===================================================================== */

var PC_TW_OFFSET_MIN = 8 * 60;

/* 台灣日期＋時間 → 世界標準時間（毫秒） */
function pcTwToUtcMs(dateISO, hhmm){
  var d = String(dateISO).split('-');
  var t = String(hhmm || '00:00').split(':');
  return Date.UTC(+d[0], +d[1] - 1, +d[2], +t[0], +(t[1] || 0)) - PC_TW_OFFSET_MIN * 60000;
}

/* 某個時間點在指定時區的年月日時分；時區名稱不對就退回台灣 */
function pcLocalParts(ms, tz){
  var fmt;
  try{
    fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz || 'Asia/Taipei', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }catch(e){
    fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  var o = {};
  fmt.formatToParts(new Date(ms)).forEach(function(p){ if(p.type !== 'literal') o[p.type] = p.value; });
  var hh = o.hour === '24' ? '00' : o.hour;
  return { date: o.year + '-' + o.month + '-' + o.day, time: hh + ':' + o.minute };
}

/* 'YYYY-MM-DD' 加減天數 */
function pcIsoAdd(iso, n){
  var p = String(iso).split('-');
  var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n));
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
}
function pcDaysBetween(aISO, bISO){
  var a = aISO.split('-'), b = bISO.split('-');
  return Math.round((Date.UTC(+b[0], +b[1] - 1, +b[2]) - Date.UTC(+a[0], +a[1] - 1, +a[2])) / 86400000);
}

/* 一堂課（日誌發佈的 {d,s,e,x}）→ 學生看的樣子
   x=1：請假／沒上課；整天行程（沒有時間）沒有時間，也算「沒上課」 */
function pcLessonView(l, tz){
  var v = { twDate: l.d, twStart: l.s || '', twEnd: l.e || '', off: !!l.x, allDay: !l.s };
  if(v.allDay){
    v.localDate = l.d; v.localStart = ''; v.localEnd = ''; v.dayShift = 0; v.startMs = pcTwToUtcMs(l.d, '00:00'); v.endMs = v.startMs + 86400000;
    return v;
  }
  v.startMs = pcTwToUtcMs(l.d, l.s);
  var endMs = pcTwToUtcMs(l.d, l.e || l.s);
  if(endMs <= v.startMs) endMs += 86400000;          // 跨午夜的課
  v.endMs = endMs;
  var a = pcLocalParts(v.startMs, tz), b = pcLocalParts(endMs, tz);
  v.localDate = a.date; v.localStart = a.time; v.localEnd = b.time;
  v.dayShift = pcDaysBetween(l.d, a.date);             // 當地日期比台灣早一天＝-1
  return v;
}

/* 已經過了／正在上／還沒上／請假 */
function pcStatus(v, nowMs){
  if(v.off || v.allDay) return 'off';
  if(v.endMs <= nowMs) return 'done';
  if(v.startMs <= nowMs) return 'now';
  return 'upcoming';
}

/* 全部課 → 依「學生當地日期」分組 */
function pcGroupByLocalDate(lessons, tz){
  var map = {};
  (lessons || []).forEach(function(l){
    var v = pcLessonView(l, tz);
    (map[v.localDate] = map[v.localDate] || []).push(v);
  });
  Object.keys(map).forEach(function(k){ map[k].sort(function(a, b){ return a.startMs - b.startMs; }); });
  return map;
}

/* 接下來的一堂課（沒請假、還沒結束） */
function pcNextLesson(lessons, tz, nowMs){
  var best = null;
  (lessons || []).forEach(function(l){
    var v = pcLessonView(l, tz);
    if(v.off || v.allDay || v.endMs <= nowMs) return;
    if(!best || v.startMs < best.startMs) best = v;
  });
  return best;
}

/* 月曆格子：週一開頭，固定 6 週 × 7 天 */
function pcMonthGrid(year, month){          // month: 1–12
  var first = year + '-' + String(month).padStart(2, '0') + '-01';
  var dow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();   // 0=日
  var start = pcIsoAdd(first, -((dow + 6) % 7));
  var cells = [];
  for(var i = 0; i < 42; i++){
    var iso = pcIsoAdd(start, i);
    cells.push({ date: iso, inMonth: +iso.slice(5, 7) === month });
  }
  return cells;
}

/* 日期文字（用該語言的星期、月份名稱）。iso 是純日期，不受瀏覽器時區影響 */
function pcFmtDate(iso, lang, opt){
  var p = iso.split('-');
  var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  var loc = lang === 'es' ? 'es' : lang === 'sc' ? 'zh-CN' : 'zh-TW';
  return new Intl.DateTimeFormat(loc, Object.assign({ timeZone: 'UTC' }, opt || { weekday: 'short', day: 'numeric', month: 'short' })).format(d);
}

/* 時區名稱 → 好讀的城市名，例如 America/Mexico_City → Mexico City */
function pcTzCity(tz){
  var s = String(tz || '').split('/').pop() || '';
  return s.replace(/_/g, ' ');
}

/* 瀏覽器語言 → 介面語言 */
function pcDetectLang(nav){
  var n = String(nav || '').toLowerCase();
  if(n.indexOf('zh') === 0){
    return (n.indexOf('cn') > -1 || n.indexOf('hans') > -1 || n.indexOf('sg') > -1) ? 'sc' : 'tc';
  }
  return 'es';
}

/* ───────── 介面文字：西語、繁體、簡體（簡體仍用台灣用語，只是字形換成簡體） ───────── */
var PC_I18N = {
  es: {
    title: 'Mi diario de chino', login: 'Iniciar sesión', register: 'Crear cuenta', email: 'Correo electrónico', password: 'Contraseña',
    forgot: '¿Olvidaste tu contraseña?', logout: 'Cerrar sesión', language: 'Idioma',
    needLink: 'Abre esta página desde el enlace que te envió tu profesor.',
    verifyTitle: 'Confirma tu correo', verifyMsg: 'Te enviamos un mensaje a {email}. Abre el enlace del mensaje y vuelve aquí. Si no lo ves, revisa la carpeta de spam.',
    verifyDone: 'Ya lo confirmé', verifyResend: 'Reenviar mensaje', sent: 'Mensaje enviado.', resetSent: 'Te enviamos un mensaje para cambiar tu contraseña. Revisa también el spam.',
    notListedTitle: 'Tu correo aún no está registrado', notListedMsg: 'Dile a tu profesor que use este correo: {email}',
    hello: 'Hola, {name}', nextClass: 'Próxima clase', noNext: 'Todavía no hay una próxima clase en el calendario.',
    twTime: 'Hora de Taiwán', yourTime: 'Tu hora', today: 'hoy', tomorrow: 'mañana', inDays: 'en {n} días', now: 'en curso',
    prevDay: 'día anterior', nextDay: 'día siguiente',
    payment: 'Pago', remaining: 'Clases restantes', single: 'Pago por clase', taught: 'Clases tomadas', unit: '{n} clases',
    calendar: 'Calendario', legendDone: 'Tomada', legendNext: 'Próxima', legendOff: 'Sin clase / cancelada',
    dayDetail: 'Clases de este día', noClassDay: 'No hay clases este día.', off: 'Sin clase',
    timezone: 'Tu zona horaria', tzTeacher: 'Según tu profesor', tzDevice: 'Según tu dispositivo', tzChange: 'Cambiar',
    updated: 'Actualizado: {t}', loading: 'Cargando…', archived: 'Esta cuenta ya no está activa.', retry: 'Reintentar',
    errLogin: 'Correo o contraseña incorrectos.', errExists: 'Este correo ya tiene una cuenta. Inicia sesión.', errWeak: 'La contraseña debe tener al menos 6 caracteres.',
    errEmail: 'El correo no es válido.', errMany: 'Demasiados intentos. Espera unos minutos.', errNet: 'Sin conexión. Revisa tu internet.', errOther: 'Algo salió mal. Inténtalo de nuevo.',
    errNoPerm: 'No tienes permiso para ver estos datos. Confirma tu correo e inténtalo de nuevo.', noNoData: 'Tu profesor todavía no ha publicado tu información.',
    hwTitle: 'Tareas', hwStTodo: 'Por entregar', hwStSubmitted: 'Entregada, esperando corrección', hwStGraded: 'Corregida',
    hwStart: 'Hacer la tarea', hwView: 'Ver', hwBack: 'Volver', hwSubmit: 'Entregar la tarea', hwConfirm: '¿Entregar la tarea? Después ya no podrás cambiar tus respuestas.',
    hwUnanswered: 'Te faltan {n} respuestas.', hwYes: 'Sí, entregar', hwNo: 'Cancelar', hwSaving: 'Guardando…', hwSaved: 'Guardado', hwSaveErr: 'No se pudo guardar. Revisa tu conexión.',
    hwLocked: 'Ya entregaste esta tarea. Tu profesor la corregirá.', hwScore: 'Puntos: {got}/{max}', hwPoints: '{n} pts', hwAssigned: 'Asignada: {t}', hwClear: 'Borrar',
    hwPreviewRO: 'Vista previa del profesor: solo lectura.', hwPick: 'Elige', hwWrite: 'Escribe tu respuesta',
    hwKey: 'Respuesta correcta', hwSample: 'Respuesta de ejemplo', hwTeacherNote: 'Mensaje de tu profesor', hwRight: 'Correcto', hwWrong: 'Incorrecto', hwHalf: 'Parcial', hwNoAns: '(sin respuesta)', hwMarked: 'Corrección de tu profesor',
    hwWordTitle: 'Hacer la tarea en Word', hwWordHelp: '1) Descarga el Word. 2) Respóndelo en tu computadora o celular. 3) Súbelo aquí (solo .docx, máximo 600 KB) y pulsa Entregar.', hwWordDown: 'Descargar Word', hwWordUp: 'Subir mi Word', hwWordUploaded: 'Subido: {name}', hwWordRemove: 'Quitar', hwWordBig: 'El archivo es muy grande (máximo 600 KB).', hwWordType: 'Solo se aceptan archivos .docx.', hwWordFail: 'No se pudo subir. Inténtalo de nuevo.', hwWordDownFail: 'No se pudo crear el Word. Revisa tu conexión.', hwWordName: 'Nombre', hwWordDate: 'Fecha', hwMatchNote: 'Escribe la letra que corresponde a cada número.', hwWordSent: 'Tu Word ya está subido.', hwWordMarkedTitle: 'Tu Word corregido', hwAnswersTitle: 'Respuestas correctas', hwWordBusy: 'Subiendo…',
    hwT_fill: 'Completa con la palabra correcta', hwT_cloze: 'Completa el texto con la palabra correcta', hwT_order: 'Ordena las palabras para formar una oración',
    hwT_choice: 'Elige la oración correcta', hwT_fix: 'Escribe la oración correcta', hwT_translate: 'Traduce al chino', hwT_zh2es: 'Traduce al español',
    hwT_match: 'Une cada palabra con su significado', hwT_sentence: 'Escribe una oración con la palabra o estructura indicada'
  },
  tc: {
    title: '我的中文日誌', login: '登入', register: '建立帳號', email: '電子郵件', password: '密碼',
    forgot: '忘記密碼？', logout: '登出', language: '語言',
    needLink: '請從老師傳給你的連結開啟這個頁面。',
    verifyTitle: '請驗證你的電子郵件', verifyMsg: '我們寄了一封信到 {email}。請開啟信中的連結後再回到這裡。沒收到的話，請看看垃圾郵件匣。',
    verifyDone: '我已經驗證了', verifyResend: '重新寄送', sent: '已寄出。', resetSent: '已寄出重設密碼的信，也請看看垃圾郵件匣。',
    notListedTitle: '你的電子郵件還沒登記', notListedMsg: '請告訴老師使用這個電子郵件：{email}',
    hello: '{name}，你好', nextClass: '下一堂課', noNext: '行事曆上還沒有下一堂課。',
    twTime: '台灣時間', yourTime: '你的當地時間', today: '今天', tomorrow: '明天', inDays: '{n} 天後', now: '上課中',
    prevDay: '前一天', nextDay: '後一天',
    payment: '付費', remaining: '剩餘堂數', single: '單堂付費', taught: '已上課堂數', unit: '{n} 堂',
    calendar: '行事曆', legendDone: '已上課', legendNext: '還沒上', legendOff: '請假／沒上課',
    dayDetail: '這一天的課', noClassDay: '這一天沒有課。', off: '沒上課',
    timezone: '你的時區', tzTeacher: '老師設定的', tzDevice: '依你的裝置', tzChange: '更改',
    updated: '更新時間：{t}', loading: '載入中…', archived: '這個帳號已經停用。', retry: '重試',
    errLogin: '電子郵件或密碼不正確。', errExists: '這個電子郵件已經有帳號，請直接登入。', errWeak: '密碼至少要 6 個字元。',
    errEmail: '電子郵件格式不正確。', errMany: '嘗試次數太多，請過幾分鐘再試。', errNet: '沒有網路，請檢查連線。', errOther: '發生問題，請再試一次。',
    errNoPerm: '沒有權限查看這些資料。請確認已驗證電子郵件後再試。', noNoData: '老師還沒有發佈你的資料。',
    hwTitle: '作業', hwStTodo: '還沒交', hwStSubmitted: '已交出，等老師批改', hwStGraded: '已批改',
    hwStart: '開始作答', hwView: '查看', hwBack: '返回', hwSubmit: '交出作業', hwConfirm: '要交出作業嗎？交出後就不能再修改。',
    hwUnanswered: '還有 {n} 題沒作答。', hwYes: '確定交出', hwNo: '取消', hwSaving: '儲存中…', hwSaved: '已儲存', hwSaveErr: '儲存失敗，請檢查網路。',
    hwLocked: '你已經交出這份作業，等老師批改。', hwScore: '得分：{got}／{max}', hwPoints: '{n} 分', hwAssigned: '發出日期：{t}', hwClear: '清除',
    hwPreviewRO: '老師預覽：只能看，不能作答。', hwPick: '請選擇', hwWrite: '寫下你的答案',
    hwKey: '標準答案', hwSample: '示範答案', hwTeacherNote: '老師的話', hwRight: '答對了', hwWrong: '答錯了', hwHalf: '對一半', hwNoAns: '（沒有作答）', hwMarked: '老師批改',
    hwWordTitle: '用 Word 做作業', hwWordHelp: '① 下載 Word　② 在電腦或手機上寫好　③ 回來上傳（只收 .docx，最大 600 KB），再按「交出作業」。', hwWordDown: '下載 Word', hwWordUp: '上傳我寫好的 Word', hwWordUploaded: '已上傳：{name}', hwWordRemove: '移除', hwWordBig: '檔案太大了（最大 600 KB）。', hwWordType: '只收 .docx 檔案。', hwWordFail: '上傳失敗，請再試一次。', hwWordDownFail: '沒辦法產生 Word，請檢查網路。', hwWordName: '姓名', hwWordDate: '日期', hwMatchNote: '請在每個數字後面寫上對應的字母。', hwWordSent: '你的 Word 已經上傳。', hwWordMarkedTitle: '老師批改後的 Word', hwAnswersTitle: '標準答案', hwWordBusy: '上傳中…',
    hwT_fill: '選詞填空：選出正確的詞填入空格', hwT_cloze: '段落填空：選出正確的詞填入空格', hwT_order: '排序：把詞語排成通順的句子',
    hwT_choice: '選擇：選出正確的句子', hwT_fix: '改錯：找出錯誤，寫出正確的句子', hwT_translate: '西翻中：翻成中文', hwT_zh2es: '中翻西：翻成西班牙文',
    hwT_match: '配對：把每個詞語和它的意思連起來', hwT_sentence: '造句：用指定的詞語或句型造句'
  },
  sc: {
    title: '我的中文日志', login: '登入', register: '建立账号', email: '电子邮件', password: '密码',
    forgot: '忘记密码？', logout: '登出', language: '语言',
    needLink: '请从老师传给你的链接开启这个页面。',
    verifyTitle: '请验证你的电子邮件', verifyMsg: '我们寄了一封信到 {email}。请开启信中的链接后再回到这里。没收到的话，请看看垃圾邮件匣。',
    verifyDone: '我已经验证了', verifyResend: '重新寄送', sent: '已寄出。', resetSent: '已寄出重设密码的信，也请看看垃圾邮件匣。',
    notListedTitle: '你的电子邮件还没登记', notListedMsg: '请告诉老师使用这个电子邮件：{email}',
    hello: '{name}，你好', nextClass: '下一堂课', noNext: '行事历上还没有下一堂课。',
    twTime: '台湾时间', yourTime: '你的当地时间', today: '今天', tomorrow: '明天', inDays: '{n} 天后', now: '上课中',
    prevDay: '前一天', nextDay: '后一天',
    payment: '付费', remaining: '剩余堂数', single: '单堂付费', taught: '已上课堂数', unit: '{n} 堂',
    calendar: '行事历', legendDone: '已上课', legendNext: '还没上', legendOff: '请假／没上课',
    dayDetail: '这一天的课', noClassDay: '这一天没有课。', off: '没上课',
    timezone: '你的时区', tzTeacher: '老师设定的', tzDevice: '依你的装置', tzChange: '更改',
    updated: '更新时间：{t}', loading: '载入中…', archived: '这个账号已经停用。', retry: '重试',
    errLogin: '电子邮件或密码不正确。', errExists: '这个电子邮件已经有账号，请直接登入。', errWeak: '密码至少要 6 个字元。',
    errEmail: '电子邮件格式不正确。', errMany: '尝试次数太多，请过几分钟再试。', errNet: '没有网路，请检查连线。', errOther: '发生问题，请再试一次。',
    errNoPerm: '没有权限查看这些资料。请确认已验证电子邮件后再试。', noNoData: '老师还没有发布你的资料。',
    hwTitle: '作业', hwStTodo: '还没交', hwStSubmitted: '已交出，等老师批改', hwStGraded: '已批改',
    hwStart: '开始作答', hwView: '查看', hwBack: '返回', hwSubmit: '交出作业', hwConfirm: '要交出作业吗？交出后就不能再修改。',
    hwUnanswered: '还有 {n} 题没作答。', hwYes: '确定交出', hwNo: '取消', hwSaving: '储存中…', hwSaved: '已储存', hwSaveErr: '储存失败，请检查网路。',
    hwLocked: '你已经交出这份作业，等老师批改。', hwScore: '得分：{got}／{max}', hwPoints: '{n} 分', hwAssigned: '发出日期：{t}', hwClear: '清除',
    hwPreviewRO: '老师预览：只能看，不能作答。', hwPick: '请选择', hwWrite: '写下你的答案',
    hwKey: '标准答案', hwSample: '示范答案', hwTeacherNote: '老师的话', hwRight: '答对了', hwWrong: '答错了', hwHalf: '对一半', hwNoAns: '（没有作答）', hwMarked: '老师批改',
    hwWordTitle: '用 Word 做作业', hwWordHelp: '① 下载 Word　② 在电脑或手机上写好　③ 回来上传（只收 .docx，最大 600 KB），再按「交出作业」。', hwWordDown: '下载 Word', hwWordUp: '上传我写好的 Word', hwWordUploaded: '已上传：{name}', hwWordRemove: '移除', hwWordBig: '档案太大了（最大 600 KB）。', hwWordType: '只收 .docx 档案。', hwWordFail: '上传失败，请再试一次。', hwWordDownFail: '没办法产生 Word，请检查网路。', hwWordName: '姓名', hwWordDate: '日期', hwMatchNote: '请在每个数字后面写上对应的字母。', hwWordSent: '你的 Word 已经上传。', hwWordMarkedTitle: '老师批改后的 Word', hwAnswersTitle: '标准答案', hwWordBusy: '上传中…',
    hwT_fill: '选词填空：选出正确的词填入空格', hwT_cloze: '段落填空：选出正确的词填入空格', hwT_order: '排序：把词语排成通顺的句子',
    hwT_choice: '选择：选出正确的句子', hwT_fix: '改错：找出错误，写出正确的句子', hwT_translate: '西翻中：翻成中文', hwT_zh2es: '中翻西：翻成西班牙文',
    hwT_match: '配对：把每个词语和它的意思连起来', hwT_sentence: '造句：用指定的词语或句型造句'
  }
};

/* 取文字，{name} 這種欄位用 params 帶入；找不到就退回西語 */
function pcT(lang, key, params){
  var s = (PC_I18N[lang] && PC_I18N[lang][key]);
  if(s == null) s = PC_I18N.es[key];
  if(s == null) return key;
  if(params) Object.keys(params).forEach(function(k){ s = s.split('{' + k + '}').join(params[k]); });
  return s;
}

/* 付費卡片要顯示什麼：包堂顯示剩幾堂；單堂付費只顯示「單堂付費」；沒設定就不顯示 */
function pcPayLine(doc, lang){
  if(!doc) return null;
  if(doc.pay === 'package' && doc.remaining != null) return { label: pcT(lang, 'remaining'), value: pcT(lang, 'unit', { n: Math.max(0, doc.remaining) }) };
  if(doc.pay === 'single') return { label: pcT(lang, 'payment'), value: pcT(lang, 'single') };
  return null;
}

/* Firebase 登入錯誤代碼 → 對應的文字 key */
function pcAuthErrorKey(code){
  switch(code){
    case 'auth/invalid-credential': case 'auth/wrong-password': case 'auth/user-not-found': case 'auth/invalid-login-credentials': return 'errLogin';
    case 'auth/email-already-in-use': return 'errExists';
    case 'auth/weak-password': return 'errWeak';
    case 'auth/invalid-email': case 'auth/missing-email': return 'errEmail';
    case 'auth/too-many-requests': return 'errMany';
    case 'auth/network-request-failed': return 'errNet';
    default: return 'errOther';
  }
}

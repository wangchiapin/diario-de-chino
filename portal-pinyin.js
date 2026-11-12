/* =====================================================================
   Diario de chino · 老師後台用的「單字拼音」（只有後台會載入；學生頁不需要）
   讀音照 GoodTeacher：pinyin-pro（含台灣例外表）→ 通則修正 → GoodTeacher 規則（gt-readings.json）
   這段是從「練習單產生器」(Generador-de-ejercicios/index.html) 搬過來的，兩邊要保持一致。
   用法：先載入 pinyin-pro；ptLoad() 載入規則檔；ptWord('做菜') → 'zuò cài'
===================================================================== */
var GT_URL = 'gt-readings.json';
function toSimp(s) { return s; }   // 只用在「函式庫不認得的冷僻字」的備案，這裡直接略過
const PUNCT = { '，':', ', '。':'. ', '？':'? ', '！':'! ', '、':', ', '：':': ', '；':'; ', '「':' "', '」':'" ', '（':' (', '）':') ', '…':'… ' };
const DE_FOLLOW = '很不多少快慢好太比沒真更非常十分特別清楚高低大小早晚遠近累餓飽';
const SYL = new Map();
/* ---- 台灣讀音：函式庫（含台灣例外表）→ 通則修正 → GoodTeacher 規則 → 使用者的修正表（最優先） ---- */
const TW_PINYIN = {
  '還是': 'hái shì', '還有': 'hái yǒu', '還要': 'hái yào', '還沒': 'hái méi', '還差': 'hái chà',
  '嗎': 'ma', '誰': 'shéi', '幾': 'jǐ', '喔': 'ō', '唷': 'yō', '耶': 'ye', '啦': 'la', '囉': 'luo',
  '什麼': 'shén me', '謝謝': 'xiè xie', '麻煩': 'má fan', '我們': 'wǒ men', '你們': 'nǐ men',
  '東西': 'dōng xi', '朋友': 'péng yǒu', '覺得': 'jué de', '著': 'zhe', '只': 'zhǐ',
  '著急': 'zháo jí',
  '同事': 'tóng shì', '冰塊': 'bīng kuài', '加料': 'jiā liào', '找您': 'zhǎo nín',
  '會不會': 'huì bú huì', '算啊': 'suàn a', '了啦': 'le la', '做得': 'zuò de', '時候': 'shí hòu', '記得': 'jì de',
  '蘋果': 'píng guǒ', '名字': 'míng zi', '這個': 'zhè ge',
  '垃圾': 'lè sè', '星期': 'xīng qí',
  '睡覺': 'shuì jiào', '公車': 'gōng chē', '公車站': 'gōng chē zhàn', '休息': 'xiū xí', '衣服': 'yī fú',
  '意思': 'yì si', '媽媽': 'mā ma', '對不起': 'duì bu qǐ', '有空': 'yǒu kòng', '便宜': 'pián yí',
  '他們': 'tā men', '她們': 'tā men', '它們': 'tā men',
  '火車': 'huǒ chē', '要是': 'yào shì', '因為': 'yīn wèi', '為什麼': 'wèi shén me',
  '怎麼': 'zěn me', '那麼': 'nà me', '這麼': 'zhè me',
  '乾淨': 'gān jìng', '乾乾淨淨': 'gān gān jìng jìng', '乾杯': 'gān bēi', '高興': 'gāo xìng', '好處': 'hǎo chù',
  '幾乎': 'jī hū', '寧可': 'nìng kě', '至於': 'zhì yú',
  '鑰匙': 'yuè shi', '當真': 'dāng zhēn'
};
let _twDone = false;
function initTW() {
  if (_twDone || typeof pinyinPro === 'undefined') return;
  _twDone = true;
  try { if (typeof pinyinPro.customPinyin === 'function') pinyinPro.customPinyin(TW_PINYIN); } catch (e) {}
}
/* GoodTeacher 多音字規則（資料：gt-readings.json，GoodTeacher 2026-10-13 版，和 corre 管理頁同一份） */
const GT_EXC_WORDS = ['東西', '幾乎', '寧可', '動不動', '鑰匙', '當真']; // 規則還沒涵蓋，維持上面例外表的讀音
const GT_EXC_CHARS = ''; // 「為」交給 GoodTeacher 規則（為了、因為 wèi；成為、行為 wéi）
const HANZI_RE = /[㐀-鿿]/;
let GT = null, GT_STATE = 'loading';
function gtLoad() {
  return fetch(GT_URL).then(r => r.ok ? r.json() : Promise.reject(new Error('http ' + r.status))).then(j => {
    const seg = x => x.startsWith('@GT_') ? (x.slice(4) === 'HANZI' ? (ch => HANZI_RE.test(ch)) : (set => ch => set.includes(ch))(j.k[x.slice(4)] || '')) : (set => ch => set.includes(ch))(x);
    const parse = x => x ? x.split('|').map(seg) : null;
    const rules = {};
    for (const ch in j.r) rules[ch] = j.r[ch].map(([chg, slot, pre, post, hint]) => ({ chg, slot, pre: parse(pre), post: parse(post), hint }));
    GT = { c: j.c, rules }; GT_STATE = 'ok'; SYL.clear();
  }).catch(() => { GT = null; GT_STATE = 'fail'; SYL.clear(); });
}
function gtMatch(txt, i, segs, dir) {
  if (!segs) return true;
  for (let k = 0; k < segs.length; k++) {
    const pos = dir < 0 ? i - (segs.length - k) : i + 1 + k;
    if (pos < 0 || pos >= txt.length || !segs[k](txt[pos])) return false;
  }
  return true;
}
function gtReading(txt, i) {
  const ch = txt[i], rs = GT.c[ch];
  if (!rs) return null;
  for (const r of (GT.rules[ch] || [])) {
    if (gtMatch(txt, i, r.pre, -1) && gtMatch(txt, i, r.post, 1)) {
      if (!r.chg) return rs[0];
      return r.slot >= 0 ? rs[r.slot] : (r.hint || rs[0]);
    }
  }
  return rs[0];
}
/* 數字聲調 → 符號：le4 → lè、nv3／nu:3／nü3 → nǚ、5 或 0 是輕聲（不標） */
const TONE_V = { a: 'aāáǎà', e: 'eēéěè', i: 'iīíǐì', o: 'oōóǒò', u: 'uūúǔù', 'ü': 'üǖǘǚǜ' };
function normSyl(x) {
  x = String(x).trim();
  const m = /^([A-Za-züÜ:]+?)([0-5])$/.exec(x);
  if (!m) return x;
  const b = m[1].toLowerCase().replace(/u:/g, 'ü').replace(/v/g, 'ü'), t = +m[2];
  if (t === 0 || t === 5) return b;
  let k = b.indexOf('a'); if (k < 0) k = b.indexOf('e');
  if (k < 0 && b.indexOf('ou') >= 0) k = b.indexOf('ou');
  if (k < 0) { for (let j = b.length - 1; j >= 0; j--) if (TONE_V[b[j]]) { k = j; break; } }
  if (k < 0 || !TONE_V[b[k]]) return x;
  return b.slice(0, k) + TONE_V[b[k]][t] + b.slice(k + 1);
}
function pyChars(text) {
  const res = new Array(text.length).fill(null);
  let arr = null;
  try { arr = pinyinPro.pinyin(text, { toneType: 'symbol', type: 'all' }); } catch (e) {}
  if (!arr) return res;
  let pos = 0;
  for (const it of arr) {
    const o = String(it.origin || '');
    if (it.isZh && o.length === 1 && pos < res.length) res[pos] = it.result || it.pinyin || '';
    pos += o.length || 1;
  }
  return res;
}
function syllables(trad) {
  trad = String(trad || '');
  if (SYL.has(trad)) return SYL.get(trad);
  initTW();
  const simp = toSimp(trad);
  const out = Array.from({ length: trad.length }, (_, i) => ({ ch: trad[i], py: '', zy: '', isZh: false }));
  if (typeof pinyinPro !== 'undefined') {
    // 先用繁體字算（才吃得到台灣例外表）；函式庫不認得的冷僻字，再用簡體字補
    const a = pyChars(trad), b = simp.length === trad.length ? pyChars(simp) : null;
    for (let i = 0; i < out.length; i++) {
      const py = a[i] || (b && b[i]) || '';
      if (py) { out[i].py = py; out[i].isZh = true; }
    }
  }
  // 通則（和 corre 一樣）：們、麼是輕聲；車念 chē；間念 jiān
  for (let i = 0; i < out.length; i++) {
    const c = trad[i], x = out[i];
    if (c === '們' && x.py === 'mén') x.py = 'men';
    else if (c === '麼' && x.py === 'mó') x.py = 'me';
    else if (c === '車' && x.py === 'jū') x.py = 'chē';
    else if (c === '間' && x.py === 'jiàn') x.py = 'jiān';
  }
  // GoodTeacher 規則：整句逐字校正（句尾補一個句號，讓「句尾」的規則能判斷）；例外詞維持台灣例外表
  if (GT) {
    const skip = new Array(trad.length).fill(false);
    for (let i = 0; i < trad.length; i++) if (GT_EXC_CHARS.includes(trad[i])) skip[i] = true;
    for (const w of GT_EXC_WORDS) { let at = trad.indexOf(w); while (at !== -1) { for (let k = 0; k < w.length; k++) skip[at + k] = true; at = trad.indexOf(w, at + w.length); } }
    const full = trad + '。';
    for (let i = 0; i < out.length; i++) {
      if (!out[i].isZh || skip[i]) continue;
      const g = gtReading(full, i);
      if (g && g.normalize('NFC') !== out[i].py.normalize('NFC')) out[i].py = g;
    }
  } else {
    // 規則檔沒載入時的備案：助詞「得」吃得很快 → de
    for (let i = 0; i < out.length; i++) {
      if (trad[i] === '得' && out[i].py === 'dé' && i > 0 && i + 1 < trad.length && DE_FOLLOW.includes(trad[i + 1])) out[i].py = 'de';
    }
  }
  // 使用者的讀音修正表（最優先；可以寫數字聲調 le4 se4）
  const dict = { '垃圾': 'lè sè' };
  for (const w of Object.keys(dict)) {
    const parts = String(dict[w]).trim().split(/\s+/).map(normSyl);
    if (!w || parts.length !== w.length) continue;
    let at = trad.indexOf(w);
    while (at !== -1) { for (let k = 0; k < w.length; k++) { out[at + k].py = parts[k]; out[at + k].isZh = true; } at = trad.indexOf(w, at + w.length); }
  }
  SYL.set(trad, out);
  return out;
}

/* 一個詞 → 拼音（小寫、音節用空格隔開；標點、英文原樣保留） */
function ptWord(trad) {
  var s = '';
  syllables(String(trad || '')).forEach(function (x) { s += (x.isZh && x.py) ? ' ' + x.py + ' ' : x.ch; });
  return s.replace(/\s+/g, ' ').trim();
}
function ptLoad() { return gtLoad(); }

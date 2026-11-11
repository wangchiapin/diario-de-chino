"""學生頁／老師後台的畫面測試（用 Playwright 開真的瀏覽器）。
Firebase 換成記憶體裡的假版本，所以不會碰到任何真的資料。
注意：這個測試「不會」測 Firestore 規則（誰能讀哪一份），規則要另外驗證。
用法：python3 tests/smoke.py   （需要 playwright 和 Chrome）"""
import datetime, http.server, os, socketserver, sys, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
TID = 'T' * 28

STUB_APP = "export function initializeApp(c){return {c}}"
STUB_AUTH = """
const fb = () => window.__fb;
let cbs = [];
const auth = { currentUser: null, languageCode: null };
function mkUser(email){ const u = fb().users[email]; const o = { uid: u.uid, email,
  get emailVerified(){ return fb().users[email].emailVerified; },
  async reload(){}, async getIdToken(){ return 't'; } }; return o; }
function fire(){ cbs.forEach(c => c(auth.currentUser)); }
export function getAuth(){ return auth; }
export function onAuthStateChanged(a, cb){ cbs.push(cb); setTimeout(() => cb(auth.currentUser), 0); return () => {}; }
export async function signInWithEmailAndPassword(a, email, pw){
  const u = fb().users[email];
  if(!u || u.password !== pw){ const e = new Error('bad'); e.code = 'auth/invalid-credential'; throw e; }
  auth.currentUser = mkUser(email); fire(); return { user: auth.currentUser };
}
export async function createUserWithEmailAndPassword(a, email, pw){
  if(fb().users[email]){ const e = new Error('dup'); e.code = 'auth/email-already-in-use'; throw e; }
  fb().users[email] = { password: pw, uid: 'uid_' + email, emailVerified: false };
  auth.currentUser = mkUser(email); fire(); return { user: auth.currentUser };
}
export async function sendEmailVerification(u){ fb().sent.push(['verify', u.email, auth.languageCode]); }
export async function sendPasswordResetEmail(a, email){ fb().sent.push(['reset', email, auth.languageCode]); }
export async function signOut(){ auth.currentUser = null; fire(); }
"""
STUB_FS = """
const fb = () => window.__fb;
const key = segs => segs.join('/');
export function getFirestore(){ return {}; }
export function doc(db, ...segs){ return { path: key(segs), id: segs[segs.length - 1] }; }
export function collection(db, ...segs){ return { path: key(segs), col: true }; }
export function where(field, op, val){ return { field, op, val }; }
export function query(col, w){ return { col, w }; }
const snapDoc = (path) => ({ id: path.split('/').pop(), exists: () => path in fb().store, data: () => fb().store[path] });
function listCol(path){ return Object.keys(fb().store).filter(p => p.startsWith(path + '/') && p.slice(path.length + 1).indexOf('/') < 0); }
function colSnap(paths){ const docs = paths.map(snapDoc); return { empty: docs.length === 0, docs, forEach: f => docs.forEach(f) }; }
export async function getDocs(q){
  const col = q.col || q; let paths = listCol(col.path);
  if(q.w) paths = paths.filter(p => fb().store[p][q.w.field] === q.w.val);
  fb().reads.push(col.path); return colSnap(paths);
}
export function onSnapshot(ref, cb, err){
  const sub = { ref, cb };
  fb().subs.push(sub);
  const fire = () => ref.col ? cb(colSnap(listCol(ref.path))) : cb(snapDoc(ref.path));
  sub.fire = fire; setTimeout(fire, 0); return () => { fb().subs = fb().subs.filter(s => s !== sub); };
}
export async function setDoc(ref, data){ fb().store[ref.path] = data; fb().subs.forEach(s => s.fire()); }
export async function deleteDoc(ref){ delete fb().store[ref.path]; fb().subs.forEach(s => s.fire()); }
"""
STUBS = {
    'firebase-app.js': STUB_APP, 'firebase-auth.js': STUB_AUTH, 'firebase-firestore.js': STUB_FS,
}


def serve():
    os.chdir(ROOT)
    handler = http.server.SimpleHTTPRequestHandler
    handler.log_message = lambda *a, **k: None
    srv = socketserver.TCPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, 'http://127.0.0.1:%d/' % srv.server_address[1]


passed = failed = 0


def check(name, cond, extra=''):
    global passed, failed
    if cond:
        passed += 1; print('  ✓ ' + name)
    else:
        failed += 1; print('  ✗ ' + name + ' ' + str(extra))


def tw_today():
    return (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=8)).date()


def day(offset):
    return (tw_today() + datetime.timedelta(days=offset)).isoformat()


def new_page(browser, init):
    ctx = browser.new_context(viewport={'width': 390, 'height': 800}, locale='es-MX')
    page = ctx.new_page()
    def handle(route):
        name = route.request.url.split('/')[-1]
        route.fulfill(status=200, content_type='application/javascript', body=STUBS[name])
    page.route('**/www.gstatic.com/**', handle)
    page.add_init_script('window.__fb = %s;' % init)
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    return ctx, page, errs


def base_state(extra_store=None, users=None):
    import json
    store = {
        'portal/%s/students/s1' % TID: {
            'v': 1, 'name': 'Pedro', 'archived': False, 'pay': 'package', 'remaining': 3, 'taught': 12, 'tz': 'America/Mexico_City',
            'updatedAt': 1760000000000,
            'lessons': [
                {'d': day(-3), 's': '10:00', 'e': '11:00', 'x': 0},
                {'d': day(2), 's': '10:00', 'e': '11:00', 'x': 0},
                {'d': day(5), 's': '10:00', 'e': '11:00', 'x': 1},
            ]},
        'portal/%s/students/s2' % TID: {'v': 1, 'name': 'Liz-OtraAlumna', 'archived': False, 'pay': 'single', 'remaining': None, 'taught': 4, 'tz': '', 'lessons': []},
        'portal/%s/roster/s1' % TID: {'email': 'pedro@example.com', 'name': 'Pedro'},
    }
    store.update(extra_store or {})
    us = {'pedro@example.com': {'password': 'secret1', 'uid': 'u_pedro', 'emailVerified': True}}
    us.update(users or {})
    return json.dumps({'store': store, 'users': us, 'sent': [], 'reads': [], 'subs': []})


def student_tests(browser, base):
    print('\n學生頁')
    # 1. 沒有老師連結
    ctx, page, errs = new_page(browser, base_state())
    page.goto(base + 'index.html'); page.wait_for_timeout(300)
    check('沒有老師連結：請學生從老師的連結進來', 'enlace' in page.inner_text('#app'))
    check('沒有錯誤訊息', not errs, errs); ctx.close()

    # 2. 登入畫面與語言
    ctx, page, errs = new_page(browser, base_state())
    page.goto(base + 'index.html?t=' + TID); page.wait_for_timeout(300)
    check('西語登入畫面', 'Iniciar sesión' in page.inner_text('#app'))
    page.click('#langBar button[data-l=tc]'); check('切到繁體', '電子郵件' in page.inner_text('#app') and '密碼' in page.inner_text('#app'))
    page.click('#langBar button[data-l=sc]'); check('切到簡體（用台灣用語）', '电子邮件' in page.inner_text('#app') and '密码' in page.inner_text('#app'))
    page.fill('#em', 'pedro@example.com'); page.fill('#pw', 'wrong'); page.click('#btnAuth'); page.wait_for_timeout(200)
    check('密碼錯誤：顯示簡體錯誤訊息', '不正确' in page.inner_text('#app'), page.inner_text('#app')); ctx.close()

    # 3. 註冊 → 要先驗證信箱
    ctx, page, errs = new_page(browser, base_state())
    page.goto(base + 'index.html?t=' + TID); page.wait_for_timeout(300)
    page.click('.tabs button[data-m=register]'); page.fill('#em', 'new@example.com'); page.fill('#pw', 'abcdef'); page.click('#btnAuth'); page.wait_for_timeout(300)
    check('註冊後看到驗證畫面', 'new@example.com' in page.inner_text('#app') and 'Confirma' in page.inner_text('#app'))
    sent = page.evaluate('window.__fb.sent')
    check('驗證信有寄出，語言是西語', sent and sent[0][0] == 'verify' and sent[0][2] == 'es', sent)
    check('還沒驗證時沒有去讀任何學生資料', page.evaluate('window.__fb.reads.length') == 0)
    ctx.close()

    # 4. 已驗證、在對照表裡：看到自己的資料
    ctx, page, errs = new_page(browser, base_state())
    page.goto(base + 'index.html?t=' + TID); page.wait_for_timeout(300)
    page.fill('#em', 'pedro@example.com'); page.fill('#pw', 'secret1'); page.click('#btnAuth'); page.wait_for_timeout(600)
    txt = page.inner_text('#app')
    check('看到自己的名字', 'Pedro' in txt, txt[:200])
    check('包堂：顯示剩 3 堂', '3 clases' in txt and 'Clases restantes' in txt)
    check('已上 12 堂', '12 clases' in txt)
    check('下一堂課：台灣 10:00–11:00，墨西哥 前一天 20:00–21:00', '10:00–11:00' in txt and '20:00–21:00' in txt and 'día anterior' in txt, txt)
    check('看不到別的學生', 'OtraAlumna' not in page.content())
    check('月曆有三種標記（已上、還沒上、請假）', page.locator('.dot.done').count() >= 1 and page.locator('.dot.upcoming').count() >= 1 and page.locator('.dot.off').count() >= 2)
    page.click('#langBar button[data-l=tc]'); txt = page.inner_text('#app')
    check('切繁體：剩餘堂數、台灣時間、你的當地時間、前一天', '剩餘堂數' in txt and '台灣時間' in txt and '你的當地時間' in txt and '前一天' in txt)
    # 換時區：改成台灣 → 兩個時間一樣
    page.select_option('#tzSel', 'Asia/Taipei'); page.wait_for_timeout(100)
    check('時區改成台灣後，沒有「前一天」標記', '前一天' not in page.inner_text('#app'))
    check('時區選擇有記住', page.evaluate("localStorage.getItem('dc.tz.%s')" % TID) == 'Asia/Taipei')
    check('讀的只有自己的那一份（先查對照表、再讀自己的文件）', page.evaluate('window.__fb.reads') == ['portal/%s/roster' % TID])
    check('沒有錯誤訊息', not errs, errs); ctx.close()

    # 5. 單堂付費：只顯示「單堂付費」
    ctx, page, errs = new_page(browser, base_state({'portal/%s/roster/s2' % TID: {'email': 'liz@example.com', 'name': 'x'}}, {'liz@example.com': {'password': 'secret2', 'uid': 'u_liz', 'emailVerified': True}}))
    page.goto(base + 'index.html?t=' + TID); page.wait_for_timeout(300)
    page.fill('#em', 'liz@example.com'); page.fill('#pw', 'secret2'); page.click('#btnAuth'); page.wait_for_timeout(600)
    txt = page.inner_text('#app')
    check('單堂付費：顯示「Pago por clase」，沒有剩幾堂', 'Pago por clase' in txt and 'restantes' not in txt, txt)
    check('沒有課的時候顯示沒有下一堂課', 'Todavía no hay' in txt); ctx.close()

    # 6. Email 不在對照表
    ctx, page, errs = new_page(browser, base_state(None, {'stranger@example.com': {'password': 'secret3', 'uid': 'u_s', 'emailVerified': True}}))
    page.goto(base + 'index.html?t=' + TID); page.wait_for_timeout(300)
    page.fill('#em', 'stranger@example.com'); page.fill('#pw', 'secret3'); page.click('#btnAuth'); page.wait_for_timeout(600)
    txt = page.inner_text('#app')
    check('不在對照表：請學生告訴老師這個電子郵件，且看不到任何學生資料', 'stranger@example.com' in txt and 'Pedro' not in txt, txt); ctx.close()

    # 7. 已封存
    ctx, page, errs = new_page(browser, base_state({'portal/%s/students/s1' % TID: {'v': 1, 'name': 'Pedro', 'archived': True}}))
    page.goto(base + 'index.html?t=' + TID); page.wait_for_timeout(300)
    page.fill('#em', 'pedro@example.com'); page.fill('#pw', 'secret1'); page.click('#btnAuth'); page.wait_for_timeout(600)
    check('已停課的帳號：顯示已停用', 'ya no está activa' in page.inner_text('#app')); ctx.close()


def admin_tests(browser, base):
    print('\n老師後台')
    teacher = {'teacher@example.com': {'password': 'tpass12', 'uid': TID, 'emailVerified': True}}
    store = {'portal/%s/students/s1' % TID: {'v': 1, 'name': 'Pedro', 'archived': False, 'pay': 'package', 'remaining': 2, 'taught': 5, 'tz': 'America/Mexico_City', 'updatedAt': 1760000000000, 'lessons': []},
             'portal/%s/students/s2' % TID: {'v': 1, 'name': 'Liz', 'archived': False, 'pay': 'single', 'remaining': None, 'taught': 3, 'tz': '', 'lessons': []},
             'portal/%s/students/s3' % TID: {'v': 1, 'name': 'Old', 'archived': True}}
    ctx, page, errs = new_page(browser, base_state(store, teacher))
    page.goto(base + 'admin.html'); page.wait_for_timeout(300)
    page.fill('#em', 'teacher@example.com'); page.fill('#pw', 'tpass12'); page.click('#go'); page.wait_for_timeout(600)
    txt = page.inner_text('#app')
    check('列出在學學生，付費顯示包堂剩幾堂／單堂付費', 'Pedro' in txt and '包堂・剩 2 堂' in txt and '單堂付費' in txt, txt)
    check('停課的學生收在摺疊區，沒有電子郵件欄', page.locator('tr[data-id=s3]').count() == 0 and 'Old' in page.content())
    check('提醒有學生沒設定所在地', '1 位學生還沒設定所在地' in txt)
    check('學生網址包含老師代號', ('?t=' + TID) in page.input_value('#link'))
    # 存 Email
    page.fill('tr[data-id=s1] .emIn', 'Pedro@Example.com'); page.click('tr[data-id=s1] .save'); page.wait_for_timeout(300)
    check('儲存：存成小寫', page.evaluate("window.__fb.store['portal/%s/roster/s1'].email" % TID) == 'pedro@example.com')
    page.fill('tr[data-id=s2] .emIn', 'pedro@example.com'); page.click('tr[data-id=s2] .save'); page.wait_for_timeout(300)
    check('同一個電子郵件不能給兩個人', '已經給了 Pedro' in page.inner_text('#app') and ('portal/%s/roster/s2' % TID) not in page.evaluate('Object.keys(window.__fb.store)'))
    page.fill('tr[data-id=s2] .emIn', 'not-an-email'); page.click('tr[data-id=s2] .save'); page.wait_for_timeout(300)
    check('格式不對會擋下來', '格式不正確' in page.inner_text('#app'))
    page.fill('tr[data-id=s2] .emIn', 'liz@example.com')
    page.evaluate("window.__fb.subs.forEach(s => s.fire())"); page.wait_for_timeout(200)   # 模擬日誌剛好更新
    check('日誌更新、畫面重畫時，打到一半的字不會不見', page.input_value('tr[data-id=s2] .emIn') == 'liz@example.com')
    page.click('tr[data-id=s2] .save'); page.wait_for_timeout(300)
    check('第二位存成功', page.evaluate("window.__fb.store['portal/%s/roster/s2'].email" % TID) == 'liz@example.com')
    page.fill('tr[data-id=s2] .emIn', ''); page.click('tr[data-id=s2] .save'); page.wait_for_timeout(300)
    check('清空再儲存＝取消這位學生的登入資格', ('portal/%s/roster/s2' % TID) not in page.evaluate('Object.keys(window.__fb.store)'))
    check('沒有錯誤訊息', not errs, errs); ctx.close()


srv, base = serve()
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    student_tests(browser, base)
    admin_tests(browser, base)
    browser.close()
print('\n' + ('有 %d 項沒通過（通過 %d 項）' % (failed, passed) if failed else '全部通過（%d 項）' % passed) + '\n')
sys.exit(1 if failed else 0)

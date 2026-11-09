/* core.js — หน้าเว็บระบบจองห้องประชุม (โฮสต์บน GitHub Pages)
 * ข้อมูลอยู่ใน Google Sheet ผ่าน Apps Script (doPost API) และยืนยันตัวตนด้วย LINE LIFF */

/* ===== ตั้งค่า ===== */
const CONFIG = {
  LIFF_ID: '2012256049-JYJqHNcd',
  API_URL: 'https://script.google.com/macros/s/AKfycbyNU_Bb7wcnqAJjN6Y5vTWcvMlESp4MHX0x1Uq_8XCj0AFsEQEvpvl70EfVftOxbort/exec'
};

const BOOT = { page: '' };
const S = { auth: null, boot: null, user: null, inLine: false };
const TH_M = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const TH_MONTH = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const TH_DOW = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

function $(id) { return document.getElementById(id); }
function esc(v) {
  return String(v === undefined || v === null ? '' : v).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function ymd(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function parseYmd(s) { const p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
function thDate(s) { if (!s) return ''; const d = parseYmd(String(s).slice(0, 10)); return d.getDate() + ' ' + TH_M[d.getMonth()] + ' ' + (d.getFullYear() + 543); }
function thDayLabel(s) { const d = parseYmd(s); return (s === ymd(new Date()) ? 'วันนี้ · ' : '') + TH_DOW[d.getDay()] + ' ' + d.getDate() + ' ' + TH_M[d.getMonth()] + ' ' + (d.getFullYear() + 543); }
function shiftDay(s, n) { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }

/** เรียก API ใน Apps Script (ส่งเป็น text/plain เพื่อไม่ให้เบราว์เซอร์ต้องถาม CORS ก่อน) */
function call(fn) {
  const args = Array.prototype.slice.call(arguments, 1);
  return fetch(CONFIG.API_URL, { method: 'POST', body: JSON.stringify({ fn: fn, auth: S.auth, args: args }) })
    .then(function (r) {
      if (!r.ok) throw new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ (' + r.status + ') กรุณาลองใหม่');
      return r.json();
    })
    .then(function (j) {
      if (!j || !j.ok) throw new Error((j && j.error) || 'เกิดข้อผิดพลาด กรุณาลองใหม่');
      return j.data;
    });
}

let toastTimer = null;
function toast(msg, bad) {
  const t = $('toast');
  t.textContent = msg;
  t.className = bad ? 'bad' : '';
  t.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.style.display = 'none'; }, 3500);
}
function busy(on) { $('busy').className = on ? 'on' : ''; }

function fatal(title, text) {
  $('app').classList.add('hidden');
  $('fatal').classList.add('on');
  $('fatalTitle').textContent = title;
  $('fatalText').textContent = text;
}

function handleError(e) {
  busy(false);
  const msg = (e && e.message) ? e.message : String(e);
  if (msg.indexOf('PENDING:') >= 0) return fatal('รอแอดมินอนุมัติ', msg.split('PENDING:')[1].trim());
  if (msg.indexOf('AUTH:') >= 0) return fatal('กรุณาเปิดจาก LINE', msg.split('AUTH:')[1].trim());
  toast(msg.replace(/^Error:\s*/, ''), true);
}

/** ล็อกอินผ่าน LINE LIFF (ใน LINE ไม่ต้องกดอะไร / นอก LINE จะพาไปหน้า LINE Login) */
async function initAuth() {
  if (typeof liff === 'undefined') throw new Error('AUTH: โหลด LINE LIFF ไม่สำเร็จ กรุณาลองใหม่');
  await liff.init({ liffId: CONFIG.LIFF_ID });
  S.inLine = liff.isInClient();
  if (!liff.isLoggedIn()) {
    liff.login({ redirectUri: location.href });
    return new Promise(function () {});
  }
  // หน้าเป้าหมาย (?page=book ฯลฯ) — LIFF คืนค่า query ให้หลัง init
  BOOT.page = (new URLSearchParams(location.search).get('page') || '').replace(/[^a-z]/g, '');
  try {
    const p = await liff.getProfile();
    if (p && p.pictureUrl) S.picture = p.pictureUrl;
  } catch (e) { /* ไม่มีรูปก็ไม่เป็นไร */ }
  return { liff: liff.getAccessToken() };
}

async function startApp(onReady) {
  busy(true);
  try {
    S.auth = await initAuth();
    S.boot = await call('api_bootstrap');
    S.user = S.boot.user;
    S.picture = S.picture || S.user.picture || '';
    const chip = $('userChip');
    chip.innerHTML = (S.picture ? '<img alt="" src="' + esc(S.picture) + '">' : '<span class="ph"></span>') +
      '<span>คุณ ' + esc(S.user.name) + (S.user.dept ? ' · ' + esc(S.user.dept) : '') + '</span>';
    await onReady();
  } catch (e) {
    handleError(e);
  } finally {
    busy(false);
  }
}

/** ปิดหน้าต่างกลับไปที่แชทหลังทำรายการสำเร็จ */
function backToChat(delay) {
  if (S.inLine && typeof liff !== 'undefined') setTimeout(function () { liff.closeWindow(); }, delay || 1500);
}

/* ---------- แท็บ ---------- */
const TABS = { current: null, onShow: {} };
function setupTabs(defs, initial) {
  const nav = $('tabs');
  nav.innerHTML = defs.map(function (d) {
    return '<button type="button" data-go="' + d[0] + '"' + (d[2] === false ? ' class="hidden"' : '') + '>' + esc(d[1]) + '</button>';
  }).join('');
  nav.addEventListener('click', function (ev) {
    const b = ev.target.closest('button[data-go]');
    if (b) showTab(b.getAttribute('data-go'));
  });
  const valid = defs.filter(function (d) { return d[2] !== false; }).map(function (d) { return d[0]; });
  showTab(valid.indexOf(initial) >= 0 ? initial : valid[0]);
}
function showTab(id) {
  TABS.current = id;
  document.querySelectorAll('#tabs button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-go') === id); });
  document.querySelectorAll('section[data-tab]').forEach(function (s) { s.classList.toggle('on', s.getAttribute('data-tab') === id); });
  document.querySelectorAll('.bar[data-for]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-for') === id); });
  window.scrollTo(0, 0);
  if (TABS.onShow[id]) Promise.resolve(TABS.onShow[id]()).catch(handleError);
}

/* ---------- ปฏิทินรายเดือน ---------- */
/**
 * วาดปฏิทินเดือน y/m (m = 0..11) ลงใน el
 * info(dateStr) → { label: 'x นัด', has: bool, aria: '...' }
 */
function renderMonth(el, y, m, selected, info, onPick) {
  const first = new Date(y, m, 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(y, m + 1, 0).getDate();
  const today = ymd(new Date());
  let html = ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'].map(function (d) { return '<span class="dow">' + d + '</span>'; }).join('');
  for (let i = 0; i < lead; i++) html += '<span class="blank"></span>';
  for (let d = 1; d <= days; d++) {
    const ds = y + '-' + pad2(m + 1) + '-' + pad2(d);
    const x = info(ds) || {};
    const cls = [x.has ? 'has' : '', ds === today ? 'today' : '', ds === selected ? 'sel' : ''].join(' ');
    html += '<button type="button" class="' + cls + '" data-day="' + ds + '" aria-label="' + esc(thDate(ds) + ' ' + (x.aria || x.label || '')) + '">' +
      '<span>' + d + '</span><span class="n">' + esc(x.label || '') + '</span>' + (x.extra || '') + '</button>';
  }
  el.innerHTML = html;
  el.onclick = function (ev) {
    const b = ev.target.closest('button[data-day]');
    if (b) onPick(b.getAttribute('data-day'));
  };
}

function monthTitle(y, m) { return TH_MONTH[m] + ' ' + (y + 543); }

function statusPill(text) {
  const map = {
    'อนุมัติแล้ว': 'ok', 'ยืนยันแล้ว': 'ok', 'ว่าง': 'ok', 'Active': 'ok',
    'รออนุมัติ': 'wait', 'รอพยาบาลยืนยัน': 'wait', 'จองแล้ว': 'wait',
    'จัดรถแล้ว': 'info', 'Admit แล้ว': 'info', 'มีผู้ป่วย': 'info',
    'เสร็จสิ้น': 'done', 'Discharge แล้ว': 'done', 'ทำความสะอาด': 'done',
    'ยกเลิก': 'bad', 'ปิดปรับปรุง': 'bad', 'ซ่อมบำรุง': 'bad'
  };
  return '<span class="pill ' + (map[text] || 'done') + '">' + esc(text) + '</span>';
}

/** อ่านค่าจากฟอร์มตาม name */
function formData(form) {
  const o = {};
  Array.prototype.forEach.call(form.elements, function (el) {
    if (!el.name) return;
    if (el.type === 'checkbox') o[el.name] = el.checked;
    else if (el.type !== 'file') o[el.name] = el.value.trim();
  });
  return o;
}

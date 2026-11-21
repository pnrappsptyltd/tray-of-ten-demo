// Validation prototype — see docs/08-validation-plan.md section 3.
// Plain DOM, no dependencies, no network, no analytics. Everything stays in localStorage on this device.

const TARGET = 10;
const STAGES = ['see', 'see', 'peek', 'peek', 'closed'];   // fixed sequence per shift (comparable across children)
const START_POOL = [3, 7, 4, 8, 6, 5, 2, 9];
const STORE_KEY = 'bakery-proto-v1';
const PEEK_MS = 2500;
const HINT_MS = 8000;

const app = document.getElementById('app');
const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
const wait = (ms) => new Promise(r => setTimeout(r, ms));

// ---------- storage ----------
function load() { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || { shifts: [], forms: [] }; } catch { return { shifts: [], forms: [] }; } }
function save(data) { try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch { /* private mode: keep going */ } }

// ---------- speech & sound ----------
let voice = null;
function pickVoice() {
  const vs = speechSynthesis.getVoices();
  voice = vs.find(v => /en[-_]AU/i.test(v.lang)) || vs.find(v => /en[-_]GB/i.test(v.lang)) || vs.find(v => /^en/i.test(v.lang)) || null;
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function speak(text, { interrupt = true } = {}) {
  if (!('speechSynthesis' in window)) return;
  if (interrupt) speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  if (voice) u.voice = voice;
  u.rate = 0.92; u.pitch = 1.05;
  speechSynthesis.speak(u);
}
let audioCtx = null;
function pop(freq = 520) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, audioCtx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.18);
    o.connect(g).connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + 0.2);
  } catch { /* no audio */ }
}
const WORDS = ['zero','one','two','three','four','five','six','seven','eight','nine','ten'];

// ---------- session state ----------
let shift = null;          // current shift record
let visitReplays = 0;      // how many times "Open again" was chosen in this visit

function newShift() {
  shift = { id: Date.now(), startedAt: new Date().toISOString(), replayIndex: visitReplays, orders: [], choice: null };
  const pool = [...START_POOL].sort(() => Math.random() - 0.5);
  shift.plan = STAGES.map((stage, i) => ({ stage, start: pool[i] }));
}

// ---------- screens ----------
function clear() { app.innerHTML = ''; }

function screenStart() {
  clear();
  const s = el('section', 'screen');
  s.append(el('h1', null, 'The bakery'), el('p', null, 'Customers tell you what they want. You fill the tray.'));
  const b = el('button', 'bigBtn', 'Open the bakery');
  b.onclick = () => { pop(440); newShift(); runOrder(0); };
  s.append(b);
  const t = el('a', 'tiny', 'tester'); t.href = '#results';
  app.append(s, t);
}

function screenShiftEnd() {
  clear();
  const s = el('section', 'screen');
  s.append(el('h1', null, "Shop's closed."));
  const shelf = el('div', 'shelf');
  shift.orders.forEach(() => shelf.append(el('div', 'box', '10')));
  s.append(shelf);
  s.append(el('p', null, 'Open again tomorrow, or stop for today?'));
  const row = el('div', 'row');
  const again = el('button', 'bigBtn plain', 'Open again');
  const stop = el('button', 'bigBtn plain', 'Stop for today');
  // Neutral: same style, random order, no suggestion.
  if (Math.random() < 0.5) row.append(again, stop); else row.append(stop, again);
  again.onclick = () => { record('replay'); visitReplays++; newShift(); runOrder(0); };
  stop.onclick = () => { record('stop'); screenGoodnight(); };
  s.append(row);
  app.append(s);
  speak("Shop's closed. Open again tomorrow, or stop for today?");
  function record(choice) {
    shift.choice = choice; shift.endedAt = new Date().toISOString();
    const data = load(); data.shifts.push(shift); save(data);
  }
}

function screenGoodnight() {
  clear();
  const s = el('section', 'screen');
  s.append(el('h1', null, 'Goodnight, bakery.'), el('p', null, 'See you next time.'));
  const b = el('button', 'bigBtn plain', 'Back to the start');
  b.onclick = () => { visitReplays = 0; screenStart(); };
  s.append(b);
  const t = el('a', 'tiny', 'tester'); t.href = '#results';
  app.append(s, t);
  speak('Goodnight, bakery.');
}

// ---------- gameplay ----------
function runOrder(index) {
  if (index >= shift.plan.length) { screenShiftEnd(); return; }
  const { stage, start } = shift.plan[index];
  const rec = { index, stage, start, attempts: 0, firstAnswer: null, correctFirst: null, msToFirstAction: null,
                msTotal: null, usedFallback: false, hintShown: false, noActionAt10s: false };
  const t0 = performance.now();
  let count = start, done = false, firstActionAt = null, hintTimer = null, idleTimer = null;

  clear();
  const bar = el('div', 'topbar');
  bar.append(el('span', null, `Order ${index + 1} of ${shift.plan.length}`));
  const exit = el('button', null, '✕'); exit.title = 'Stop (tester)';
  exit.onclick = () => { if (confirm('Stop this shift? (tester only)')) { speechSynthesis.cancel(); screenStart(); } };
  bar.append(exit);

  const game = el('section', 'game');
  // order card
  const order = el('div', 'order');
  const face = el('div', 'customer waiting'); face.append(el('span', 'mouth'));
  const num = el('div', 'num', String(TARGET));
  const dots = el('div', 'dots'); for (let i = 0; i < TARGET; i++) dots.append(el('i'));
  const spk = el('button', 'speak', '🔊'); spk.setAttribute('aria-label', 'Say the order again');
  spk.onclick = () => sayOrder();
  order.append(face, num, dots, spk);

  // tray + door
  const trayWrap = el('div', 'trayWrap');
  const tray = el('div', 'tray');
  const cells = [];
  for (let i = 0; i < TARGET; i++) {
    const c = el('div', 'cell' + (i < start ? '' : ' empty'));
    if (i < start) c.append(el('div', 'cake'));
    c.onclick = () => { if (c.classList.contains('empty') && inputMode === 'cakes') place(c, 'tap-cell'); };
    cells.push(c); tray.append(c);
  }
  const door = el('div', 'door');
  door.append(el('div', 'big', String(start)), el('div', 'sub', 'in the oven'));
  tray.append(door);
  trayWrap.append(tray);

  // oven
  const oven = el('div', 'oven');
  const win = el('div', 'window', '');
  oven.append(el('div', null, 'OVEN'), win);

  // rack (cakes or numbers)
  const rack = el('div', 'rack');
  game.append(order, trayWrap, oven, rack);
  app.append(bar, game);

  let inputMode = 'cakes';

  function sayOrder() {
    if (stage === 'see') speak(`Ten cupcakes, please. Fill the tray.`);
    else if (stage === 'peek') speak(`Ten cupcakes, please. Look at the tray. ${WORDS[start]} are in the oven. How many more?`);
    else speak(`Ten cupcakes, please. ${WORDS[start]} are in the oven. How many more?`);
  }

  function noteAction() {
    if (firstActionAt == null) { firstActionAt = performance.now(); rec.msToFirstAction = Math.round(firstActionAt - t0); }
    clearTimeout(hintTimer); clearTimeout(idleTimer);
  }

  function showCakeRack() {
    inputMode = 'cakes'; rack.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const b = el('button', 'cakeBtn'); b.setAttribute('aria-label', 'cupcake');
      b.append(el('div', 'cake'));
      attachDrag(b);
      rack.append(b);
    }
  }

  function showNumberShelf() {
    inputMode = 'numbers'; rack.innerHTML = '';
    const shelf = el('div', 'numShelf');
    for (let n = 1; n <= 9; n++) {
      const b = el('button', 'numBtn'); b.setAttribute('aria-label', `${n} more`);
      const mini = el('div', 'mini'); for (let i = 0; i < 10; i++) mini.append(el('i', i < n ? '' : 'off'));
      b.append(el('b', null, String(n)), mini);
      b.onclick = () => answer(n, b);
      shelf.append(b);
    }
    rack.append(shelf);
  }

  // drag from rack: pointer events, single finger, with tap fallback (tap = next empty cell)
  function attachDrag(btn) {
    let ghost = null, sx = 0, sy = 0, moved = false;
    btn.addEventListener('pointerdown', (e) => {
      if (done || inputMode !== 'cakes') return;
      e.preventDefault(); btn.setPointerCapture(e.pointerId);
      sx = e.clientX; sy = e.clientY; moved = false;
      ghost = el('div', 'dragGhost'); ghost.append(el('div', 'cake'));
      ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px';
      document.body.append(ghost);
    });
    btn.addEventListener('pointermove', (e) => {
      if (!ghost) return;
      if (Math.hypot(e.clientX - sx, e.clientY - sy) > 8) moved = true;
      ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px';
    });
    const finish = (e) => {
      if (!ghost) return;
      ghost.remove(); ghost = null;
      if (done) return;
      if (!moved) { const next = cells.find(c => c.classList.contains('empty')); if (next) place(next, 'tap-rack'); return; }
      const target = document.elementFromPoint(e.clientX, e.clientY);
      const cell = target && target.closest('.cell.empty');
      if (cell) place(cell, 'drag');
    };
    btn.addEventListener('pointerup', finish);
    btn.addEventListener('pointercancel', finish);
  }

  function place(cell, how) {
    if (done || !cell.classList.contains('empty')) return;
    noteAction();
    cell.classList.remove('empty', 'hint');
    const cake = el('div', 'cake pop'); cell.append(cake);
    count++; rec.attempts++;
    pop(380 + count * 28);
    speak(WORDS[count]);
    if (count >= TARGET) complete();
  }

  function answer(n, btn) {
    if (done || inputMode !== 'numbers') return;
    noteAction();
    rec.attempts++;
    const correct = (start + n === TARGET);
    if (rec.firstAnswer == null) { rec.firstAnswer = n; rec.correctFirst = correct; }
    if (correct) {
      pop(660);
      speak(`${WORDS[n]} more!`);
      inputMode = 'locked';
      openDoor().then(() => fillAnimated(n)).then(complete);
    } else {
      // No buzzer. The door opens so the child can see and count on.
      rec.usedFallback = true;
      btn.classList.add('dim');
      speak(`Let's look. ${WORDS[start]} in the tray. Count on.`);
      openDoor().then(() => showCakeRack());
    }
  }

  function closeDoor() { door.classList.add('closed'); win.classList.add('lit'); win.textContent = String(start); return wait(480); }
  function openDoor() { door.classList.remove('closed'); win.classList.remove('lit'); win.textContent = ''; return wait(480); }

  async function fillAnimated(n) {
    for (let i = 0; i < n; i++) {
      const c = cells.find(x => x.classList.contains('empty'));
      if (!c) break;
      c.classList.remove('empty'); c.append(el('div', 'cake pop'));
      count++; pop(380 + count * 28); speak(WORDS[count]);
      await wait(520);
    }
  }

  async function complete() {
    if (done) return; done = true;
    clearTimeout(hintTimer); clearTimeout(idleTimer);
    rec.msTotal = Math.round(performance.now() - t0);
    shift.orders.push(rec);
    face.classList.remove('waiting'); face.classList.add('happy');
    dots.querySelectorAll('i').forEach(d => d.style.background = 'var(--leaf)');
    speak('Ten! Thank you!', { interrupt: false });
    await wait(1400);
    runOrder(index + 1);
  }

  // ---- stage start ----
  (async () => {
    sayOrder();
    if (stage === 'see') {
      showCakeRack();
      hintTimer = setTimeout(() => { rec.hintShown = true; cells.filter(c => c.classList.contains('empty')).forEach(c => c.classList.add('hint')); }, HINT_MS);
    } else if (stage === 'peek') {
      rack.innerHTML = '';
      await wait(PEEK_MS);
      if (done) return;
      await closeDoor();
      showNumberShelf();
      idleTimer = setTimeout(() => { rec.noActionAt10s = true; }, 10000);
    } else { // closed
      await closeDoor();
      showNumberShelf();
      idleTimer = setTimeout(() => { rec.noActionAt10s = true; }, 10000);
    }
  })();
}

// ---------- tester results view ----------
function screenResults() {
  clear();
  const data = load();
  const s = el('section', 'results');
  s.append(el('h1', null, 'Tester results (this device only)'));
  const summary = el('p');
  const n = data.shifts.length;
  const replays = data.shifts.filter(x => x.choice === 'replay').length;
  const orders = data.shifts.flatMap(x => x.orders);
  const hidden = orders.filter(o => o.stage !== 'see');
  const firstTry = hidden.filter(o => o.correctFirst).length;
  const fallback = hidden.filter(o => o.usedFallback).length;
  const noAct = hidden.filter(o => o.noActionAt10s).length;
  summary.innerHTML = `Shifts: <b>${n}</b> · chose "Open again": <b>${replays}</b> · hidden-tray orders: <b>${hidden.length}</b> (correct first try <b>${firstTry}</b>, needed to see the tray <b>${fallback}</b>, no action within 10 s <b>${noAct}</b>) · forms: <b>${data.forms.length}</b>`;
  s.append(summary);

  const tbl = el('table');
  tbl.innerHTML = '<tr><th>#</th><th>Started</th><th>Replay index</th><th>Orders (stage / start → first answer / attempts / s)</th><th>Choice</th></tr>';
  data.shifts.forEach((sh, i) => {
    const tr = el('tr');
    const od = sh.orders.map(o => {
      const ans = o.stage === 'see' ? '' : ` → ${o.firstAnswer ?? '–'}${o.correctFirst ? ' <span class="ok">✓</span>' : o.firstAnswer != null ? ' <span class="no">✗</span>' : ''}${o.usedFallback ? ' (saw tray)' : ''}`;
      return `${o.stage} ${o.start}${ans} · ${o.attempts} · ${(o.msTotal / 1000).toFixed(0)}s${o.hintShown ? ' · hint' : ''}${o.noActionAt10s ? ' · idle10' : ''}`;
    }).join('<br>');
    tr.innerHTML = `<td>${i + 1}</td><td>${new Date(sh.startedAt).toLocaleString()}</td><td>${sh.replayIndex}</td><td>${od || '(incomplete)'}</td><td class="${sh.choice === 'replay' ? 'ok' : ''}">${sh.choice ?? '–'}</td>`;
    tbl.append(tr);
  });
  s.append(tbl);

  if (data.forms.length) {
    const f = el('table');
    f.innerHTML = '<tr><th>When</th><th>Role</th><th>Would share / use</th><th>Would pay A$4.99</th><th>Contact given</th><th>Comment</th></tr>';
    data.forms.forEach(r => { const tr = el('tr'); tr.innerHTML = `<td>${new Date(r.at).toLocaleString()}</td><td>${r.role}</td><td>${r.share}</td><td>${r.pay}</td><td>${r.contact ? 'yes' : 'no'}</td><td>${(r.comment || '').replace(/</g, '&lt;')}</td>`; f.append(tr); });
    s.append(f);
  }

  const row = el('div');
  const copy = el('button', null, 'Copy JSON');
  copy.onclick = async () => { try { await navigator.clipboard.writeText(JSON.stringify(data, null, 2)); copy.textContent = 'Copied'; } catch { pre.hidden = false; } };
  const clr = el('button', null, 'Clear all data');
  clr.onclick = () => { if (confirm('Delete all recorded shifts and forms on this device?')) { localStorage.removeItem(STORE_KEY); screenResults(); } };
  const back = el('button', null, 'Back to game'); back.onclick = () => { location.hash = ''; };
  const teacher = el('button', null, 'Teacher / parent page'); teacher.onclick = () => { location.href = 'teacher.html'; };
  row.append(back, teacher, copy, clr);
  s.append(row);
  const pre = el('pre', null, JSON.stringify(data, null, 2)); pre.hidden = true; s.append(pre);
  app.append(s);
}

// ---------- routing ----------
function route() {
  speechSynthesis && speechSynthesis.cancel();
  if (location.hash === '#results') screenResults(); else screenStart();
}
window.addEventListener('hashchange', route);
route();

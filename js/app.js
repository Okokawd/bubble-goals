/* ============================================================
   app.js – Blasen-Physik, Timer, Dreh-Rad, UI-Steuerung
   ============================================================ */
(() => {
  'use strict';

  // ---- DOM-Referenzen ----
  const stage = document.getElementById('stage');
  const emptyHeute = document.getElementById('empty-heute');
  const gesternView = document.getElementById('gestern-view');
  const gesternList = document.getElementById('gestern-list');
  const statsEl = document.getElementById('stats');
  const addBtn = document.getElementById('add-btn');
  const overlay = document.getElementById('sheet-overlay');
  const form = document.getElementById('goal-form');
  const titelInput = document.getElementById('titel');
  const cancelBtn = document.getElementById('cancel-btn');
  const tabs = document.querySelectorAll('.tab');
  const prioPicker = document.getElementById('priority-picker');
  const wheelH = document.getElementById('wheel-h');
  const wheelM = document.getElementById('wheel-m');
  const wheelReadout = document.getElementById('wheel-readout');

  // ---- Zustand ----
  const bubbles = new Map();      // id -> Blasen-Objekt (aktive Blasen)
  let currentView = 'heute';
  let selectedPrio = 'mittel';

  // Durchmesser der Blase nach Priorität (px)
  const SIZE = { niedrig: 104, mittel: 132, hoch: 164 };

  // Physik-Konstanten (px pro Sekunde)
  const MAX_SPEED = 42;
  const MIN_SPEED = 14;
  const WANDER = 26;   // wie stark der Kurs zufällig variiert

  // Aktuelle Bühnengröße robust ermitteln
  function stageSize() {
    const r = stage.getBoundingClientRect();
    return {
      w: r.width > 40 ? r.width : window.innerWidth,
      h: r.height > 40 ? r.height : window.innerHeight,
    };
  }

  // Startposition finden, die möglichst weit von bestehenden Blasen entfernt ist
  // (verhindert, dass neue Blasen aufeinander gestapelt starten)
  function spawnPos(size, w, h) {
    const maxX = Math.max(w - size, 0);
    const maxY = Math.max(h - size, 0);
    if (bubbles.size === 0) {
      return { x: Math.random() * maxX, y: Math.random() * maxY };
    }
    let best = null, bestDist = -1;
    for (let i = 0; i < 12; i++) {
      const x = Math.random() * maxX;
      const y = Math.random() * maxY;
      let nearest = Infinity;
      bubbles.forEach((o) => {
        nearest = Math.min(nearest, Math.hypot(o.x - x, o.y - y));
      });
      if (nearest > bestDist) { bestDist = nearest; best = { x, y }; }
    }
    return best;
  }

  // ============================================================
  //  Blase erzeugen
  // ============================================================
  function makeBubble(goal) {
    const el = document.createElement('div');
    el.className = `bubble prio-${goal.prioritaet}`;
    const size = SIZE[goal.prioritaet] || 132;
    el.style.width = size + 'px';
    el.style.height = size + 'px';
    el.innerHTML =
      `<div class="bubble-shine"></div>` +
      `<span class="b-title"></span><span class="b-timer"></span>`;
    el.querySelector('.b-title').textContent = goal.titel;

    const { w, h } = stageSize();
    const pos = spawnPos(size, w, h);

    // Startrichtung zufällig, aber mit klarer Geschwindigkeit
    const dir = Math.random() * Math.PI * 2;
    const speed = MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED);

    const b = {
      id: goal.id,
      goal,
      el,
      size,
      x: pos.x,
      y: pos.y,
      vx: Math.cos(dir) * speed,
      vy: Math.sin(dir) * speed,
      phase: Math.random() * Math.PI * 2,
      t: 0,
      born: performance.now(),
      timerEl: el.querySelector('.b-timer'),
      lastLabel: '',
      warned: false,
    };

    el.addEventListener('click', () => complete(b));

    stage.appendChild(el);
    bubbles.set(goal.id, b);
    updateTimer(b);
    return b;
  }

  // ============================================================
  //  Physik-Schleife (requestAnimationFrame)
  // ============================================================
  function easeOutBack(p) {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
  }

  let lastTime = performance.now();
  function loop(now) {
    let dt = (now - lastTime) / 1000; // Sekunden
    lastTime = now;
    if (dt > 0.05) dt = 0.05;         // nach Tab-Wechsel nicht springen

    const { w, h } = stageSize();

    bubbles.forEach((b) => {
      if (b.popping) return;

      // leichtes, zufälliges Umherwandern
      b.vx += (Math.random() - 0.5) * WANDER * dt;
      b.vy += (Math.random() - 0.5) * WANDER * dt;

      // Geschwindigkeit begrenzen und sanft am Leben halten
      let sp = Math.hypot(b.vx, b.vy);
      if (sp > MAX_SPEED) { b.vx = (b.vx / sp) * MAX_SPEED; b.vy = (b.vy / sp) * MAX_SPEED; }
      else if (sp < MIN_SPEED && sp > 0.01) { b.vx = (b.vx / sp) * MIN_SPEED; b.vy = (b.vy / sp) * MIN_SPEED; }

      b.x += b.vx * dt;
      b.y += b.vy * dt;

      // sanft von den Rändern abprallen
      const maxX = w - b.size, maxY = h - b.size;
      if (b.x <= 0) { b.x = 0; b.vx = Math.abs(b.vx); }
      else if (b.x >= maxX) { b.x = maxX; b.vx = -Math.abs(b.vx); }
      if (b.y <= 0) { b.y = 0; b.vy = Math.abs(b.vy); }
      else if (b.y >= maxY) { b.y = maxY; b.vy = -Math.abs(b.vy); }

      // organisches Schweben (kleine Sinus-Bewegung obendrauf)
      b.t += dt;
      const swayX = Math.sin(b.t * 0.9 + b.phase) * 7;
      const swayY = Math.cos(b.t * 0.7 + b.phase) * 6;

      // Einblenden beim Erscheinen (Wachsen + sanft sichtbar werden)
      const age = now - b.born;
      let scale = 1, opacity = 1;
      if (age < 550) {
        const p = age / 550;
        scale = 0.2 + 0.8 * easeOutBack(p);
        opacity = Math.min(1, age / 300);
      }
      b.el.style.opacity = opacity;
      b.el.style.transform =
        `translate3d(${b.x + swayX}px, ${b.y + swayY}px, 0) scale(${scale})`;
    });

    requestAnimationFrame(loop);
  }

  // ============================================================
  //  Countdown-Timer
  // ============================================================
  function fmt(ms) {
    if (ms < 0) ms = 0;
    const totalSec = Math.ceil(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    if (m >= 60) {
      const hh = Math.floor(m / 60);
      const mm = m % 60;
      return `${hh}:${String(mm).padStart(2, '0')} h`;
    }
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function updateTimer(b) {
    const remaining = b.goal.ablaufZeit - Date.now();
    const label = fmt(remaining);
    if (label !== b.lastLabel) {
      b.timerEl.textContent = label;
      b.lastLabel = label;
    }
    if (remaining <= 15000 && !b.warned) {
      b.warned = true;
      b.el.classList.add('b-warn');
    }
    if (remaining <= 0 && !b.popping) burst(b);
  }

  setInterval(() => {
    bubbles.forEach((b) => { if (!b.popping) updateTimer(b); });
  }, 500);

  // ============================================================
  //  Erledigen (Erfolg) & Zerplatzen (Zeit abgelaufen)
  // ============================================================
  function freezePosition(b) {
    // aktuelle Position für die Pop-/Burst-Animation festhalten
    b.el.style.opacity = 1;
    b.el.style.setProperty('--x', b.x + 'px');
    b.el.style.setProperty('--y', b.y + 'px');
    b.el.style.transform = `translate3d(${b.x}px, ${b.y}px, 0) scale(1)`;
  }

  function complete(b) {
    if (b.popping) return;
    b.popping = true;
    Store.setStatus(b.goal.id, 'erledigt');
    freezePosition(b);
    spawnParticles(b, 'success');
    b.el.classList.add('pop');
    finishRemoval(b);
  }

  function burst(b) {
    if (b.popping) return;
    b.popping = true;
    Store.setStatus(b.goal.id, 'geplatzt');
    freezePosition(b);
    spawnParticles(b, 'fail');
    b.el.classList.add('burst');
    finishRemoval(b);
  }

  function finishRemoval(b) {
    setTimeout(() => {
      b.el.remove();
      bubbles.delete(b.id);
      updateEmptyHint();
    }, 420);
  }

  // Partikel: Glitzer (Erfolg) oder Tröpfchen (Platzen)
  function spawnParticles(b, type) {
    const cx = b.x + b.size / 2;
    const cy = b.y + b.size / 2;
    const count = type === 'success' ? 16 : 12;
    const colors = type === 'success'
      ? ['#ffd977', '#ffffff', '#a5f3d0', '#c4b5ff', '#ffc4e0']
      : ['#b7c7ff', '#d9c7ff', '#e6d6ff', '#ffffff'];

    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      p.style.background = colors[i % colors.length];
      const s = type === 'success' ? 5 + Math.random() * 6 : 6 + Math.random() * 8;
      p.style.width = p.style.height = s + 'px';
      if (type === 'fail') p.style.borderRadius = '48% 52% 60% 40%';
      stage.appendChild(p);

      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const dist = (type === 'success' ? 65 : 45) + Math.random() * 45;
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist + (type === 'fail' ? 34 : 0);

      p.animate(
        [
          { transform: `translate(${cx}px, ${cy}px) scale(1)`, opacity: 1 },
          { transform: `translate(${cx + dx}px, ${cy + dy}px) scale(0)`, opacity: 0 },
        ],
        { duration: type === 'success' ? 720 : 620, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' }
      ).onfinish = () => p.remove();
    }
  }

  // ============================================================
  //  Ansichten: Heute / Gestern
  // ============================================================
  function updateEmptyHint() {
    if (currentView !== 'heute') return;
    emptyHeute.classList.toggle('hidden', bubbles.size > 0);
  }

  function renderHeute() {
    const goals = Store.forDay(Store.today()).filter((g) => g.status === 'aktiv');
    goals.forEach((g) => { if (!bubbles.has(g.id)) makeBubble(g); });
    updateEmptyHint();
  }

  function renderGestern() {
    const goals = Store.forDay(Store.yesterday());
    const done = goals.filter((g) => g.status === 'erledigt').length;
    const total = goals.length;
    const quote = total ? Math.round((done / total) * 100) : 0;

    if (total === 0) {
      statsEl.innerHTML = '';
      gesternList.innerHTML =
        '<li class="empty-gestern">Gestern gab es keine Ziele.</li>';
      return;
    }

    statsEl.innerHTML =
      `<div class="stats-ring">${quote}%</div>` +
      `<div class="stats-sub">${done} von ${total} Zielen erreicht</div>`;

    gesternList.innerHTML = goals
      .map((g) => {
        const ok = g.status === 'erledigt';
        return (
          `<li class="gestern-item">` +
          `<div class="gestern-icon ${ok ? 'done' : 'fail'}">${ok ? '✓' : '✕'}</div>` +
          `<div class="gestern-text">` +
          `<div class="gestern-title">${escapeHtml(g.titel)}</div>` +
          `<div class="gestern-meta">${prioLabel(g.prioritaet)} · ${fmtDuration(g.dauerMinuten)} · ${ok ? 'Erledigt' : 'Zeit abgelaufen'}</div>` +
          `</div></li>`
        );
      })
      .join('');
  }

  function prioLabel(p) {
    return { niedrig: 'Niedrig', mittel: 'Mittel', hoch: 'Hoch' }[p] || p;
  }
  function fmtDuration(min) {
    if (min >= 60) {
      const h = Math.floor(min / 60), m = min % 60;
      return m ? `${h} Std ${m} Min` : `${h} Std`;
    }
    return `${min} Min`;
  }
  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function switchView(view) {
    currentView = view;
    tabs.forEach((t) => t.classList.toggle('is-active', t.dataset.view === view));

    if (view === 'heute') {
      stage.classList.remove('hidden');
      addBtn.classList.remove('hidden');
      gesternView.classList.add('hidden');
      renderHeute();
    } else {
      stage.classList.add('hidden');
      emptyHeute.classList.add('hidden');
      addBtn.classList.add('hidden');
      gesternView.classList.remove('hidden');
      renderGestern();
    }
  }

  // ============================================================
  //  Dreh-Rad (Std : Min)
  // ============================================================
  const ITEM_H = 40;
  const MAX_H = 6;   // 0–6 Stunden
  const MAX_M = 59;  // 0–59 Minuten

  function buildWheel(el, max) {
    let html = '';
    for (let i = 0; i <= max; i++) {
      html += `<div class="wheel-item" data-val="${i}">${String(i).padStart(2, '0')}</div>`;
    }
    el.innerHTML = html;
  }

  function wheelValue(el) {
    return Math.max(0, Math.round(el.scrollTop / ITEM_H));
  }

  function setWheel(el, val) {
    el.scrollTop = val * ITEM_H;
    markSelected(el, val);
  }

  function markSelected(el, val) {
    el.querySelectorAll('.wheel-item').forEach((it) =>
      it.classList.toggle('is-sel', +it.dataset.val === val));
  }

  function totalMinutes() {
    return wheelValue(wheelH) * 60 + wheelValue(wheelM);
  }

  function updateReadout() {
    const m = totalMinutes();
    wheelReadout.textContent = m < 1 ? '– Zeit wählen –' : fmtDuration(m);
  }

  function onWheelScroll(el) {
    const val = wheelValue(el);
    markSelected(el, val);
    updateReadout();
  }

  // Scroll-Ereignisse (mit kleiner Entprellung fürs Nachschnappen)
  let hTimer, mTimer;
  wheelH.addEventListener('scroll', () => {
    markSelected(wheelH, wheelValue(wheelH));
    updateReadout();
    clearTimeout(hTimer);
    hTimer = setTimeout(() => onWheelScroll(wheelH), 90);
  }, { passive: true });
  wheelM.addEventListener('scroll', () => {
    markSelected(wheelM, wheelValue(wheelM));
    updateReadout();
    clearTimeout(mTimer);
    mTimer = setTimeout(() => onWheelScroll(wheelM), 90);
  }, { passive: true });

  // Direkt auf eine Zahl tippen -> dorthin scrollen
  function wheelTapHandler(el) {
    return (e) => {
      const it = e.target.closest('.wheel-item');
      if (!it) return;
      el.scrollTo({ top: +it.dataset.val * ITEM_H, behavior: 'smooth' });
    };
  }
  wheelH.addEventListener('click', wheelTapHandler(wheelH));
  wheelM.addEventListener('click', wheelTapHandler(wheelM));

  buildWheel(wheelH, MAX_H);
  buildWheel(wheelM, MAX_M);

  // ============================================================
  //  Formular-Sheet
  // ============================================================
  function openSheet() {
    overlay.classList.remove('hidden');
    // Räder auf Standard 0 Std / 15 Min setzen (nach dem Sichtbarwerden)
    requestAnimationFrame(() => {
      setWheel(wheelH, 0);
      setWheel(wheelM, 15);
      updateReadout();
    });
    setTimeout(() => titelInput.focus(), 350);
  }
  function closeSheet() {
    overlay.classList.add('hidden');
    form.reset();
    selectedPrio = 'mittel';
    prioPicker.querySelectorAll('.prio').forEach((el) =>
      el.classList.toggle('is-active', el.dataset.prio === 'mittel'));
  }

  // ============================================================
  //  Events
  // ============================================================
  addBtn.addEventListener('click', openSheet);
  cancelBtn.addEventListener('click', closeSheet);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeSheet(); });

  tabs.forEach((t) =>
    t.addEventListener('click', () => switchView(t.dataset.view)));

  prioPicker.addEventListener('click', (e) => {
    const btn = e.target.closest('.prio');
    if (!btn) return;
    selectedPrio = btn.dataset.prio;
    prioPicker.querySelectorAll('.prio').forEach((el) =>
      el.classList.toggle('is-active', el === btn));
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const titel = titelInput.value.trim();
    if (!titel) return;
    const min = Math.max(1, totalMinutes()); // mindestens 1 Minute
    const goal = Store.add({
      titel,
      prioritaet: selectedPrio,
      dauerMinuten: min,
    });
    closeSheet();
    if (currentView === 'heute') makeBubble(goal);
    updateEmptyHint();
  });

  // ============================================================
  //  Start
  // ============================================================
  Store.cleanup();
  switchView('heute');
  requestAnimationFrame((t) => { lastTime = t; loop(t); });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      Store.cleanup();
      lastTime = performance.now();
      bubbles.forEach((b) => { if (!b.popping) updateTimer(b); });
    }
  });
})();

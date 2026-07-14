/* ============================================================
   store.js – Speichern & Laden der Ziele (localStorage)
   ============================================================ */
const Store = (() => {
  const KEY = 'bubble-goals-v1';

  // Datum als "YYYY-MM-DD" (lokale Zeit)
  function today() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }

  function yesterday() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }

  function loadAll() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function saveAll(goals) {
    localStorage.setItem(KEY, JSON.stringify(goals));
  }

  // Beim Start aufräumen: abgelaufene aktive Ziele als "geplatzt" markieren,
  // und alte Ziele (älter als gestern) entfernen.
  function cleanup() {
    const goals = loadAll();
    const now = Date.now();
    const keepFrom = yesterday();
    let changed = false;

    const kept = goals.filter((g) => g.tag >= keepFrom);
    if (kept.length !== goals.length) changed = true;

    kept.forEach((g) => {
      if (g.status === 'aktiv' && now >= g.ablaufZeit) {
        g.status = 'geplatzt';
        changed = true;
      }
    });

    if (changed) saveAll(kept);
    return kept;
  }

  function add({ titel, prioritaet, dauerMinuten }) {
    const goals = loadAll();
    const start = Date.now();
    const goal = {
      id: start + '-' + Math.random().toString(36).slice(2, 7),
      titel: titel.trim(),
      prioritaet,
      dauerMinuten,
      startZeit: start,
      ablaufZeit: start + dauerMinuten * 60 * 1000,
      status: 'aktiv',
      tag: today(),
    };
    goals.push(goal);
    saveAll(goals);
    return goal;
  }

  function setStatus(id, status) {
    const goals = loadAll();
    const g = goals.find((x) => x.id === id);
    if (g) {
      g.status = status;
      saveAll(goals);
    }
  }

  function forDay(tag) {
    return loadAll().filter((g) => g.tag === tag);
  }

  return {
    today,
    yesterday,
    cleanup,
    add,
    setStatus,
    forDay,
    loadAll,
  };
})();

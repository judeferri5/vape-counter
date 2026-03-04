/* Vape Counter PWA — local-only storage */

const STORAGE_KEY = "vapeCounter.v2"; // bumped due to new fields

const $ = (id) => document.getElementById(id);

const state = loadState();

const els = {
  todayLabel: $("todayLabel"),
  todayCount: $("todayCount"),
  goalLine: $("goalLine"),
  streakVal: $("streakVal"),
  weekTotal: $("weekTotal"),
  spendVal: $("spendVal"),
  logList: $("logList"),
  logMeta: $("logMeta"),
  chart: $("weekChart"),
  chartHint: $("chartHint"),

  logBtn: $("logBtn"),
  delayBtn: $("delayBtn"),
  delaySub: $("delaySub"),
  delayPanel: $("delayPanel"),
  delayCountdown: $("delayCountdown"),
  delayMsg: $("delayMsg"),
  cancelDelayBtn: $("cancelDelayBtn"),

  undoBtn: $("undoBtn"),
  clearTodayBtn: $("clearTodayBtn"),
  exportBtn: $("exportBtn"),
  importFile: $("importFile"),
  wipeAllBtn: $("wipeAllBtn"),

  settingsModal: $("settingsModal"),
  openSettingsBtn: $("openSettingsBtn"),
  closeSettingsBtn: $("closeSettingsBtn"),
  goalInput: $("goalInput"),
  costInput: $("costInput"),
  delayMinutesInput: $("delayMinutesInput"),
  quickModeToggle: $("quickModeToggle"),
  offlineToggle: $("offlineToggle"),
  saveSettingsBtn: $("saveSettingsBtn"),
  resetSettingsBtn: $("resetSettingsBtn"),

  toggleQuickBtn: $("toggleQuickBtn"),
};

let countdownTimer = null;

init();
renderAll();

function init() {
  els.logBtn.addEventListener("click", () => {
    if (isLocked()) return;
    addHit();
    haptic();
  });

  els.delayBtn.addEventListener("click", () => {
    startDelay();
    haptic();
  });

  els.cancelDelayBtn.addEventListener("click", () => {
    cancelDelay();
    haptic();
  });

  els.undoBtn.addEventListener("click", () => {
    undoLast();
    haptic();
  });

  els.clearTodayBtn.addEventListener("click", () => {
    if (!confirm("Clear all hits for today?")) return;
    clearToday();
  });

  els.exportBtn.addEventListener("click", exportData);
  els.importFile.addEventListener("change", importData);

  els.wipeAllBtn.addEventListener("click", () => {
    if (!confirm("Wipe ALL data? This cannot be undone.")) return;
    wipeAll();
  });

  // settings modal
  els.openSettingsBtn.addEventListener("click", openSettings);
  els.closeSettingsBtn.addEventListener("click", closeSettings);
  els.settingsModal.addEventListener("click", (e) => {
    if (e.target === els.settingsModal) closeSettings();
  });

  els.saveSettingsBtn.addEventListener("click", saveSettingsFromUI);
  els.resetSettingsBtn.addEventListener("click", () => {
    state.settings = defaultSettings();
    state.delayUntil = null;
    persist();
    applyQuickMode();
    closeSettings();
    renderAll();
  });

  // quick mode hot toggle
  els.toggleQuickBtn.addEventListener("click", () => {
    state.settings.quickMode = !state.settings.quickMode;
    persist();
    applyQuickMode();
    renderAll();
  });

  // register SW if user wants offline cache
  if (state.settings.offlineCache) {
    registerSW();
  }

  applyQuickMode();
  syncDelayLoop();
}

function defaultSettings() {
  return {
    dailyGoal: 30,       // hits/day
    costPerHit: 0.03,    // dollars per hit
    delayMinutes: 10,    // minutes
    quickMode: false,    // minimal UI
    offlineCache: false  // user-controlled
  };
}

function loadState() {
  // allow reading older versions too
  const candidates = ["vapeCounter.v2", "vapeCounter.v1"];
  for (const key of candidates) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);

      const settings = { ...defaultSettings(), ...(parsed.settings || {}) };
      const hits = Array.isArray(parsed.hits) ? parsed.hits.filter(x => typeof x === "number") : [];
      const delayUntil = (typeof parsed.delayUntil === "number") ? parsed.delayUntil : null;

      // migrate to v2 key
      const s = { hits, settings, delayUntil, chartSelectedDay: null };
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ hits, settings, delayUntil }));
      if (key !== STORAGE_KEY) localStorage.removeItem(key);
      return s;
    } catch {
      // try next
    }
  }
  return { hits: [], settings: defaultSettings(), delayUntil: null, chartSelectedDay: null };
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    hits: state.hits,
    settings: state.settings,
    delayUntil: state.delayUntil
  }));
}

function nowTs() {
  return Date.now();
}

/* Delay / lock logic */

function isLocked() {
  return typeof state.delayUntil === "number" && nowTs() < state.delayUntil;
}

function startDelay() {
  // already running -> restart from now (intentional friction)
  const mins = clampInt(state.settings.delayMinutes, 1, 240);
  state.delayUntil = nowTs() + mins * 60 * 1000;
  persist();
  syncDelayLoop();
  renderAll();
}

function cancelDelay() {
  // this is here mainly for mis-taps; you can remove this if you want it “no escape”
  state.delayUntil = null;
  persist();
  syncDelayLoop();
  renderAll();
}

function syncDelayLoop() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }

  if (!isLocked()) {
    state.delayUntil = null;
    persist();
    els.delayPanel.hidden = true;
    updateLockUI();
    return;
  }

  els.delayPanel.hidden = false;
  updateLockUI();

  countdownTimer = setInterval(() => {
    if (!isLocked()) {
      state.delayUntil = null;
      persist();
      els.delayPanel.hidden = true;
      updateLockUI();
      clearInterval(countdownTimer);
      countdownTimer = null;
      renderAll();
      return;
    }
    updateLockUI();
  }, 250);
}

function updateLockUI() {
  const mins = clampInt(state.settings.delayMinutes, 1, 240);
  els.delaySub.textContent = `${mins}m`;

  const locked = isLocked();
  els.logBtn.disabled = locked;
  // Delay button stays enabled so you can restart a longer delay if you want
  // els.delayBtn.disabled = locked;

  if (!locked) return;

  const msLeft = Math.max(0, state.delayUntil - nowTs());
  els.delayCountdown.textContent = formatCountdown(msLeft);
}

/* Core data actions */

function addHit() {
  state.hits.push(nowTs());
  persist();
  renderAll();
}

function undoLast() {
  if (!state.hits.length) return;
  state.hits.pop();
  persist();
  renderAll();
}

function clearToday() {
  const todayKey = ymd(new Date());
  state.hits = state.hits.filter(ts => ymd(new Date(ts)) !== todayKey);
  persist();
  renderAll();
}

function wipeAll() {
  state.hits = [];
  state.settings = defaultSettings();
  state.delayUntil = null;
  persist();
  applyQuickMode();
  syncDelayLoop();
  renderAll();
}

/* Settings */

function openSettings() {
  els.goalInput.value = String(state.settings.dailyGoal ?? "");
  els.costInput.value = String(state.settings.costPerHit ?? "");
  els.delayMinutesInput.value = String(state.settings.delayMinutes ?? "");
  els.quickModeToggle.checked = !!state.settings.quickMode;
  els.offlineToggle.checked = !!state.settings.offlineCache;

  els.settingsModal.classList.add("open");
  els.settingsModal.setAttribute("aria-hidden", "false");
}

function closeSettings() {
  els.settingsModal.classList.remove("open");
  els.settingsModal.setAttribute("aria-hidden", "true");
}

function saveSettingsFromUI() {
  const goal = parseInt(els.goalInput.value, 10);
  const cost = parseFloat(els.costInput.value);
  const delayMins = parseInt(els.delayMinutesInput.value, 10);

  state.settings.dailyGoal = Number.isFinite(goal) && goal >= 0 ? goal : defaultSettings().dailyGoal;
  state.settings.costPerHit = Number.isFinite(cost) && cost >= 0 ? cost : defaultSettings().costPerHit;
  state.settings.delayMinutes = Number.isFinite(delayMins) ? clampInt(delayMins, 1, 240) : defaultSettings().delayMinutes;

  const offlineWanted = !!els.offlineToggle.checked;
  const prevOffline = !!state.settings.offlineCache;
  state.settings.offlineCache = offlineWanted;

  state.settings.quickMode = !!els.quickModeToggle.checked;

  persist();
  applyQuickMode();
  closeSettings();

  if (offlineWanted && !prevOffline) registerSW();
  if (!offlineWanted && prevOffline) unregisterSW();

  // if delay is running, countdown display should match new delay length label,
  // but we do NOT rewrite the current delay end time—keeps it honest.
  syncDelayLoop();
  renderAll();
}

function applyQuickMode() {
  document.body.classList.toggle("quick", !!state.settings.quickMode);
}

/* Rendering */

function renderAll() {
  renderHeader();
  renderToday();
  renderStats();
  renderLog();
  renderChart();
  syncDelayLoop();
}

function renderHeader() {
  const d = new Date();
  els.todayLabel.textContent = d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function renderToday() {
  const today = ymd(new Date());
  const todayHits = state.hits.filter(ts => ymd(new Date(ts)) === today);

  els.todayCount.textContent = String(todayHits.length);

  const g = state.settings.dailyGoal;
  els.goalLine.textContent = Number.isFinite(g) ? `Goal: ≤ ${g} hits/day` : `Goal: —`;

  // keep the delay badge in sync
  els.delaySub.textContent = `${clampInt(state.settings.delayMinutes, 1, 240)}m`;
}

function renderStats() {
  const days = lastNDays(7);
  const counts = days.map(dayKey => countForDay(dayKey));
  const total = counts.reduce((a,b)=>a+b,0);

  els.weekTotal.textContent = String(total);
  els.spendVal.textContent = dollars(total * (state.settings.costPerHit || 0));

  // streak: consecutive days (ending today) where daily count <= goal
  const goal = state.settings.dailyGoal;
  let streak = 0;

  if (Number.isFinite(goal)) {
    for (let i = 0; i < 3650; i++) {
      const day = shiftDayKey(ymd(new Date()), -i);
      const c = countForDay(day);
      if (c <= goal) streak++;
      else break;
    }
  }
  els.streakVal.textContent = String(streak);
}

function renderLog() {
  const today = ymd(new Date());
  const todays = state.hits
    .filter(ts => ymd(new Date(ts)) === today)
    .slice()
    .reverse();

  els.logMeta.textContent = `${todays.length} hit(s) logged today • total logs: ${state.hits.length}`;

  els.logList.innerHTML = "";
  if (!todays.length) {
    els.logList.innerHTML = `<div class="muted">No hits logged today.</div>`;
    return;
  }

  for (const ts of todays.slice(0, 60)) {
    const d = new Date(ts);
    const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const item = document.createElement("div");
    item.className = "item";
    item.innerHTML = `
      <div class="left">
        <div class="t">${time}</div>
        <div class="s">${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div>
      </div>
      <div class="s">${new Date(ts).toLocaleTimeString([], { second: "2-digit" })}</div>
    `;
    els.logList.appendChild(item);
  }

  if (todays.length > 60) {
    const more = document.createElement("div");
    more.className = "muted";
    more.style.marginTop = "8px";
    more.textContent = `Showing latest 60 of ${todays.length} today.`;
    els.logList.appendChild(more);
  }
}

function renderChart() {
  // In quick mode the weekly card is hidden; skip work.
  if (document.body.classList.contains("quick")) return;

  const canvas = els.chart;
  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();

  const dpr = window.devicePixelRatio || 1;
  const cssW = Math.max(320, Math.floor(rect.width || 680));
  const cssH = 240;
  canvas.style.width = cssW + "px";
  canvas.style.height = cssH + "px";
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.clearRect(0, 0, cssW, cssH);

  const days = lastNDays(7);
  const counts = days.map(k => countForDay(k));
  const max = Math.max(5, ...counts);

  const pad = 18;
  const chartW = cssW - pad*2;
  const chartH = cssH - pad*2 - 10;

  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,.10)";
  ctx.beginPath();
  ctx.moveTo(pad, pad + chartH);
  ctx.lineTo(pad + chartW, pad + chartH);
  ctx.stroke();

  const barGap = 10;
  const barW = (chartW - barGap*(days.length-1)) / days.length;

  const hitAreas = [];

  for (let i = 0; i < days.length; i++) {
    const c = counts[i];
    const x = pad + i*(barW + barGap);
    const h = (c / max) * chartH;
    const y = pad + (chartH - h);

    const selected = state.chartSelectedDay === days[i];

    ctx.fillStyle = selected ? "rgba(34,211,238,.95)" : "rgba(59,130,246,.75)";
    roundRect(ctx, x, y, barW, h, 10);
    ctx.fill();

    const d = fromDayKey(days[i]);
    const lbl = d.toLocaleDateString(undefined, { weekday: "short" });
    ctx.fillStyle = "rgba(233,238,246,.85)";
    ctx.font = "12px ui-sans-serif, system-ui";
    ctx.textAlign = "center";
    ctx.fillText(lbl, x + barW/2, pad + chartH + 18);

    ctx.fillStyle = "rgba(233,238,246,.90)";
    ctx.font = "12px ui-sans-serif, system-ui";
    ctx.fillText(String(c), x + barW/2, Math.max(pad + 12, y - 6));

    hitAreas.push({ day: days[i], x, y: pad, w: barW, h: chartH + 26, count: c });
  }

  canvas.onclick = (ev) => {
    const r = canvas.getBoundingClientRect();
    const cx = ev.clientX - r.left;
    const cy = ev.clientY - r.top;

    const hit = hitAreas.find(a => cx >= a.x && cx <= a.x + a.w && cy >= a.y && cy <= a.y + a.h);
    if (!hit) return;

    state.chartSelectedDay = (state.chartSelectedDay === hit.day) ? null : hit.day;

    if (state.chartSelectedDay) {
      const d = fromDayKey(hit.day);
      els.chartHint.textContent = `${d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}: ${hit.count} hit(s)`;
    } else {
      els.chartHint.textContent = "";
    }
    renderChart();
  };
}

/* Export / import */

function exportData() {
  const payload = {
    version: 2,
    exportedAt: new Date().toISOString(),
    hits: state.hits,
    settings: state.settings,
    delayUntil: state.delayUntil
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `vape-counter-export-${ymd(new Date())}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

async function importData(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);

    if (!parsed || !Array.isArray(parsed.hits)) throw new Error("Bad file format.");

    state.hits = parsed.hits.filter(x => typeof x === "number");
    state.settings = { ...defaultSettings(), ...(parsed.settings || {}) };
    state.delayUntil = (typeof parsed.delayUntil === "number") ? parsed.delayUntil : null;

    persist();
    applyQuickMode();
    syncDelayLoop();
    renderAll();
    alert("Import complete.");
  } catch (err) {
    alert("Import failed: " + (err?.message || "Unknown error"));
  } finally {
    els.importFile.value = "";
  }
}

/* helpers */

function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth()+1).padStart(2,"0");
  const d = String(date.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}

function fromDayKey(key) {
  const [y,m,d] = key.split("-").map(Number);
  return new Date(y, m-1, d);
}

function shiftDayKey(key, deltaDays) {
  const d = fromDayKey(key);
  d.setDate(d.getDate() + deltaDays);
  return ymd(d);
}

function lastNDays(n) {
  const out = [];
  const today = new Date();
  for (let i = n-1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    out.push(ymd(d));
  }
  return out;
}

function countForDay(dayKey) {
  let c = 0;
  for (const ts of state.hits) {
    if (ymd(new Date(ts)) === dayKey) c++;
  }
  return c;
}

function dollars(x) {
  return (x || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x+rr, y);
  ctx.arcTo(x+w, y, x+w, y+h, rr);
  ctx.arcTo(x+w, y+h, x, y+h, rr);
  ctx.arcTo(x, y+h, x, y, rr);
  ctx.arcTo(x, y, x+w, y, rr);
  ctx.closePath();
}

function haptic() {
  if (navigator.vibrate) navigator.vibrate(12);
}

function clampInt(v, lo, hi) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

function formatCountdown(ms) {
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

/* Offline cache control (service worker) */

async function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("./sw.js", { scope: "./" });
  } catch {
    // ignore
  }
}

async function unregisterSW() {
  if (!("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  for (const r of regs) {
    await r.unregister();
  }
}
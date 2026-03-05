/* Habit Tracker — Vapes + Solo Drinking (local-only storage) */

const BUILD = "2026-03-04b";
const STORAGE_KEY = "habitTracker.v1";

const $ = (id) => document.getElementById(id);

/* --------------------------- DOM --------------------------- */
const els = {
  todayLabel: $("todayLabel"),
  appTitle: $("appTitle"),

  tabVape: $("tabVape"),
  tabDrink: $("tabDrink"),
  pageVape: $("pageVape"),
  pageDrink: $("pageDrink"),

  // Vapes
  todayCount: $("todayCount"),
  goalLine: $("goalLine"),
  streakVal: $("streakVal"),
  streakSub: $("streakSub"),
  weekTotal: $("weekTotal"),
  spendVal: $("spendVal"),
  logList: $("logList"),
  logMeta: $("logMeta"),
  chart: $("weekChart"),
  chartHint: $("chartHint"),
  longChart: $("longChart"),
  longHint: $("longHint"),
  rangePills: $("rangePills"),
  lifeHits: $("lifeHits"),
  lifeDays: $("lifeDays"),
  lifeSpend: $("lifeSpend"),
  lifeAvg: $("lifeAvg"),
  wkNow: $("wkNow"),
  wkDelta: $("wkDelta"),
  wkTrend: $("wkTrend"),

  logBtn: $("logBtn"),
  delayBtn: $("delayBtn"),
  delaySub: $("delaySub"),
  delayPanel: $("delayPanel"),
  delayCountdown: $("delayCountdown"),
  cancelDelayBtn: $("cancelDelayBtn"),

  undoBtn: $("undoBtn"),
  clearTodayBtn: $("clearTodayBtn"),
  exportBtn: $("exportBtn"),
  importFile: $("importFile"),
  wipeAllBtn: $("wipeAllBtn"),

  // Drinking
  drinkDaysSince: $("drinkDaysSince"),
  drinkLastLabel: $("drinkLastLabel"),
  drinkToggleTodayBtn: $("drinkToggleTodayBtn"),
  drinkMarkYesterdayBtn: $("drinkMarkYesterdayBtn"),
  drinkHeatmap: $("drinkHeatmap"),
  drinkHeatHint: $("drinkHeatHint"),
  drinkStreak: $("drinkStreak"),
  drink30Count: $("drink30Count"),
  drinkBestStreak: $("drinkBestStreak"),

  // Settings
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
  forceRefreshBtn: $("forceRefreshBtn"),
  buildLabel: $("buildLabel"),

  toggleQuickBtn: $("toggleQuickBtn"),
};

let countdownTimer = null;
let delayEndTimeout = null;

/* --------------------------- State --------------------------- */
const state = loadState();

/* --------------------------- Init --------------------------- */
init();
renderAll();

function init() {
  if (els.buildLabel) els.buildLabel.textContent = `Build: ${BUILD}`;

  // Tabs
  els.tabVape?.addEventListener("click", () => setPage("vape"));
  els.tabDrink?.addEventListener("click", () => setPage("drink"));

  // Vapes
  els.logBtn?.addEventListener("click", () => {
    if (isLocked()) return;
    addHit();
    haptic();
  });

  els.delayBtn?.addEventListener("click", () => {
    startDelay();
    haptic();
  });

  els.cancelDelayBtn?.addEventListener("click", () => {
    cancelDelay();
    haptic();
  });

  els.undoBtn?.addEventListener("click", () => {
    undoLast();
    haptic();
  });

  els.clearTodayBtn?.addEventListener("click", () => {
    if (!confirm("Clear all vape hits for today?")) return;
    clearToday();
  });

  els.exportBtn?.addEventListener("click", exportData);
  els.importFile?.addEventListener("change", importData);

  els.wipeAllBtn?.addEventListener("click", () => {
    if (!confirm("Wipe ALL data (vapes + solo drinking)? This cannot be undone.")) return;
    wipeAll();
  });

  // Solo drinking
  els.drinkToggleTodayBtn?.addEventListener("click", () => {
    toggleSoloDrinkForDay(ymd(new Date()));
    haptic();
  });

  els.drinkMarkYesterdayBtn?.addEventListener("click", () => {
    toggleSoloDrinkForDay(shiftDayKey(ymd(new Date()), -1));
    haptic();
  });

  // Settings modal
  els.openSettingsBtn?.addEventListener("click", openSettings);
  els.closeSettingsBtn?.addEventListener("click", closeSettings);
  els.settingsModal?.addEventListener("click", (e) => {
    if (e.target === els.settingsModal) closeSettings();
  });

  els.saveSettingsBtn?.addEventListener("click", saveSettingsFromUI);

  els.resetSettingsBtn?.addEventListener("click", () => {
    state.settings = defaultSettings();
    state.delayUntil = null;
    state.chartSelectedDay = null;
    state.vapes.longRange = "90d";
    state.vapes.longSelectedKey = null;
    persist();
    applyQuickMode();
    closeSettings();
    renderAll();
  });

  els.toggleQuickBtn?.addEventListener("click", () => {
    state.settings.quickMode = !state.settings.quickMode;
    persist();
    applyQuickMode();
    renderAll();
  });

  // Range pills
  els.rangePills?.addEventListener("click", (e) => {
    const btn = e.target?.closest?.(".pill");
    if (!btn) return;
    state.vapes.longRange = btn.getAttribute("data-range") || "90d";
    state.vapes.longSelectedKey = null;
    persist();
    renderLongTerm();
  });

  // Force refresh
  els.forceRefreshBtn?.addEventListener("click", async () => {
    await forceRefreshApp();
  });

  // Redraw on resize
  window.addEventListener("resize", () => {
    if (!document.body.classList.contains("quick")) {
      renderChart();
      renderLongTerm();
    }
    renderDrinkHeatmap();
  });

  // iOS throttles timers; always resync when returning
  const resync = () => {
    syncDelayLoop();
    renderAll();
  };
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) resync();
  });
  window.addEventListener("focus", resync);
  window.addEventListener("pageshow", resync);

  // Offline cache
  if (state.settings.offlineCache) registerSW();

  // Apply starting page
  setPage(state.activePage || "vape", { silent: true });

  applyQuickMode();
  syncDelayLoop();
}

function defaultSettings() {
  return {
    dailyGoal: 30,
    costPerHit: 0.03,
    delayMinutes: 10,
    quickMode: false,
    offlineCache: false,
  };
}

/* --------------------------- Storage --------------------------- */

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) throw new Error("no state");
    const parsed = JSON.parse(raw);

    const settings = { ...defaultSettings(), ...(parsed.settings || {}) };
    const hits = Array.isArray(parsed.hits) ? parsed.hits.filter((x) => typeof x === "number") : [];
    const delayUntil = typeof parsed.delayUntil === "number" ? parsed.delayUntil : null;
    const activePage = parsed.activePage === "drink" ? "drink" : "vape";

    const soloDaysArr = Array.isArray(parsed.soloDays) ? parsed.soloDays.filter((s) => typeof s === "string") : [];
    const soloDrinkDays = new Set(soloDaysArr);

    const vapes = parsed.vapes || {};
    const longRange = vapes.longRange || "90d";
    const longSelectedKey = vapes.longSelectedKey || null;

    return {
      settings,
      hits,
      delayUntil,
      activePage,
      soloDrinkDays,
      chartSelectedDay: parsed.chartSelectedDay || null,
      vapes: { longRange, longSelectedKey },
    };
  } catch {
    return {
      settings: defaultSettings(),
      hits: [],
      delayUntil: null,
      activePage: "vape",
      soloDrinkDays: new Set(),
      chartSelectedDay: null,
      vapes: { longRange: "90d", longSelectedKey: null },
    };
  }
}

function persist() {
  const payload = {
    settings: state.settings,
    hits: state.hits,
    delayUntil: state.delayUntil,
    activePage: state.activePage,
    chartSelectedDay: state.chartSelectedDay,
    vapes: state.vapes,
    soloDays: [...state.soloDrinkDays],
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function nowTs() {
  return Date.now();
}

/* --------------------------- Pages --------------------------- */

function setPage(page, opts = {}) {
  state.activePage = page === "drink" ? "drink" : "vape";
  persist();

  const vape = state.activePage === "vape";

  els.pageVape?.classList.toggle("active", vape);
  els.pageDrink?.classList.toggle("active", !vape);

  els.tabVape?.classList.toggle("active", vape);
  els.tabDrink?.classList.toggle("active", !vape);

  els.tabVape?.setAttribute("aria-selected", vape ? "true" : "false");
  els.tabDrink?.setAttribute("aria-selected", vape ? "false" : "true");

  if (!opts.silent) renderAll();
}

/* --------------------------- Delay / Lock --------------------------- */

function isLocked() {
  return typeof state.delayUntil === "number" && nowTs() < state.delayUntil;
}

function startDelay() {
  const mins = clampInt(state.settings.delayMinutes, 1, 240);
  state.delayUntil = nowTs() + mins * 60 * 1000;
  persist();

  // Guarantee a resync at end time even if iOS throttles intervals
  if (delayEndTimeout) clearTimeout(delayEndTimeout);
  const msLeft = Math.max(0, state.delayUntil - nowTs());
  delayEndTimeout = setTimeout(() => {
    syncDelayLoop();
    renderAll();
  }, msLeft + 100);

  syncDelayLoop();
  renderAll();
}

function cancelDelay() {
  state.delayUntil = null;

  if (delayEndTimeout) clearTimeout(delayEndTimeout);
  delayEndTimeout = null;

  persist();
  syncDelayLoop();

  // Reset display back to configured delay length (even though panel hides)
  renderVapeDelayUI(true);

  renderAll();
}

function syncDelayLoop() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }

  // If unlocked, clean up and hide
  if (!isLocked()) {
    if (typeof state.delayUntil === "number" && nowTs() >= state.delayUntil) {
      state.delayUntil = null;
      persist();
    }
    if (els.delayPanel) els.delayPanel.hidden = true;
    if (els.logBtn) els.logBtn.disabled = false;
    renderVapeDelayUI(false);
    return;
  }

  if (els.delayPanel) els.delayPanel.hidden = false;
  if (els.logBtn) els.logBtn.disabled = true;

  // High-frequency tick; if it stalls, focus/pageshow handlers fix it
  countdownTimer = setInterval(() => {
    renderVapeDelayUI(false);

    // Force-clear if time is up but UI hasn't caught up
    if (!isLocked()) {
      state.delayUntil = null;
      persist();
      if (els.delayPanel) els.delayPanel.hidden = true;
      if (els.logBtn) els.logBtn.disabled = false;
      clearInterval(countdownTimer);
      countdownTimer = null;
      renderAll();
    }
  }, 200);

  renderVapeDelayUI(false);
}

function renderVapeDelayUI(forceReset) {
  const mins = clampInt(state.settings.delayMinutes, 1, 240);
  if (els.delaySub) els.delaySub.textContent = `${mins}m`;

  if (forceReset) {
    if (els.delayCountdown) els.delayCountdown.textContent = `${String(mins).padStart(2, "0")}:00`;
    if (!isLocked()) {
      if (els.delayPanel) els.delayPanel.hidden = true;
      if (els.logBtn) els.logBtn.disabled = false;
    }
    return;
  }

  if (!isLocked()) {
    if (els.delayPanel) els.delayPanel.hidden = true;
    if (els.logBtn) els.logBtn.disabled = false;
    return;
  }

  const msLeft = Math.max(0, state.delayUntil - nowTs());

  // Fix the "stuck at 00:01" annoyance: if <= 0, clear immediately
  if (msLeft <= 0) {
    state.delayUntil = null;
    persist();
    if (els.delayPanel) els.delayPanel.hidden = true;
    if (els.logBtn) els.logBtn.disabled = false;
    return;
  }

  if (els.delayCountdown) els.delayCountdown.textContent = formatCountdown(msLeft);
}

/* --------------------------- Vapes Core --------------------------- */

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
  state.hits = state.hits.filter((ts) => ymd(new Date(ts)) !== todayKey);
  persist();
  renderAll();
}

function wipeAll() {
  state.hits = [];
  state.delayUntil = null;
  state.chartSelectedDay = null;
  state.soloDrinkDays = new Set();
  state.vapes.longRange = "90d";
  state.vapes.longSelectedKey = null;
  state.activePage = "vape";
  state.settings = defaultSettings();

  if (delayEndTimeout) clearTimeout(delayEndTimeout);
  delayEndTimeout = null;

  persist();
  applyQuickMode();
  syncDelayLoop();
  renderAll();
}

/* --------------------------- Settings --------------------------- */

function openSettings() {
  if (els.goalInput) els.goalInput.value = String(state.settings.dailyGoal ?? "");
  if (els.costInput) els.costInput.value = String(state.settings.costPerHit ?? "");
  if (els.delayMinutesInput) els.delayMinutesInput.value = String(state.settings.delayMinutes ?? "");
  if (els.quickModeToggle) els.quickModeToggle.checked = !!state.settings.quickMode;
  if (els.offlineToggle) els.offlineToggle.checked = !!state.settings.offlineCache;

  els.settingsModal?.classList.add("open");
  els.settingsModal?.setAttribute("aria-hidden", "false");
}

function closeSettings() {
  els.settingsModal?.classList.remove("open");
  els.settingsModal?.setAttribute("aria-hidden", "true");
}

function saveSettingsFromUI() {
  const goal = parseInt(els.goalInput?.value ?? "", 10);
  const cost = parseFloat(els.costInput?.value ?? "");
  const delayMins = parseInt(els.delayMinutesInput?.value ?? "", 10);

  state.settings.dailyGoal = Number.isFinite(goal) && goal >= 0 ? goal : defaultSettings().dailyGoal;
  state.settings.costPerHit = Number.isFinite(cost) && cost >= 0 ? cost : defaultSettings().costPerHit;
  state.settings.delayMinutes = Number.isFinite(delayMins) ? clampInt(delayMins, 1, 240) : defaultSettings().delayMinutes;

  const offlineWanted = !!els.offlineToggle?.checked;
  const prevOffline = !!state.settings.offlineCache;
  state.settings.offlineCache = offlineWanted;

  state.settings.quickMode = !!els.quickModeToggle?.checked;

  persist();
  applyQuickMode();
  closeSettings();

  if (offlineWanted && !prevOffline) registerSW();
  if (!offlineWanted && prevOffline) unregisterSW();

  syncDelayLoop();
  renderAll();
}

function applyQuickMode() {
  document.body.classList.toggle("quick", !!state.settings.quickMode);
}

/* --------------------------- Render --------------------------- */

function renderAll() {
  renderHeader();

  if (state.activePage === "vape") {
    renderToday();
    renderStats();
    renderLog();
    renderChart();
    renderLongTerm();
    syncDelayLoop();
  } else {
    renderDrink();
    renderDrinkHeatmap();
  }
}

function renderHeader() {
  const d = new Date();
  if (els.todayLabel) {
    els.todayLabel.textContent = d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  }
}

function renderToday() {
  const todayKey = ymd(new Date());
  const todayHits = state.hits.filter((ts) => ymd(new Date(ts)) === todayKey);
  if (els.todayCount) els.todayCount.textContent = String(todayHits.length);

  const g = state.settings.dailyGoal;
  if (els.goalLine) els.goalLine.textContent = Number.isFinite(g) ? `Goal: ≤ ${g} hits/day` : `Goal: —`;

  renderVapeDelayUI(false);
}

function renderStats() {
  const days = lastNDays(7);
  const counts = days.map((k) => countForDay(k));
  const total = counts.reduce((a, b) => a + b, 0);

  if (els.weekTotal) els.weekTotal.textContent = String(total);
  if (els.spendVal) els.spendVal.textContent = dollars(total * (state.settings.costPerHit || 0));

  const { streak, streakPossible } = computeVapeStreak(state.settings.dailyGoal);
  if (els.streakVal) els.streakVal.textContent = String(streak);
  if (els.streakSub) els.streakSub.textContent = streakPossible ? "days ≤ goal" : "days ≤ goal (start logging)";
}

function computeVapeStreak(goal) {
  if (!Number.isFinite(goal)) return { streak: 0, streakPossible: false };
  if (!state.hits.length) return { streak: 0, streakPossible: false };

  const firstDay = ymd(new Date(Math.min(...state.hits)));
  const todayKey = ymd(new Date());

  let streak = 0;
  for (let i = 0; ; i++) {
    const day = shiftDayKey(todayKey, -i);
    if (day < firstDay) break;

    const c = countForDay(day);
    if (c <= goal) streak++;
    else break;
  }
  return { streak, streakPossible: true };
}

function renderLog() {
  const todayKey = ymd(new Date());
  const todays = state.hits
    .filter((ts) => ymd(new Date(ts)) === todayKey)
    .slice()
    .reverse();

  if (els.logMeta) els.logMeta.textContent = `${todays.length} hit(s) logged today • total logs: ${state.hits.length}`;

  if (!els.logList) return;
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

/* --------------------------- Charts (centered content) --------------------------- */

function renderChart() {
  if (document.body.classList.contains("quick")) return;
  if (!els.chart) return;

  const canvas = els.chart;
  const ctx = canvas.getContext("2d");

  const dpr = window.devicePixelRatio || 1;
  const container = canvas.parentElement;
  const cssW = Math.max(320, Math.floor(container.clientWidth));
  const cssH = 240;

  canvas.style.width = cssW + "px";
  canvas.style.height = cssH + "px";
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.clearRect(0, 0, cssW, cssH);

  const days = lastNDays(7);
  const counts = days.map((k) => countForDay(k));
  const max = Math.max(5, ...counts);

  const pad = 18;
  const chartW = cssW - pad * 2;
  const chartH = cssH - pad * 2 - 10;

  // Axis
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,.10)";
  ctx.beginPath();
  ctx.moveTo(pad, pad + chartH);
  ctx.lineTo(pad + chartW, pad + chartH);
  ctx.stroke();

  const barGap = 10;
  const barW = Math.max(8, (chartW - barGap * (days.length - 1)) / days.length);

  const barsTotalW = barW * days.length + barGap * (days.length - 1);
  const startX = pad + Math.max(0, (chartW - barsTotalW) / 2);

  const hitAreas = [];

  for (let i = 0; i < days.length; i++) {
    const c = counts[i];
    const x = startX + i * (barW + barGap);
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
    ctx.fillText(lbl, x + barW / 2, pad + chartH + 18);

    ctx.fillStyle = "rgba(233,238,246,.90)";
    ctx.font = "12px ui-sans-serif, system-ui";
    ctx.fillText(String(c), x + barW / 2, Math.max(pad + 12, y - 6));

    hitAreas.push({ day: days[i], x, y: pad, w: barW, h: chartH + 26, count: c });
  }

  canvas.onclick = (ev) => {
    const r = canvas.getBoundingClientRect();
    const cx = ev.clientX - r.left;
    const cy = ev.clientY - r.top;

    const hit = hitAreas.find((a) => cx >= a.x && cx <= a.x + a.w && cy >= a.y && cy <= a.y + a.h);
    if (!hit) return;

    state.chartSelectedDay = state.chartSelectedDay === hit.day ? null : hit.day;

    if (els.chartHint) {
      if (state.chartSelectedDay) {
        const d = fromDayKey(hit.day);
        els.chartHint.textContent = `${d.toLocaleDateString(undefined, {
          weekday: "long",
          month: "short",
          day: "numeric",
        })}: ${hit.count} hit(s)`;
      } else {
        els.chartHint.textContent = "";
      }
    }

    persist();
    renderChart();
  };
}

function renderLongTerm() {
  if (document.body.classList.contains("quick")) return;
  if (!els.longChart) return;

  // pills
  els.rangePills?.querySelectorAll(".pill").forEach((b) => {
    b.classList.toggle("active", b.getAttribute("data-range") === state.vapes.longRange);
  });

  // daily map
  const daily = new Map();
  for (const ts of state.hits) {
    const k = ymd(new Date(ts));
    daily.set(k, (daily.get(k) || 0) + 1);
  }

  const totalHits = state.hits.length;
  els.lifeHits && (els.lifeHits.textContent = String(totalHits));

  const trackedDays = daily.size;
  els.lifeDays && (els.lifeDays.textContent = `${trackedDays} day(s) tracked`);

  const totalSpend = totalHits * (state.settings.costPerHit || 0);
  els.lifeSpend && (els.lifeSpend.textContent = dollars(totalSpend));

  const avgSpend = trackedDays ? totalSpend / trackedDays : 0;
  els.lifeAvg && (els.lifeAvg.textContent = `${dollars(avgSpend)}/day avg`);

  // weekly deltas
  const thisWeekKey = startOfWeekKey(new Date());
  const lastWeekKey = shiftDayKey(thisWeekKey, -7);

  const thisWeekDays = Array.from({ length: 7 }, (_, i) => shiftDayKey(thisWeekKey, i));
  const lastWeekDays = Array.from({ length: 7 }, (_, i) => shiftDayKey(lastWeekKey, i));

  const thisWeekTotal = sumCounts(thisWeekDays, daily);
  const lastWeekTotal = sumCounts(lastWeekDays, daily);

  els.wkNow && (els.wkNow.textContent = String(thisWeekTotal));
  const delta = thisWeekTotal - lastWeekTotal;
  els.wkDelta &&
    (els.wkDelta.textContent =
      trackedDays === 0
        ? "— vs last week"
        : `${delta === 0 ? "0" : delta > 0 ? "+" + delta : String(delta)} vs last week`);

  const weekTotalAt = (wkStartKey) => {
    const days = Array.from({ length: 7 }, (_, i) => shiftDayKey(wkStartKey, i));
    return sumCounts(days, daily);
  };

  const last8 = [];
  for (let w = 0; w < 8; w++) last8.push(weekTotalAt(shiftDayKey(thisWeekKey, -7 * w)));
  const avgA = last8.slice(0, 4).reduce((a, b) => a + b, 0) / 4;
  const avgB = last8.slice(4, 8).reduce((a, b) => a + b, 0) / 4;
  const trend = Math.round(avgA - avgB);
  els.wkTrend && (els.wkTrend.textContent = trackedDays === 0 ? "—" : trend === 0 ? "0" : trend > 0 ? "+" + trend : String(trend));

  // chart series
  const range = state.vapes.longRange || "90d";
  let keys = [];
  let values = [];

  if (range === "90d") {
    const end = ymd(new Date());
    for (let i = 89; i >= 0; i--) {
      const day = shiftDayKey(end, -i);
      keys.push(day);
      values.push(daily.get(day) || 0);
    }
  } else if (range === "1y") {
    const wkEnd = startOfWeekKey(new Date());
    for (let i = 51; i >= 0; i--) {
      const wk = shiftDayKey(wkEnd, -7 * i);
      keys.push(wk);
      values.push(weekTotalAt(wk));
    }
  } else {
    // monthly
    if (!state.hits.length) {
      keys = [];
      values = [];
    } else {
      const minTs = Math.min(...state.hits);
      const start = new Date(minTs);
      const startM = new Date(start.getFullYear(), start.getMonth(), 1);
      const end = new Date();
      const endM = new Date(end.getFullYear(), end.getMonth(), 1);

      const monthly = new Map();
      for (const [dayKey, c] of daily.entries()) {
        const d = fromDayKey(dayKey);
        const mk = monthKey(d);
        monthly.set(mk, (monthly.get(mk) || 0) + c);
      }

      const cur = new Date(startM);
      while (cur <= endM) {
        const mk = monthKey(cur);
        keys.push(mk);
        values.push(monthly.get(mk) || 0);
        cur.setMonth(cur.getMonth() + 1);
      }
    }
  }

  drawLongChart(keys, values, range);
}

function drawLongChart(keys, values, range) {
  const canvas = els.longChart;
  const ctx = canvas.getContext("2d");

  const dpr = window.devicePixelRatio || 1;
  const container = canvas.parentElement;
  const cssW = Math.max(320, Math.floor(container.clientWidth));
  const cssH = 240;

  canvas.style.width = cssW + "px";
  canvas.style.height = cssH + "px";
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.clearRect(0, 0, cssW, cssH);

  if (!keys.length) {
    els.longHint && (els.longHint.textContent = "No data yet — start logging.");
    return;
  } else {
    els.longHint && (els.longHint.textContent = "");
  }

  const pad = 18;
  const chartW = cssW - pad * 2;
  const chartH = cssH - pad * 2 - 10;

  // axis
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,.10)";
  ctx.beginPath();
  ctx.moveTo(pad, pad + chartH);
  ctx.lineTo(pad + chartW, pad + chartH);
  ctx.stroke();

  const max = Math.max(5, ...values);
  const n = values.length;

  const barGap = range === "90d" ? 2 : 4;
  const barW = Math.max(2, (chartW - barGap * (n - 1)) / n);

  const barsTotalW = barW * n + barGap * (n - 1);
  const startX = pad + Math.max(0, (chartW - barsTotalW) / 2);

  const hitAreas = [];

  for (let i = 0; i < n; i++) {
    const v = values[i];
    const x = startX + i * (barW + barGap);
    const h = (v / max) * chartH;
    const y = pad + (chartH - h);

    const selected = state.vapes.longSelectedKey === keys[i];

    ctx.fillStyle = selected ? "rgba(34,211,238,.95)" : "rgba(59,130,246,.65)";
    roundRect(ctx, x, y, barW, h, 6);
    ctx.fill();

    hitAreas.push({ key: keys[i], v, x, y: pad, w: barW, h: chartH + 26 });
  }

  canvas.onclick = (ev) => {
    const r = canvas.getBoundingClientRect();
    const cx = ev.clientX - r.left;
    const cy = ev.clientY - r.top;

    const hit = hitAreas.find((a) => cx >= a.x && cx <= a.x + a.w && cy >= a.y && cy <= a.y + a.h);
    if (!hit) return;

    state.vapes.longSelectedKey = state.vapes.longSelectedKey === hit.key ? null : hit.key;

    if (els.longHint) {
      if (state.vapes.longSelectedKey) {
        let label = String(hit.key);

        if (range === "90d") {
          const d = fromDayKey(hit.key);
          label = d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
        } else if (range === "1y") {
          const d = fromDayKey(hit.key);
          const end = new Date(d);
          end.setDate(end.getDate() + 6);
          label = `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${end.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}`;
        } else {
          const [yy, mm] = hit.key.split("-");
          const d = new Date(Number(yy), Number(mm) - 1, 1);
          label = d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
        }

        els.longHint.textContent = `${label}: ${hit.v} hit(s)`;
      } else {
        els.longHint.textContent = "";
      }
    }

    persist();
    renderLongTerm();
  };
}

/* --------------------------- Solo drinking --------------------------- */

function toggleSoloDrinkForDay(dayKey) {
  if (state.soloDrinkDays.has(dayKey)) state.soloDrinkDays.delete(dayKey);
  else state.soloDrinkDays.add(dayKey);

  persist();
  renderDrink();
  renderDrinkHeatmap();
}

function renderDrink() {
  const todayKey = ymd(new Date());
  const lastKey = getMostRecentSoloDrinkDay();

  if (!lastKey) {
    els.drinkDaysSince && (els.drinkDaysSince.textContent = "0");
    els.drinkLastLabel && (els.drinkLastLabel.textContent = "Last: —");
  } else {
    const days = Math.max(0, daysBetween(lastKey, todayKey));
    els.drinkDaysSince && (els.drinkDaysSince.textContent = String(days));
    const d = fromDayKey(lastKey);
    els.drinkLastLabel &&
      (els.drinkLastLabel.textContent = `Last: ${d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}`);
  }

  els.drink30Count && (els.drink30Count.textContent = String(countSoloDrinkLastNDays(60)));

  const { currentStreak, bestStreak } = computeDrinkStreaks();
  els.drinkStreak && (els.drinkStreak.textContent = String(currentStreak));
  els.drinkBestStreak && (els.drinkBestStreak.textContent = String(bestStreak));
}

function renderDrinkHeatmap() {
  const wrap = els.drinkHeatmap;
  if (!wrap) return;

  wrap.innerHTML = "";

  const todayKey = ymd(new Date());

  const months = getTwoMonths(); // [{year, monthIndex}, {year, monthIndex}]
  for (const m of months) {
    const block = document.createElement("div");
    block.className = "monthBlock";

    const title = document.createElement("div");
    title.className = "monthTitle";
    title.textContent = monthTitle(m.year, m.monthIndex);

    const grid = document.createElement("div");
    grid.className = "monthGrid";

    // Monday-first calendar:
    // startDow: Mon=0..Sun=6
    const first = new Date(m.year, m.monthIndex, 1);
    const daysInMonth = new Date(m.year, m.monthIndex + 1, 0).getDate();
    const startDow = first.getDay();

    // Fill 6 weeks (42 cells) for consistent calendar shape
    for (let i = 0; i < 42; i++) {
      const dayNum = i - startDow + 1;

      // Outside month → blank cell
      if (dayNum < 1 || dayNum > daysInMonth) {
        const spacer = document.createElement("div");
        spacer.className = "cell empty";
        grid.appendChild(spacer);
        continue;
      }

      const dayKey = ymd(new Date(m.year, m.monthIndex, dayNum));
      const on = state.soloDrinkDays.has(dayKey);

      const cell = document.createElement("div");
      cell.className = "cell" + (on ? " on" : "") + (dayKey === todayKey ? " today" : "");
      cell.setAttribute("data-day", dayKey);
      cell.title = dayKey;

      const n = document.createElement("span");
      n.className = "dnum";
      n.textContent = String(dayNum);
      cell.appendChild(n);

      cell.addEventListener("click", () => {
        toggleSoloDrinkForDay(dayKey);
        const d = fromDayKey(dayKey);
        if (els.drinkHeatHint) {
          els.drinkHeatHint.textContent = `${d.toLocaleDateString(undefined, {
            weekday: "long",
            month: "short",
            day: "numeric",
          })}: ${state.soloDrinkDays.has(dayKey) ? "Solo Drinking / Bad Blackout" : "None"}`;
        }
      });

      grid.appendChild(cell);
    }

    block.appendChild(title);
    block.appendChild(grid);
    wrap.appendChild(block);
  }
}

function getMostRecentSoloDrinkDay() {
  if (!state.soloDrinkDays.size) return null;
  let max = null;
  for (const k of state.soloDrinkDays) if (!max || k > max) max = k;
  return max;
}

function countSoloDrinkLastNDays(n) {
  const days = lastNDays(n);
  let count = 0;
  for (const k of days) if (state.soloDrinkDays.has(k)) count++;
  return count;
}

function computeDrinkStreaks() {
  const todayKey = ymd(new Date());
  const firstKey = getEarliestAnyDayKey();
  if (!firstKey) return { currentStreak: 0, bestStreak: 0 };

  // current streak: consecutive days WITHOUT solo drinking up to today
  let currentStreak = 0;
  for (let i = 0; ; i++) {
    const day = shiftDayKey(todayKey, -i);
    if (day < firstKey) break;
    if (state.soloDrinkDays.has(day)) break;
    currentStreak++;
  }

  // best streak across range
  let bestStreak = 0;
  let run = 0;
  const totalDays = daysBetween(firstKey, todayKey);
  for (let i = 0; i <= totalDays; i++) {
    const day = shiftDayKey(firstKey, i);
    if (state.soloDrinkDays.has(day)) {
      if (run > bestStreak) bestStreak = run;
      run = 0;
    } else {
      run++;
    }
  }
  if (run > bestStreak) bestStreak = run;

  return { currentStreak, bestStreak };
}

function getEarliestAnyDayKey() {
  let earliest = null;
  if (state.hits.length) {
    const firstV = ymd(new Date(Math.min(...state.hits)));
    earliest = earliest ? (firstV < earliest ? firstV : earliest) : firstV;
  }
  for (const k of state.soloDrinkDays) {
    earliest = earliest ? (k < earliest ? k : earliest) : k;
  }
  return earliest;
}

/* --------------------------- Export / Import --------------------------- */

function exportData() {
  const payload = {
    build: BUILD,
    exportedAt: new Date().toISOString(),
    settings: state.settings,
    hits: state.hits,
    delayUntil: state.delayUntil,
    activePage: state.activePage,
    chartSelectedDay: state.chartSelectedDay,
    vapes: state.vapes,
    soloDays: [...state.soloDrinkDays],
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `habit-tracker-export-${ymd(new Date())}.json`;
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

    if (!parsed || (typeof parsed !== "object")) throw new Error("Bad file.");

    if (Array.isArray(parsed.hits)) state.hits = parsed.hits.filter((x) => typeof x === "number");
    if (typeof parsed.delayUntil === "number") state.delayUntil = parsed.delayUntil;
    else state.delayUntil = null;

    if (parsed.settings && typeof parsed.settings === "object") {
      state.settings = { ...defaultSettings(), ...parsed.settings };
    } else {
      state.settings = { ...defaultSettings() };
    }

    state.activePage = parsed.activePage === "drink" ? "drink" : "vape";
    state.chartSelectedDay = parsed.chartSelectedDay || null;

    const v = parsed.vapes || {};
    state.vapes.longRange = v.longRange || "90d";
    state.vapes.longSelectedKey = v.longSelectedKey || null;

    const solo = Array.isArray(parsed.soloDays) ? parsed.soloDays.filter((s) => typeof s === "string") : [];
    state.soloDrinkDays = new Set(solo);

    persist();
    applyQuickMode();
    syncDelayLoop();
    setPage(state.activePage, { silent: true });
    renderAll();

    alert("Import complete.");
  } catch (err) {
    alert("Import failed: " + (err?.message || "Unknown error"));
  } finally {
    if (els.importFile) els.importFile.value = "";
  }
}

/* --------------------------- Force Refresh --------------------------- */

async function forceRefreshApp() {
  try {
    // Unregister SW
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) await r.unregister();
    }
    // Clear Cache Storage
    if ("caches" in window) {
      const keys = await caches.keys();
      for (const k of keys) await caches.delete(k);
    }
  } catch {}
  // Hard reload
  location.reload(true);
}

/* --------------------------- Offline Cache (SW) --------------------------- */

async function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("./sw.js", { scope: "./" });
  } catch {}
}

async function unregisterSW() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const r of regs) await r.unregister();
  } catch {}
}

/* --------------------------- Helpers --------------------------- */

function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function fromDayKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function shiftDayKey(key, deltaDays) {
  const d = fromDayKey(key);
  d.setDate(d.getDate() + deltaDays);
  return ymd(d);
}

function lastNDays(n) {
  const out = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    out.push(ymd(d));
  }
  return out;
}

function countForDay(dayKey) {
  let c = 0;
  for (const ts of state.hits) if (ymd(new Date(ts)) === dayKey) c++;
  return c;
}

function dollars(x) {
  return (x || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
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
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function haptic() {
  if (navigator.vibrate) navigator.vibrate(12);
}

function startOfWeekKey(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = (d.getDay() + 6) % 7; // Mon=0
  d.setDate(d.getDate() - day);
  return ymd(d);
}

function monthKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function sumCounts(keys, map) {
  return keys.reduce((acc, k) => acc + (map.get(k) || 0), 0);
}

function daysBetween(aKey, bKey) {
  const a = fromDayKey(aKey);
  const b = fromDayKey(bKey);
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

function getTwoMonths() {
  const now = new Date();
  const curY = now.getFullYear();
  const curM = now.getMonth();

  const prev = new Date(curY, curM - 1, 1);
  return [
    { year: prev.getFullYear(), monthIndex: prev.getMonth() },
    { year: curY, monthIndex: curM }
  ];
}

function monthTitle(year, monthIndex) {
  const d = new Date(year, monthIndex, 1);
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

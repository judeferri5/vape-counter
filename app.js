/* Habit Tracker — Vapes + Drinking (local-only storage) */
const BUILD = "2026-03-04c";
const STORAGE_KEY = "habitTracker.v1";

const $ = (id) => document.getElementById(id);

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

const state = loadState();

init();
renderAll();

function defaultSettings() {
  return {
    dailyGoal: 30,
    costPerHit: 0.03,
    delayMinutes: 10,
    quickMode: false,
    offlineCache: false,
  };
}

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
    if (!confirm("Wipe ALL data (vapes + drinking)? This cannot be undone.")) return;
    wipeAll();
  });

  // Drinking
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

  // Guaranteed resync at end time (intervals can be throttled on iOS)
  if (delayEndTimeout) clearTimeout(delayEndTimeout);
  const msLeft = Math.max(0, state.delayUntil - nowTs());
  delayEndTimeout = setTimeout(() => {
    syncDelayLoop();
    renderAll();
  }, msLeft + 200);

  syncDelayLoop();
  renderAll();
}

function cancelDelay() {
  state.delayUntil = null;

  if (delayEndTimeout) clearTimeout(delayEndTimeout);
  delayEndTimeout = null;

  persist();

  // Reset visuals to configured delay time so Cancel “feels” like a reset
  renderVapeDelayUI(true);

  syncDelayLoop();
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

  // Tick
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
    if (els.delayPanel) els.delayPanel.hidden = true;
    if (els.logBtn) els.logBtn.disabled = false;
    return;
  }

  if (!isLocked()) {
    if (els.delayPanel) els.delayPanel.hidden = true;
    if (els.logBtn) els.logBtn.disabled = false;
    return;
  }

  const msLeft = Math.max(0, state.delayUntil - nowTs());

  // Kill the “stuck at 00:01” case
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
    els.logList.innerHTML = `<div class="muted">No hits yet today.</div>`;
    return;
  }

  for (const ts of todays) {
    const d = new Date(ts);
    const item = document.createElement("div");
    item.className = "item";

    const left = document.createElement("div");
    left.className = "left";

    const t = document.createElement("div");
    t.className = "t";
    t.textContent = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

    const s = document.createElement("div");
    s.className = "s";
    s.textContent = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });

    left.appendChild(t);
    left.appendChild(s);

    const right = document.createElement("div");
    right.className = "muted";
    right.textContent = String(getMinutesSince(ts));

    item.appendChild(left);
    item.appendChild(right);
    els.logList.appendChild(item);
  }
}

/* --------------------------- Charts (centered) --------------------------- */

function renderChart() {
  if (!els.chart) return;
  const days = lastNDays(7); // oldest -> newest
  const vals = days.map((k) => countForDay(k));
  const labels = days.map((k) => dayLabel(k));

  drawBarChart(els.chart, labels, vals, {
    highlightIndex: days.indexOf(state.chartSelectedDay),
    onBarTap: (i) => {
      const key = days[i];
      state.chartSelectedDay = key;
      persist();
      const d = fromDayKey(key);
      if (els.chartHint) {
        els.chartHint.textContent = `${d.toLocaleDateString(undefined, {
          weekday: "long",
          month: "short",
          day: "numeric",
        })}: ${vals[i]} hit(s)`;
      }
      renderChart();
    },
  });

  if (els.chartHint && !state.chartSelectedDay) els.chartHint.textContent = "";
}

function renderLongTerm() {
  if (!els.longChart) return;

  const range = state.vapes.longRange || "90d";
  const days = range === "90d" ? lastNDays(90) : range === "1y" ? lastNDays(365) : allDaysFromHits();
  const vals = days.map((k) => countForDay(k));

  // labels: keep sparse for long charts
  const labels = days.map((k, i) => {
    if (range === "all") {
      return i % Math.max(1, Math.floor(days.length / 6)) === 0 ? shortMD(k) : "";
    }
    if (range === "1y") return i % 30 === 0 ? shortMD(k) : "";
    return i % 15 === 0 ? shortMD(k) : "";
  });

  drawBarChart(els.longChart, labels, vals, {
    highlightIndex: days.indexOf(state.vapes.longSelectedKey),
    onBarTap: (i) => {
      const key = days[i];
      state.vapes.longSelectedKey = key;
      persist();
      const d = fromDayKey(key);
      if (els.longHint) {
        els.longHint.textContent = `${d.toLocaleDateString(undefined, {
          weekday: "long",
          month: "short",
          day: "numeric",
        })}: ${vals[i]} hit(s)`;
      }
      renderLongTerm();
    },
  });

  // pills UI
  if (els.rangePills) {
    [...els.rangePills.querySelectorAll(".pill")].forEach((b) => {
      b.classList.toggle("active", (b.getAttribute("data-range") || "") === range);
    });
  }

  // Lifetime stats
  const lifeHits = state.hits.length;
  const trackedDays = allDaysFromHits().length;
  const lifeSpend = lifeHits * (state.settings.costPerHit || 0);
  const avgPerDay = trackedDays ? lifeSpend / trackedDays : 0;

  if (els.lifeHits) els.lifeHits.textContent = String(lifeHits);
  if (els.lifeDays) els.lifeDays.textContent = `${trackedDays} day(s) tracked`;
  if (els.lifeSpend) els.lifeSpend.textContent = dollars(lifeSpend);
  if (els.lifeAvg) els.lifeAvg.textContent = `${dollars(avgPerDay)}/day avg`;

  // Week comparisons
  const thisWeek = lastNDays(7).reduce((a, k) => a + countForDay(k), 0);
  const prevWeekDays = lastNDaysFrom(7, shiftDayKey(ymd(new Date()), -7));
  const lastWeek = prevWeekDays.reduce((a, k) => a + countForDay(k), 0);

  if (els.wkNow) els.wkNow.textContent = String(thisWeek);
  if (els.wkDelta) els.wkDelta.textContent = `${fmtSigned(thisWeek - lastWeek)} vs last week`;

  // 4-week avg change (compare last 4 weeks vs previous 4 weeks)
  const w1 = sumDays(lastNDays(28));
  const w0 = sumDays(lastNDaysFrom(28, shiftDayKey(ymd(new Date()), -28)));
  const avgChange = (w1 - w0) / 4;

  if (els.wkTrend) els.wkTrend.textContent = `${fmtSigned(round1(avgChange))}`;
}

function drawBarChart(canvas, labels, values, opts = {}) {
  const ctx = canvas.getContext("2d");
  const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));

  // CSS size
  const cssW = canvas.clientWidth || 600;
  const cssH = canvas.height || 240;

  // Real pixel buffer
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const w = cssW;
  const h = cssH;

  // Clear
  ctx.clearRect(0, 0, w, h);

  // Layout (symmetrical padding => centered plot)
  const padL = 28;
  const padR = 28;
  const padT = 16;
  const padB = 34;

  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  // Baseline
  ctx.strokeStyle = "rgba(255,255,255,.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT + plotH);
  ctx.lineTo(padL + plotW, padT + plotH);
  ctx.stroke();

  const maxV = Math.max(1, ...values);
  const n = values.length;
  const gap = Math.min(14, plotW / (n * 2));
  const barW = (plotW - gap * (n - 1)) / n;

  // Bars
  const barRects = [];
  for (let i = 0; i < n; i++) {
    const v = values[i];
    const bh = Math.round((v / maxV) * (plotH - 10));
    const x = padL + i * (barW + gap);
    const y = padT + plotH - bh;

    const active = (opts.highlightIndex === i);

    ctx.fillStyle = active ? "rgba(34,211,238,.90)" : "rgba(59,130,246,.80)";
    const r = 12;
    roundRect(ctx, x, y, barW, bh, r);
    ctx.fill();

    // value above bar (small)
    ctx.fillStyle = "rgba(233,238,246,.70)";
    ctx.font = "700 12px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
    ctx.textAlign = "center";
    ctx.fillText(String(v), x + barW / 2, padT + plotH - bh - 6);

    barRects.push({ x, y: padT, w: barW, h: plotH, i });
  }

  // X labels (centered)
  ctx.fillStyle = "rgba(233,238,246,.70)";
  ctx.font = "700 13px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
  ctx.textAlign = "center";
  for (let i = 0; i < n; i++) {
    const x = padL + i * (barW + gap) + barW / 2;
    const lab = labels[i] || "";
    ctx.fillText(lab, x, padT + plotH + 22);
  }

  // Click/tap handler
  canvas.onclick = (ev) => {
    if (!opts.onBarTap) return;
    const rect = canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;

    for (const b of barRects) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        opts.onBarTap(b.i);
        return;
      }
    }
  };
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

function sumDays(dayKeys) {
  return dayKeys.reduce((a, k) => a + countForDay(k), 0);
}

/* --------------------------- Drinking --------------------------- */

function toggleSoloDrinkForDay(dayKey) {
  if (state.soloDrinkDays.has(dayKey)) state.soloDrinkDays.delete(dayKey);
  else state.soloDrinkDays.add(dayKey);
  persist();
  renderDrink();
  renderDrinkHeatmap();
}

function renderDrink() {
  const todayKey = ymd(new Date());

  // Find most recent drinking day
  const days = [...state.soloDrinkDays].sort();
  const lastKey = days.length ? days[days.length - 1] : null;

  if (els.drinkLastLabel) {
    els.drinkLastLabel.textContent = lastKey ? `Last: ${fromDayKey(lastKey).toLocaleDateString()}` : "Last: —";
  }

  const since = lastKey ? daysBetween(fromDayKey(lastKey), new Date()) : 0;
  if (els.drinkDaysSince) els.drinkDaysSince.textContent = String(lastKey ? since : 0);

  // streak = consecutive days with NO drinking ending today
  const streak = computeNoDrinkStreak(todayKey);
  if (els.drinkStreak) els.drinkStreak.textContent = String(streak);

  // last 60 days count
  const last60 = lastNDays(60);
  const count60 = last60.reduce((a, k) => a + (state.soloDrinkDays.has(k) ? 1 : 0), 0);
  if (els.drink30Count) els.drink30Count.textContent = String(count60);

  // best streak all time
  const best = computeBestNoDrinkStreak();
  if (els.drinkBestStreak) els.drinkBestStreak.textContent = String(best);

  if (els.drinkHeatHint) {
    const d = fromDayKey(todayKey);
    els.drinkHeatHint.textContent = `${d.toLocaleDateString(undefined, { weekday:"long", month:"short", day:"numeric" })}: ${
      state.soloDrinkDays.has(todayKey) ? "Solo Drink / Bad Blackout" : "None"
    }`;
  }
}

function computeNoDrinkStreak(todayKey) {
  let s = 0;
  for (let i = 0; ; i++) {
    const key = shiftDayKey(todayKey, -i);
    if (state.soloDrinkDays.has(key)) break;
    s++;
    // stop if we go too far back without any data (cap)
    if (i > 3650) break;
  }
  return s;
}

function computeBestNoDrinkStreak() {
  // Compute across a reasonable window: from earliest drink mark (or today - 5y) to today.
  const todayKey = ymd(new Date());
  const marks = [...state.soloDrinkDays].sort();
  const startKey = marks.length ? shiftDayKey(marks[0], -1) : shiftDayKey(todayKey, -365);
  const all = allDaysBetween(startKey, todayKey);

  let best = 0;
  let cur = 0;
  for (const k of all) {
    if (state.soloDrinkDays.has(k)) {
      best = Math.max(best, cur);
      cur = 0;
    } else {
      cur++;
    }
  }
  best = Math.max(best, cur);
  return best;
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

    // Sunday-first:
    // JS getDay(): Sun=0..Sat=6
    const first = new Date(m.year, m.monthIndex, 1);
    const daysInMonth = new Date(m.year, m.monthIndex + 1, 0).getDate();
    const startDow = first.getDay(); // Sun=0

    // Fill 6 weeks (42 cells)
    for (let i = 0; i < 42; i++) {
      const dayNum = i - startDow + 1;

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
          })}: ${state.soloDrinkDays.has(dayKey) ? "Solo Drink / Bad Blackout" : "None"}`;
        }
      });

      grid.appendChild(cell);
    }

    block.appendChild(title);
    block.appendChild(grid);
    wrap.appendChild(block);
  }
}

/* --------------------------- Export / Import --------------------------- */

function exportData() {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      settings: state.settings,
      hits: state.hits,
      soloDays: [...state.soloDrinkDays],
    },
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `habit-tracker-export-${ymd(new Date())}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function importData(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result || ""));
      const data = parsed?.data || parsed; // allow importing raw state too

      if (data.settings) state.settings = { ...defaultSettings(), ...data.settings };
      if (Array.isArray(data.hits)) state.hits = data.hits.filter((x) => typeof x === "number");
      if (Array.isArray(data.soloDays)) state.soloDrinkDays = new Set(data.soloDays.filter((s) => typeof s === "string"));

      persist();
      applyQuickMode();
      syncDelayLoop();
      renderAll();
      alert("Import complete.");
    } catch {
      alert("Import failed. That file doesn’t look like a valid export.");
    }
    if (els.importFile) els.importFile.value = "";
  };
  reader.readAsText(file);
}

/* --------------------------- Offline Cache --------------------------- */

async function registerSW() {
  try {
    if (!("serviceWorker" in navigator)) return;
    await navigator.serviceWorker.register("./sw.js", { scope: "./" });
  } catch {
    // ignore
  }
}

async function unregisterSW() {
  try {
    if (!("serviceWorker" in navigator)) return;
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const r of regs) await r.unregister();
  } catch {
    // ignore
  }
}

async function forceRefreshApp() {
  // attempt to update SW + hard reload caches
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) {
        await r.update();
      }
    }
  } catch {}
  // bust HTTP cache for this tab
  location.reload(true);
}

/* --------------------------- Helpers --------------------------- */

function countForDay(dayKey) {
  let c = 0;
  for (const ts of state.hits) {
    if (ymd(new Date(ts)) === dayKey) c++;
  }
  return c;
}

function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromDayKey(key) {
  const [y, m, d] = key.split("-").map((x) => parseInt(x, 10));
  return new Date(y, m - 1, d);
}

function shiftDayKey(key, deltaDays) {
  const d = fromDayKey(key);
  d.setDate(d.getDate() + deltaDays);
  return ymd(d);
}

function lastNDays(n) {
  const out = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d);
    x.setDate(d.getDate() - i);
    out.push(ymd(x));
  }
  return out;
}

function lastNDaysFrom(n, endKey) {
  // n days ending at endKey (inclusive), oldest->newest
  const out = [];
  const end = fromDayKey(endKey);
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(end);
    x.setDate(end.getDate() - i);
    out.push(ymd(x));
  }
  return out;
}

function allDaysFromHits() {
  if (!state.hits.length) return lastNDays(7);
  const minTs = Math.min(...state.hits);
  const startKey = ymd(new Date(minTs));
  const endKey = ymd(new Date());
  return allDaysBetween(startKey, endKey);
}

function allDaysBetween(startKey, endKey) {
  const out = [];
  let cur = startKey;
  while (cur <= endKey) {
    out.push(cur);
    cur = shiftDayKey(cur, 1);
    if (out.length > 20000) break;
  }
  return out;
}

function daysBetween(a, b) {
  const ms = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

function formatCountdown(msLeft) {
  const s = Math.ceil(msLeft / 1000);
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function dollars(x) {
  const v = Number.isFinite(x) ? x : 0;
  return v.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function clampInt(n, min, max) {
  const v = parseInt(n, 10);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function dayLabel(dayKey) {
  const d = fromDayKey(dayKey);
  return d.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 3);
}

function shortMD(dayKey) {
  const d = fromDayKey(dayKey);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtSigned(n) {
  const v = Number.isFinite(n) ? n : 0;
  return (v > 0 ? "+" : "") + String(v);
}

function round1(n) {
  const v = Number.isFinite(n) ? n : 0;
  return Math.round(v * 10) / 10;
}

function getMinutesSince(ts) {
  const m = Math.floor((nowTs() - ts) / 60000);
  return Math.max(0, m);
}

function monthTitle(year, monthIndex) {
  const d = new Date(year, monthIndex, 1);
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function getTwoMonths() {
  const now = new Date();
  const m0 = { year: now.getFullYear(), monthIndex: now.getMonth() };
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const m1 = { year: prev.getFullYear(), monthIndex: prev.getMonth() };
  return [m1, m0];
}

function haptic() {
  try {
    if (navigator.vibrate) navigator.vibrate(10);
  } catch {}
}
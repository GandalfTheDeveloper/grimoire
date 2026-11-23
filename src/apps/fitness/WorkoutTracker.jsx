import React, { useState, useEffect, useRef, useCallback } from "react";
import { Settings, ChevronLeft, ChevronRight, Smartphone, Monitor, RefreshCw } from "lucide-react";
import { getItem, setItem } from "../../core/storage.js";
import { useWakeLock, wakeLockText } from "../../core/wakeLock.js";
import { data, sync } from "../../core/index.js";
import { loadSyncConfig } from "../../core/syncConfig.js";
import { getSyncStatus, setAppPending, subscribeSync } from "../../core/syncStatus.js";
import { ACCENT, BG, GOLD, INK, LINE, SUB } from "./theme.js";
import { CYCLE_ANCHOR, PLAN_DAYS, getEffectiveExercises, getWeekNumber } from "./plan.js";
import { addDays, addMonths, dayName } from "./dates.js";
import { MonthSlide, ProgressSlide, SLIDE_DEFS, TodaySlide, WeekSlide } from "./slides.jsx";
import { PlanEditorModal, SettingsModal } from "./modals.jsx";
import { LogEntryView } from "./LogEntryView.jsx";
import { applyItems, importLocalPlan, importOldTabs, journalAdd, journalDone, loadAll, recoverJournal, savePlanOverride } from "./data.js";

export const connected = () => { const c = loadSyncConfig(); return !!(c.url && c.key); };

// Every on-device key is "grimoire:fitness:<name>" (core/storage.js adds the prefix).
export async function storeGet(key, fallback) { return getItem("fitness", key, fallback); }
export async function storeSet(key, value) { setItem("fitness", key, value); }

const NO_QUEUE = []; // the screens used to overlay a local queue; edits are now saved records, so there is nothing to overlay
const mine = () => data.dirtySnapshot().filter((r) => r.app === "fitness").length;

function statusMessage(st, pending) {
  if (!st.configured) return pending ? "Saved on this device. Add your script address and key in Grimoire's Settings to sync" : "Not connected. Add your script address and key in Grimoire's Settings";
  if (st.lastError) return `Couldn't reach the sheet (${st.lastError})${pending ? `, ${pending} waiting, will retry` : ""}`;
  if (pending) return `${pending} waiting to sync`;
  return st.lastSync ? "Up to date" : "";
}

export default function WorkoutTracker() {
  const [settings, setSettings] = useState({ anchorDate: CYCLE_ANCHOR, slides: ["today", "week", "month", "progress"], slideSeconds: 150, slideshowEnabled: true, abCycleSeconds: 15, weightWindowDays: 21 });
  const [showSettings, setShowSettings] = useState(false);
  const [mode, setMode] = useState(typeof window !== "undefined" && window.innerWidth < 700 ? "entry" : "display");
  const [slide, setSlide] = useState(0);
  const [logDate, setLogDate] = useState(new Date());
  const [dailyLog, setDailyLog] = useState([]);
  const [exerciseLog, setExerciseLog] = useState([]);
  const [runLog, setRunLog] = useState([]);
  const [calendarNotes, setCalendarNotes] = useState({});
  const [planOverrides, setPlanOverrides] = useState({});
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [viewDate, setViewDate] = useState(new Date());
  const [showPlanEditor, setShowPlanEditor] = useState(false);
  const [editContext, setEditContext] = useState(null);
  const mountedRef = useRef(true);
  const touchStart = useRef(null);
  const chain = useRef(Promise.resolve()); // saves run one after another, in the order they were made
  const [syncingNow, setSyncingNow] = useState(!!getSyncStatus().syncing);
  const syncing = busy || syncingNow;

  // Screen wake lock in display mode (the tablet). The hook re-asks whenever the browser drops it.
  const wake = useWakeLock(mode === "display");

  const [hydrated, setHydrated] = useState(false);

  // Reads everything from this device's records (which already include edits not yet sent) into the screens.
  const reload = useCallback(async () => {
    if (!mountedRef.current) return;
    const all = await loadAll();
    if (!mountedRef.current) return;
    setDailyLog(all.dailyLog); setExerciseLog(all.exerciseLog); setRunLog(all.runLog);
    setCalendarNotes(all.calendarNotes); setPlanOverrides(all.planOverrides);
    setPending(mine());
  }, []);

  // Anything that changes a Fitness record (a save here, or a newer edit arriving from another device) refreshes the screens.
  useEffect(() => {
    let timer = null;
    const off = data.subscribe((info) => {
      if (info && info.app !== "fitness") return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; reload(); }, 40);
    });
    return () => { off(); if (timer) clearTimeout(timer); };
  }, [reload]);

  // The status line and the Sync button follow Grimoire's sync engine.
  useEffect(() => {
    const update = () => {
      const st = getSyncStatus();
      setSyncingNow(!!st.syncing);
      const n = mine();
      setPending(n);
      setSyncMsg(statusMessage(st, n));
    };
    update();
    return subscribeSync(update);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    (async () => {
      const s = await storeGet("settings", null);
      if (s) {
        // Phase 2b: Fitness no longer keeps its own script address or key. Remove any left on this device.
        const { apiUrl: _u, apiKey: _k, refreshMinutes: _r, ...rest } = s;
        if ("apiUrl" in s || "apiKey" in s || "refreshMinutes" in s) storeSet("settings", rest);
        setSettings((prev) => ({ ...prev, ...rest, anchorDate: CYCLE_ANCHOR }));
      }
      // Edits an earlier build (or an interrupted save) left on this device become records before anything else.
      await recoverJournal();
      await importLocalPlan();
      setAppPending("fitness", 0); // the old on-device queue no longer exists; the dot now counts records
      await reload();
      setHydrated(true);
      // One-time copy of the old Sheet tabs into the new records, then a normal sync.
      try { if (connected()) await importOldTabs(true); } catch (err) { setSyncMsg(`Couldn't read your old data yet (${err.message}), will try again`); }
      await reload();
      sync.syncNow("open");
    })();
    return () => { mountedRef.current = false; };
  }, [reload]);

  // Saves items as records (on this device first), in order. The screens update straight away.
  const saveItems = (items) => {
    journalAdd(items);
    const run = chain.current.then(async () => {
      const r = await applyItems(items);
      journalDone(items);
      await reload();
      return r;
    });
    chain.current = run.catch(() => {});
    return run;
  };

  const onSaveNote = (ds, text) => {
    setCalendarNotes((prev) => { const next = { ...prev }; if (text) next[ds] = text; else delete next[ds]; return next; });
    saveItems([{ action: "logNote", data: { Date: ds, Note: text } }]);
  };

  const onSavePlanOverride = (key, rows) => {
    setPlanOverrides((prev) => { const next = { ...prev }; if (rows) next[key] = rows; else delete next[key]; return next; });
    chain.current = chain.current.then(async () => { await savePlanOverride(key, rows); await reload(); }).catch(() => {});
  };

  const startEditDay = (dateStr, returnSlideId) => {
    setLogDate(new Date(dateStr + "T00:00:00"));
    setEditContext({ returnSlideId });
    setMode("entry");
  };
  const finishEdit = () => {
    if (editContext) {
      const idx = activeSlides.findIndex((s) => s.id === editContext.returnSlideId);
      setSlide(idx >= 0 ? idx : 0);
      setEditContext(null);
    }
    setMode("display");
  };

  const activeSlides = SLIDE_DEFS.filter((s) => settings.slides.includes(s.id));
  useEffect(() => { if (slide >= activeSlides.length) setSlide(0); }, [activeSlides.length]);
  useEffect(() => {
    if (mode !== "display" || !settings.slideshowEnabled || activeSlides.length <= 1) return;
    const t = setInterval(() => setSlide((s) => (s + 1) % activeSlides.length), (settings.slideSeconds || 150) * 1000);
    return () => clearInterval(t);
  }, [mode, settings.slideshowEnabled, settings.slideSeconds, activeSlides.length]);

  // Saves on this device only, no waiting (used when swiping to another day or closing the entry screen).
  // Grimoire's sync engine sends it shortly after, and when the app is hidden it sends a last-chance copy.
  const saveLocalOnly = (items) => {
    if (!items || !items.length) return;
    saveItems(items);
    setSyncMsg("Autosaved on this device");
  };
  const saveLocalAndSyncInBackground = (items) => { saveLocalOnly(items); sync.request("open"); };

  // "Save" and "Sync": save what was entered, then run one sync (sends only what changed, downloads only what is new).
  const pushQueue = async (itemsToSave) => {
    setBusy(true);
    try {
      let ok = 0;
      if (itemsToSave && itemsToSave.length) ok = (await saveItems(itemsToSave)).ok;
      if (!connected()) {
        setSyncMsg(itemsToSave ? "Saved locally. Add your script address and key in Grimoire's Settings to sync" : "Add your script address and key in Grimoire's Settings first.");
        return { ok, fail: mine() };
      }
      try { await importOldTabs(true); } catch { /* shown by the sync below if the connection is the problem */ }
      await sync.syncNow("open");
      await reload();
      const left = mine();
      const st = getSyncStatus();
      if (left === 0) setSyncMsg(ok ? `Saved ${ok} item${ok === 1 ? "" : "s"}` : "Up to date");
      else setSyncMsg(st.lastError ? `Couldn't save (${st.lastError}), ${left} pending, will retry` : `Saved ${ok}, ${left} pending, will retry`);
      return { ok, fail: left };
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const now = new Date();
  const todayWk = getWeekNumber(now, settings.anchorDate);
  const todayDn = dayName(now);
  const todayPlanDay = PLAN_DAYS.find((p) => p.Week === todayWk && p.DayOfWeek === todayDn);
  const todayExercises = getEffectiveExercises(planOverrides, todayWk, todayDn);

  const navWeek = (delta) => setViewDate((d) => (delta === "today" ? new Date() : addDays(d, delta * 7)));
  const navMonth = (delta) => setViewDate((d) => (delta === "today" ? new Date() : addMonths(d, delta)));

  const slideComponents = {
    today: <TodaySlide key="t" date={now} weekNum={todayWk} planDay={todayPlanDay} exercises={todayExercises} dailyLog={dailyLog} />,
    week: <WeekSlide key="w" date={viewDate} anchorDate={settings.anchorDate} dailyLog={dailyLog} exerciseLog={exerciseLog} calendarNotes={calendarNotes} onSaveNote={onSaveNote} onNav={navWeek} planOverrides={planOverrides} onEditDay={(ds) => startEditDay(ds, "week")} />,
    month: <MonthSlide key="m" date={viewDate} anchorDate={settings.anchorDate} dailyLog={dailyLog} exerciseLog={exerciseLog} calendarNotes={calendarNotes} onSaveNote={onSaveNote} onNav={navMonth} onEditDay={(ds) => startEditDay(ds, "month")} />,
    progress: <ProgressSlide key="p" dailyLog={dailyLog} exerciseLog={exerciseLog} runLog={runLog} anchorDate={settings.anchorDate} planOverrides={planOverrides} abSeconds={settings.abCycleSeconds || 15} weightWindow={settings.weightWindowDays || 21} />,
  };
  const slidesToShow = activeSlides.map((s) => slideComponents[s.id]);

  const onTouchStart = (e) => { touchStart.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchStart.current == null || slidesToShow.length < 2) return;
    const dx = e.changedTouches[0].clientX - touchStart.current;
    if (Math.abs(dx) > 60) setSlide((s) => (dx < 0 ? (s + 1) % slidesToShow.length : (s + slidesToShow.length - 1) % slidesToShow.length));
    touchStart.current = null;
  };

  if (!hydrated) {
    return (
      <div style={{ width: "100%", flex: 1, minHeight: 0, background: BG, color: SUB, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, -apple-system, sans-serif", fontSize: 14 }}>
        Loading…
      </div>
    );
  }

  return (
    <div data-testid="fitness-root" style={{ width: "100%", flex: 1, minHeight: 0, background: BG, color: INK, fontFamily: "system-ui, -apple-system, sans-serif", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", paddingLeft: "env(safe-area-inset-left, 0px)", paddingRight: "env(safe-area-inset-right, 0px)", boxSizing: "border-box" }}>
      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}} input[type=date]::-webkit-calendar-picker-indicator{filter:invert(1)}`}</style>

      <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 16px", borderBottom: `1px solid ${LINE}` }}>
        <div style={{ fontSize: 11, color: SUB, flex: 1, minWidth: 0 }} data-testid="fitness-sync-msg">{syncMsg}</div>
        <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
          <RefreshCw size={30} className={syncing ? "spin" : ""} style={{ cursor: "pointer", color: pending ? GOLD : SUB, padding: 6 }} onClick={() => pushQueue(null)} />
          {mode === "display" ? <Smartphone size={30} style={{ cursor: "pointer", color: SUB, padding: 6 }} onClick={() => { setEditContext(null); setMode("entry"); }} /> : <Monitor size={30} style={{ cursor: "pointer", color: SUB, padding: 6 }} onClick={finishEdit} />}
          <Settings size={30} style={{ cursor: "pointer", color: SUB, padding: 6 }} onClick={() => setShowSettings(true)} />
        </div>
      </div>

      {mode === "display" ? (
        <div style={{ flex: "1 1 auto", minHeight: 0, position: "relative" }} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {slidesToShow[slide]}
          {slidesToShow.length > 1 && (
            <>
              <div style={{ position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 6 }}>
                {slidesToShow.map((_, i) => <div key={i} onClick={() => setSlide(i)} style={{ width: i === slide ? 20 : 8, height: 8, borderRadius: 4, background: i === slide ? ACCENT : LINE, cursor: "pointer", transition: "width .2s" }} />)}
              </div>
              <ChevronLeft size={28} style={{ position: "absolute", left: 4, top: "50%", transform: "translateY(-50%)", color: SUB, cursor: "pointer", opacity: 0.5 }} onClick={() => setSlide((s) => (s + slidesToShow.length - 1) % slidesToShow.length)} />
              <ChevronRight size={28} style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", color: SUB, cursor: "pointer", opacity: 0.5 }} onClick={() => setSlide((s) => (s + 1) % slidesToShow.length)} />
            </>
          )}
        </div>
      ) : (
        <div style={{ flex: "1 1 auto", minHeight: 0 }}>
          <LogEntryView date={logDate} setDate={setLogDate} anchorDate={settings.anchorDate} dailyLog={dailyLog} exerciseLog={exerciseLog} runLog={runLog} queue={NO_QUEUE} planOverrides={planOverrides} onSavePlan={onSavePlanOverride} isEditingHistorical={!!editContext} onDone={finishEdit} onSave={pushQueue} onSwipeSave={saveLocalAndSyncInBackground} onLocalSave={saveLocalOnly} onSync={(items) => pushQueue(items)} syncing={syncing} pendingCount={pending} />
        </div>
      )}

      {showSettings && <SettingsModal settings={settings} wakeText={wakeLockText(wake, mode === "display")} onClose={() => setShowSettings(false)} onSave={async (s) => { setSettings(s); await storeSet("settings", s); setShowSettings(false); }} onOpenPlanEditor={() => { setShowSettings(false); setShowPlanEditor(true); }} />}
      {showPlanEditor && <PlanEditorModal planOverrides={planOverrides} onClose={() => setShowPlanEditor(false)} onSave={onSavePlanOverride} />}
    </div>
  );
}

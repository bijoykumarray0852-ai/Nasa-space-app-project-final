(function(){
  const TOTAL_DAYS = 180;
  const indicators = ['bone','cardio','immune','radiation','behavioral'];
  const meta = {
    bone: { label: 'BONE SCENARIO', full: 'Illustrative Bone Scenario Index', unit: '%', start: 100, sub: 'Synthetic scenario index only; not a bone-density measurement and not calibrated to a study.' },
    cardio: { label: 'CARDIO SCENARIO', full: 'Illustrative Cardiovascular Scenario Index', unit: '%', start: 100, sub: 'Synthetic scenario index only; not measured cardiovascular status or a personal risk estimate.' },
    immune: { label: 'IMMUNE SCENARIO', full: 'Illustrative Immune Scenario Index', unit: '%', start: 100, sub: 'Synthetic scenario index only; not a biomarker or immune-system measurement.' },
    radiation: { label: 'RADIATION SCENARIO', full: 'Illustrative Radiation Scenario Dose', unit: 'mSv', start: 0, sub: 'Synthetic scenario value only; not an operational dose record or exposure limit.' },
    behavioral: { label: 'BEHAVIOR SCENARIO', full: 'Illustrative Behavioral Scenario Index', unit: '%', start: 100, sub: 'Synthetic scenario index only; not a mental-health measurement or assessment.' }
  };
  const dailyChallengeStorageKey = 'vitals_daily_challenge_v1';
  const dailyChallengeScenarios = [
    {
      title: 'The unexplained radiation spike',
      brief: 'During a routine task, one radiation monitor reports a sudden spike while the other display remains steady. The crew is not in immediate danger based on the information available, but the reading is unverified.',
      choices: [
        { label: 'Pause and verify', detail: 'Pause the affected activity, compare independent readings, and follow the mission radiation protocol before resuming.', score: 100, feedback: 'Strong call: protect the crew while checking the data source and applying the established radiation procedure.' },
        { label: 'Log and continue', detail: 'Record the reading and continue the activity while waiting for the next scheduled check.', score: 25, feedback: 'A single reading can be faulty, but continuing without verification skips an important operational safeguard.' },
        { label: 'Assume the worst', detail: 'Treat the reading as confirmed and make an unscheduled mission-wide change without checking the other monitor.', score: 60, feedback: 'Caution matters, but verify the signal and use the established response plan before escalating beyond the available evidence.' }
      ]
    },
    {
      title: 'Telemetry dropout mid-workout',
      brief: 'A wearable feed drops out during a scheduled exercise session. No new reading is available, and the previous values are several minutes old.',
      choices: [
        { label: 'Check the sensor and protocol', detail: 'Pause the session, check the connection and timestamp, then follow the approved procedure for missing readings.', score: 100, feedback: 'Strong call: missing data is not a normal reading. Pause, verify, and use the agreed fallback procedure.' },
        { label: 'Use the last reading', detail: 'Treat the last displayed value as current and finish the session.', score: 25, feedback: 'A stale reading cannot confirm current conditions. Check the sensor status before relying on it.' },
        { label: 'Delete the gap', detail: 'Remove the missing interval from the log so the trend looks continuous.', score: 0, feedback: 'Keep data gaps visible. Hiding missing readings can make later review misleading.' }
      ]
    },
    {
      title: 'Ground link is delayed',
      brief: 'A non-urgent equipment question is waiting for ground support, but the communication delay means the reply will not arrive before the next task window.',
      choices: [
        { label: 'Use the approved checklist', detail: 'Check the onboard procedure, document the decision, and send a concise update for ground review when the link returns.', score: 100, feedback: 'Strong call: use pre-approved procedures, preserve a clear record, and account for the communication delay.' },
        { label: 'Repeat the message', detail: 'Send the same question repeatedly until a reply arrives.', score: 25, feedback: 'Repeated messages add noise and cannot shorten a physical communication delay. Use the planned protocol.' },
        { label: 'Guess and move on', detail: 'Make an undocumented choice based on memory so the schedule stays on time.', score: 0, feedback: 'Schedule pressure is not a substitute for procedure or traceable decisions. Document uncertainty and use approved guidance.' }
      ]
    },
    {
      title: 'Conflicting sensor timestamps',
      brief: 'Two displays show similar values, but their timestamps differ by several minutes. A trend chart makes the readings look like a sudden change.',
      choices: [
        { label: 'Align time and source', detail: 'Check timestamps, source labels, and data quality before interpreting the trend; retain the original observations.', score: 100, feedback: 'Strong call: timestamp and source checks can distinguish a real change from mismatched data.' },
        { label: 'Average both values', detail: 'Average the readings and use that single number as the current value.', score: 35, feedback: 'Combining readings with different observation times may create a value that was never measured.' },
        { label: 'Use the newest-looking chart', detail: 'Trust the trend visualization without checking the underlying observations.', score: 10, feedback: 'Charts can hide source and timing differences. Inspect the underlying data before acting on a trend.' }
      ]
    },
    {
      title: 'Sleep schedule under pressure',
      brief: 'A busy work block has pushed the planned sleep window later for several nights. The next task is important but can be reviewed and rescheduled.',
      choices: [
        { label: 'Coordinate the schedule', detail: 'Raise the workload conflict with the crew, protect the planned rest opportunity, and document any approved schedule change.', score: 100, feedback: 'Strong call: workload and rest are team-level operational concerns. Coordinate changes instead of silently accumulating fatigue.' },
        { label: 'Push through quietly', detail: 'Keep the original workload and skip the rest window without telling the team.', score: 0, feedback: 'Unreported workload changes make it harder for the team to plan and monitor cumulative strain.' },
        { label: 'Cancel everything', detail: 'Cancel all upcoming work without checking priorities or coordinating a revised plan.', score: 45, feedback: 'Protecting rest matters, but coordinate a workable schedule using the mission plan rather than making an undocumented blanket change.' }
      ]
    },
    {
      title: 'Unexpected equipment warning',
      brief: 'An exercise device displays a maintenance warning just before a scheduled session. The warning does not identify a safe workaround.',
      choices: [
        { label: 'Stop and report', detail: 'Do not use the flagged equipment; record the warning and follow the approved maintenance or alternate-activity procedure.', score: 100, feedback: 'Strong call: respect equipment warnings and use only approved maintenance or alternate procedures.' },
        { label: 'Restart until it clears', detail: 'Power-cycle the device repeatedly and use it if the warning disappears.', score: 20, feedback: 'A cleared display does not necessarily mean a fault is resolved. Follow the documented procedure.' },
        { label: 'Try a workaround', detail: 'Continue at a lower setting without an approved workaround.', score: 0, feedback: 'An improvised workaround may bypass a safety check. Stop and use the approved process.' }
      ]
    },
    {
      title: 'A trend changes after data import',
      brief: 'A newly imported file changes a health trend. The file has values but its units and source metadata are incomplete.',
      choices: [
        { label: 'Validate before using', detail: 'Check units, source, time range, and validation status; keep the import flagged until the metadata is confirmed.', score: 100, feedback: 'Strong call: plausible numbers are not automatically trustworthy. Validate provenance and units before interpreting them.' },
        { label: 'Trust the file', detail: 'Accept the trend because the numbers fall within expected-looking ranges.', score: 15, feedback: 'A plausible range does not establish correct units, source, or timestamp.' },
        { label: 'Overwrite the old trend', detail: 'Replace the previous series so the dashboard has only one clean line.', score: 0, feedback: 'Preserve source data and history. Reconcile imports transparently instead of concealing discrepancies.' }
      ]
    }
  ];
  let dailyChallengeState = loadDailyChallengeState();

  // ---- Settings ----
  const settings = {
    theme: localStorage.getItem('vitals_theme') || 'dark',
    sound: localStorage.getItem('vitals_sound') !== '0',
    reduceMotion: window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  };
  let appRole = localStorage.getItem('vitals_role') || 'crew';
  document.documentElement.setAttribute('data-theme', settings.theme);
  document.body.dataset.role = appRole;
  if (settings.reduceMotion) document.body.classList.add('reduce-motion');

  // ---- Achievements ----
  const achievements = {
    firstDay:   { icon: '🚀', name: 'First Step',       desc: 'Complete your first mission day.' },
    streak7:    { icon: '🏅', name: 'Steady Hands',     desc: '7 consecutive nominal days.' },
    streak30:   { icon: '🥇', name: 'Iron Will',        desc: '30 consecutive nominal days.' },
    missionHalf:{ icon: '🌗', name: 'Halfway There',    desc: 'Reach Day 90.' },
    missionDone:{ icon: '🏆', name: 'Mission Complete', desc: 'Complete all 180 days.' },
    boneKeeper: { icon: '🦴', name: 'Bone Keeper',      desc: 'Keep bone density ≥ 95% for 30 days.' },
    radMiser:   { icon: '☢️', name: 'Radiation Miser',  desc: 'Stay under 100 mSv for 60 days.' },
    flawless:   { icon: '💎', name: 'Flawless',         desc: 'Reach Day 90 with no critical alert.' },
    evaVet:     { icon: '👨‍🚀', name: 'EVA Veteran',    desc: 'Complete 5 EVA days.' },
    comms10:    { icon: '💬', name: 'Communicator',     desc: 'Send 10 comms messages.' }
  };
  let unlocked = new Set();
  let evaCount = 0, commsSent = 0, critAlertSeen = false;

  // ---- State ----
  let state = { day: 0, history: {}, current: {} };
  indicators.forEach(k => { state.current[k] = meta[k].start; state.history[k] = [meta[k].start]; });

  let activeIndicator = 'bone';
  let compareIndicator = null;
  let trendRange = 'full';
  let telemetry = [];
  let liveTelemetryHistory = [];
  let telemetryAlertHistory = [];
  let dataQualityEvents = [];
  let predictionOutcomes = [];
  let latestLiveFrame = null;
  let lastLiveTelemetryAt = 0;
  let telemetryIntervalMs = [5000, 10000, 30000, 60000].includes(Number(localStorage.getItem('vitals_telemetry_interval')))
    ? Number(localStorage.getItem('vitals_telemetry_interval')) : 5000;
  let telemetryPaused = false;
  let telemetryTimer = null;
  let telemetryMonitorTimer = null;
  let telemetryServerOnline = false;
  let browserNotificationsEnabled = localStorage.getItem('vitals_browser_notifications') === '1';
  let pendingMissingSpo2 = false;
  const activeTelemetryIssues = new Set();
  let missionStartMs = Date.now();
  let alertsHistory = [];
  let prevStatus = { bone: 'ok', cardio: 'ok', immune: 'ok', radiation: 'ok', behavioral: 'ok' };
  let undoStack = [];
  let radMilestoneHit = false;
  let activeDayForRestore = null;
  let twinDay = null;
  let twinSystem = 'bone';
  let twinScenario = 'optimal';
  let lastScenarioResult = null;

  // ---- Persistence ----
  const MISSION_ID = 'default';
  const DB_API = `/api/mission-state/${MISSION_ID}`;
  const DB_STREAM = `${DB_API}/stream`;
  const REALTIME_CLIENT_ID = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  let serverAuthenticated = false;
  let dbSaveTimer = null;
  let lastPersistedAt = 0;
  let realtimeErrorToastAt = 0;
  let dbOnline = true;
  let presenceUsers = [];
  let replayTimer = null;
  let replayDay = null;
  let dataSourceMode = localStorage.getItem('vitals_source_mode') || 'simulation';
  let authUser = (() => {
    try { return JSON.parse(localStorage.getItem('vitals_auth_user') || 'null'); }
    catch(e) { return null; }
  })();
  let surgeonNotes = [];
  let auditTrail = [];
  let auditSyncMessage = 'Audit trail is stored on this device.';
  let auditSyncRunning = false;
  function readOfflineQueue() {
    try { return JSON.parse(localStorage.getItem('vitals_offline_queue') || '[]'); }
    catch(e) { return []; }
  }

  function writeOfflineQueue(queue) {
    localStorage.setItem('vitals_offline_queue', JSON.stringify(queue.slice(-12)));
  }

  function queueOfflinePayload(payload) {
    const queue = readOfflineQueue();
    queue.push(payload);
    writeOfflineQueue(queue);
    renderOperations();
  }

  function createAuditId() {
    return (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  }

  function ensureIncidentIds() {
    alertsHistory.forEach(alert => {
      if (!alert.incidentId) alert.incidentId = createAuditId();
      if (!alert.status) alert.status = 'open';
      if (alert.assignedTo === undefined) alert.assignedTo = '';
      if (!alert.createdAt) alert.createdAt = Date.now();
    });
  }

  function renderAuditSyncStatus() {
    const status = document.getElementById('auditSyncStatus');
    if (!status) return;
    status.textContent = `${auditSyncMessage} ${auditTrail.length} event${auditTrail.length === 1 ? '' : 's'} recorded.`;
  }

  function renderAuditTrail() {
    const timeline = document.getElementById('auditTimeline');
    if (!timeline) return;
    timeline.replaceChildren();
    if (!auditTrail.length) {
      const empty = document.createElement('li');
      empty.className = 'audit-empty';
      empty.textContent = 'No mission events recorded yet.';
      timeline.appendChild(empty);
      renderAuditSyncStatus();
      return;
    }
    [...auditTrail].sort((a, b) => b.timestamp - a.timestamp).forEach(event => {
      const item = document.createElement('li');
      item.className = 'audit-event';
      const heading = document.createElement('div');
      heading.className = 'audit-event-heading';
      const action = document.createElement('strong');
      action.textContent = event.action.replaceAll('_', ' ').toUpperCase();
      const sync = document.createElement('span');
      sync.className = event.synced ? 'audit-synced' : 'audit-local';
      sync.textContent = event.synced ? 'DATABASE SYNCED' : 'LOCAL';
      heading.append(action, sync);
      const detail = document.createElement('p');
      detail.textContent = `${event.actor} (${event.role}) · Mission day ${event.day} · ${event.entityType}${event.entityId ? ` #${event.entityId}` : ''}`;
      const timestamp = document.createElement('time');
      timestamp.dateTime = new Date(event.timestamp).toISOString();
      timestamp.textContent = new Date(event.timestamp).toLocaleString();
      const values = document.createElement('details');
      values.className = 'audit-values';
      const summary = document.createElement('summary');
      summary.textContent = 'Before / after values';
      const valueText = document.createElement('pre');
      valueText.textContent = JSON.stringify({ before: event.before ?? null, after: event.after ?? null }, null, 2);
      values.append(summary, valueText);
      item.append(heading, detail, timestamp, values);
      timeline.appendChild(item);
    });
    renderAuditSyncStatus();
  }

  function updateAuditEvent(eventId, updates) {
    const event = auditTrail.find(item => item.id === eventId);
    if (!event) return;
    Object.assign(event, updates);
    renderAuditTrail();
  }

  async function syncAuditTrailToDatabase() {
    if (!location.protocol.startsWith('http') || !serverAuthenticated || auditSyncRunning) return;
    const pending = auditTrail.filter(event => !event.synced);
    if (!pending.length) return;
    auditSyncRunning = true;
    try {
      for (const event of pending) {
        const response = await fetch(`${DB_API}/audit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(event)
        });
        if (!response.ok) throw new Error(`Audit sync failed (${response.status}).`);
        updateAuditEvent(event.id, { synced: true });
      }
      auditSyncMessage = 'Mission audit trail synced to database.';
      saveState();
    } catch (error) {
      auditSyncMessage = 'Database unavailable; audit events remain safely stored locally.';
      console.error('Could not sync mission audit trail.', error);
    } finally {
      auditSyncRunning = false;
      renderAuditTrail();
    }
  }

  async function loadAuditTrailFromDatabase() {
    if (!location.protocol.startsWith('http') || !serverAuthenticated) return;
    try {
      const events = [];
      const pageSize = 1000;
      let offset = 0;
      while (true) {
        const response = await fetch(`${DB_API}/audit?limit=${pageSize}&offset=${offset}`);
        if (!response.ok) throw new Error(`Audit history load failed (${response.status}).`);
        const data = await response.json();
        const page = Array.isArray(data.events) ? data.events : [];
        events.push(...page);
        if (page.length < pageSize) break;
        offset += page.length;
      }
      const byId = new Map(auditTrail.map(event => [event.id, event]));
      events.forEach(event => byId.set(event.id, { ...event, synced: true }));
      auditTrail = [...byId.values()].sort((a, b) => b.timestamp - a.timestamp);
      auditSyncMessage = 'Mission audit trail loaded from database.';
      saveState();
      renderAuditTrail();
      await syncAuditTrailToDatabase();
    } catch (error) {
      auditSyncMessage = 'Database unavailable; showing this device’s saved audit history.';
      console.error('Could not load mission audit trail.', error);
      renderAuditTrail();
    }
  }

  function recordAuditEvent(action, entityType, entityId, before, after) {
    const event = {
      id: createAuditId(),
      day: state.day,
      actor: authUser?.name || document.getElementById('crewName')?.value?.trim() || 'Crew',
      role: authUser?.role || appRole,
      action,
      entityType,
      entityId: entityId == null ? null : String(entityId),
      before: before == null ? null : JSON.parse(JSON.stringify(before)),
      after: after == null ? null : JSON.parse(JSON.stringify(after)),
      timestamp: Date.now(),
      synced: false
    };
    auditTrail.unshift(event);
    saveState();
    renderAuditTrail();
    syncAuditTrailToDatabase();
    return event;
  }

  function missionPayload() {
    const persistedAt = Date.now();
    return {
      day: state.day, current: state.current, history: state.history,
      telemetry, alertsHistory, commsThread, unlocked: [...unlocked],
      liveTelemetryHistory, telemetryAlertHistory,
      dataQualityEvents, predictionOutcomes,
      surgeonNotes, dataSourceMode, authUser,
      lastScenarioResult,
      commsDelaySeconds,
      auditTrail,
      evaCount, commsSent, critAlertSeen, radMilestoneHit,
      unreadComms, cleanStreak, bestStreak, worstDayStreak,
      crewName: document.getElementById('crewName').value,
      persistedAt,
      sourceClientId: REALTIME_CLIENT_ID
    };
  }

  function applyMissionPayload(s) {
    state.day = s.day || 0;
    state.current = s.current || state.current;
    state.history = s.history || state.history;
    telemetry = s.telemetry || [];
    liveTelemetryHistory = s.liveTelemetryHistory || liveTelemetryHistory;
    telemetryAlertHistory = s.telemetryAlertHistory || telemetryAlertHistory;
    dataQualityEvents = Array.isArray(s.dataQualityEvents) ? s.dataQualityEvents : dataQualityEvents;
    predictionOutcomes = Array.isArray(s.predictionOutcomes) ? s.predictionOutcomes : predictionOutcomes;
    lastScenarioResult = s.lastScenarioResult || null;
    if (Number.isFinite(Number(s.commsDelaySeconds))) commsDelaySeconds = Math.round(Math.max(1, Math.min(120, Number(s.commsDelaySeconds))));
    latestLiveFrame = liveTelemetryHistory[0] || latestLiveFrame;
    lastLiveTelemetryAt = latestLiveFrame ? new Date(latestLiveFrame.timestamp).getTime() : lastLiveTelemetryAt;
    alertsHistory = s.alertsHistory || [];
    commsThread = s.commsThread || [];
    surgeonNotes = s.surgeonNotes || [];
    const auditEventsById = new Map(auditTrail.map(event => [event.id, event]));
    (Array.isArray(s.auditTrail) ? s.auditTrail : []).forEach(event => {
      if (!event || typeof event.id !== 'string') return;
      const current = auditEventsById.get(event.id);
      auditEventsById.set(event.id, {
        ...current,
        ...event,
        synced: Boolean(current?.synced || event.synced)
      });
    });
    auditTrail = [...auditEventsById.values()].sort((a, b) => b.timestamp - a.timestamp);
    ensureIncidentIds();
    dataSourceMode = s.dataSourceMode || dataSourceMode;
    authUser = s.authUser || authUser;
    unlocked = new Set(s.unlocked || []);
    evaCount = s.evaCount || 0;
    commsSent = s.commsSent || 0;
    critAlertSeen = s.critAlertSeen || false;
    radMilestoneHit = s.radMilestoneHit || false;
    unreadComms = s.unreadComms || 0;
    cleanStreak = s.cleanStreak || 0;
    bestStreak = s.bestStreak || 0;
    worstDayStreak = s.worstDayStreak || 0;
    lastPersistedAt = Math.max(lastPersistedAt, s.persistedAt || 0);
    if (s.crewName) document.getElementById('crewName').value = s.crewName;
  }

  function syncStateToDatabase(payload) {
    if (!location.protocol.startsWith('http')) return;
    if (!serverAuthenticated) {
      dbOnline = false;
      return;
    }
    clearTimeout(dbSaveTimer);
    lastPersistedAt = Math.max(lastPersistedAt, payload.persistedAt || 0);
    dbSaveTimer = setTimeout(() => {
      fetch(DB_API, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(res => {
        dbOnline = res.ok;
        if (!res.ok) queueOfflinePayload(payload);
        renderOperations();
      }).catch(() => {
        dbOnline = false;
        queueOfflinePayload(payload);
      });
    }, 250);
  }

  async function flushOfflineQueue() {
    if (!location.protocol.startsWith('http') || !serverAuthenticated) return;
    const queue = readOfflineQueue();
    if (!queue.length) { renderOperations(); return; }
    const latest = queue[queue.length - 1];
    try {
      const res = await fetch(DB_API, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(latest)
      });
      if (!res.ok) throw new Error('Sync failed');
      writeOfflineQueue([]);
      dbOnline = true;
      pushToast('Offline mission changes synced to database.', 'ok');
    } catch(e) {
      dbOnline = false;
    }
    renderOperations();
  }

  async function loadStateFromDatabase() {
    if (!location.protocol.startsWith('http') || !serverAuthenticated) return false;
    try {
      const res = await fetch(DB_API);
      if (res.status === 404) return false;
      if (!res.ok) throw new Error('Database load failed');
      const data = await res.json();
      if (!data.payload) return false;
      applyMissionPayload(data.payload);
      localStorage.setItem('vitals_state', JSON.stringify(data.payload));
      return true;
    } catch(e) {
      return false;
    }
  }

  function refreshFromPersistedState() {
    buildCards();
    renderAll();
    renderAuditTrail();
    renderPreview();
    renderStreaks();
    renderComms();
    document.getElementById('commsDelaySeconds').value = String(commsDelaySeconds);
    updateAssistantStats();
    const badge = document.getElementById('commsBadge');
    if (badge) {
      badge.textContent = unreadComms;
      badge.style.display = unreadComms ? 'inline-block' : 'none';
    }
    renderTelemetryTable();
    renderTelemetryAlertHistory();
    renderTelemetryStatus();
    els.advanceBtn.textContent = `LOG DAY ${state.day + 1} & ADVANCE`;
  }

  function resetMissionUi(message) {
    state.day = 0;
    indicators.forEach(k => { state.current[k] = meta[k].start; state.history[k] = [meta[k].start]; prevStatus[k] = 'ok'; });
    telemetry = []; alertsHistory = []; commsThread = []; surgeonNotes = []; unreadComms = 0;
    lastScenarioResult = null;
    liveTelemetryHistory = []; telemetryAlertHistory = []; dataQualityEvents = []; predictionOutcomes = [];
    latestLiveFrame = null; lastLiveTelemetryAt = 0;
    activeTelemetryIssues.clear();
    cleanStreak = 0; bestStreak = 0; worstDayStreak = 0; undoStack = [];
    unlocked = new Set(); evaCount = 0; commsSent = 0; critAlertSeen = false; radMilestoneHit = false;
    renderStreaks();
    document.getElementById('riskDetail').textContent = "Advance a few mission days, then click a cell to see that day's readings.";
    document.getElementById('focusPanel').className = 'panel focus-panel';
    document.getElementById('focusText').textContent = 'Advance a mission day to get a priority recommendation.';
    document.getElementById('commsBadge').style.display = 'none';
    document.getElementById('telemetryBody').innerHTML = '';
    document.getElementById('telemetryAlertHistory').innerHTML = '<li class="telemetry-alert-empty">No telemetry alerts recorded.</li>';
    localStorage.removeItem('vitals_live_telemetry');
    localStorage.removeItem('vitals_telemetry_alerts');
    renderComms();
    els.eventLine.textContent = message || 'Systems reset. Mission restarting from Day 0.';
    els.eventLine.classList.remove('warn');
    els.advanceBtn.textContent = 'LOG DAY 1 & ADVANCE';
    renderAll();
  }

  function connectRealtimeDatabase() {
    if (!serverAuthenticated || !location.protocol.startsWith('http') || !window.EventSource) return;
    const stream = new EventSource(DB_STREAM);
    stream.addEventListener('state', (event) => {
      try {
        const data = JSON.parse(event.data);
        const payload = data.payload;
        if (!payload || payload.sourceClientId === REALTIME_CLIENT_ID) return;
        if (payload.persistedAt && payload.persistedAt <= lastPersistedAt) return;
        const knownAlertIds = new Set(alertsHistory.map(alert => alert.incidentId).filter(Boolean));
        applyMissionPayload(payload);
        alertsHistory
          .filter(alert => alert.incidentId && !knownAlertIds.has(alert.incidentId))
          .forEach(alert => {
            pushToast(alert.text, alert.sev || 'watch');
            announceMissionAlert(alert);
          });
        localStorage.setItem('vitals_state', JSON.stringify(payload));
        refreshFromPersistedState();
        pushToast('Realtime mission state synced from database.', 'ok');
      } catch(e) {}
    });
    stream.addEventListener('reset', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.sourceClientId === REALTIME_CLIENT_ID) return;
      } catch(e) {}
      const before = {
        day: state.day,
        current: { ...state.current },
        alertCount: alertsHistory.length,
        noteCount: surgeonNotes.length
      };
      localStorage.removeItem('vitals_state');
      resetMissionUi('Realtime reset received. Mission restarting from Day 0.');
      recordAuditEvent('mission.reset_received', 'mission', MISSION_ID, before, {
        day: state.day,
        current: { ...state.current },
        auditHistoryRetained: true
      });
      pushToast('Mission reset synced from database.', 'watch');
    });
    stream.addEventListener('presence', (event) => {
      try {
        const data = JSON.parse(event.data);
        presenceUsers = Array.isArray(data.users) ? data.users.filter(user =>
          user && typeof user.name === 'string' && typeof user.role === 'string' &&
          Number.isFinite(user.lastSeen)
        ) : [];
        renderOperations();
      } catch(e) {}
    });
    stream.addEventListener('telemetry', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.sourceClientId === REALTIME_CLIENT_ID) return;
        if (data.frame) receiveTelemetryFrame(data.frame, data.alerts || [], true);
        else (data.alerts || []).forEach(alert => recordTelemetryAlert(alert));
      } catch(e) {
        console.error('Could not process realtime telemetry event.', e);
      }
    });
    stream.onerror = () => {
      const now = Date.now();
      if (now - realtimeErrorToastAt > 10000) {
        realtimeErrorToastAt = now;
        pushToast('Realtime database link is reconnecting.', 'watch');
      }
    };
  }

  function setRole(role, persist = true) {
    appRole = role || 'crew';
    document.body.dataset.role = appRole;
    if (persist) localStorage.setItem('vitals_role', appRole);
    document.querySelectorAll('#roleSwitch button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.role === appRole);
    });
    renderOperations();
    postPresence();
  }

  function roleBriefText() {
    const weakest = weakestSignal();
    const briefs = {
      crew: [
        ['PRIMARY VIEW', 'Daily actions, check-ins, personal trend awareness.'],
        ['NEXT ACTION', actionFor(weakest.key)]
      ],
      surgeon: [
        ['PRIMARY VIEW', 'Clinical risk review, unresolved alerts, and radiation margin.'],
        ['WATCH ITEM', `${meta[weakest.key].label}: ${weakest.status.toUpperCase()}`]
      ],
      ground: [
        ['PRIMARY VIEW', 'Realtime coordination, comms, structured database health, report export.'],
        ['SYNC STATUS', dbOnline ? 'Database link nominal' : 'Using offline queue']
      ],
      admin: [
        ['PRIMARY VIEW', 'Full mission administration, all permissions, database structure, and report controls.'],
        ['SYSTEM STATE', dbOnline ? 'Database writable' : 'Offline-first fallback active']
      ]
    };
    return briefs[appRole] || briefs.crew;
  }

  function actionFor(key) {
    const actions = {
      bone: 'Increase resistive exercise and track ARED completion.',
      cardio: 'Add controlled cardio intervals and watch orthostatic symptoms.',
      immune: 'Prioritize sleep/rest and flag inflammation trend if persistent.',
      radiation: 'Minimize EVA exposure and use shielded cabin zones.',
      behavioral: 'Schedule support contact and stabilize sleep timing.'
    };
    return actions[key] || 'Continue nominal protocol.';
  }

  function weakestSignal() {
    const scored = indicators.map(key => {
      const value = state.current[key];
      const score = key === 'radiation' ? Math.max(0, 100 - (value / 600) * 100) : value;
      return { key, value, score, status: statusFor(key, value) };
    }).sort((a, b) => a.score - b.score);
    return scored[0];
  }

  function forecastSignal(key, days) {
    const hist = state.history[key] || [];
    const current = state.current[key];
    const sample = hist.slice(-8);
    let slope = 0;
    if (sample.length >= 2) slope = (sample[sample.length - 1] - sample[0]) / (sample.length - 1);
    const fallback = key === 'radiation' ? 0.55 : key === 'bone' ? -0.18 : -0.08;
    const projected = current + (slope || fallback) * days;
    const clamped = key === 'radiation' ? Math.max(0, Math.min(650, projected)) : Math.max(0, Math.min(100, projected));
    return { key, days, value: clamped, status: statusFor(key, clamped) };
  }

  function renderOperations() {
    renderAuthControls();
    const roleBrief = document.getElementById('roleBrief');
    if (roleBrief) {
      roleBrief.innerHTML = roleBriefText().map(([k, v]) =>
        `<div class="ops-card"><div class="k">${k}</div><div class="v">${v}</div></div>`
      ).join('');
    }
    document.querySelectorAll('#roleSwitch button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.role === appRole);
    });

    const presenceEl = document.getElementById('presenceList');
    if (presenceEl) {
      const users = presenceUsers.length ? presenceUsers : [{ role: authUser?.role || appRole, name: authUser?.name || 'This device', clientId: REALTIME_CLIENT_ID, lastSeen: Date.now() }];
      presenceEl.replaceChildren(...users.map(user => {
        const item = document.createElement('div');
        item.className = 'presence-item';
        const dot = document.createElement('span');
        dot.className = 'presence-dot';
        const details = document.createElement('div');
        const role = document.createElement('div');
        role.className = 'k';
        role.textContent = (typeof user.role === 'string' ? user.role : 'crew').toUpperCase();
        const name = document.createElement('div');
        name.className = 'v';
        name.textContent = typeof user.name === 'string' ? user.name : 'Operator';
        details.append(role, name);
        const age = document.createElement('span');
        age.className = 'presence-age';
        age.textContent = presenceAge(user.lastSeen);
        item.append(dot, details, age);
        return item;
      }));
    }

    const forecastEl = document.getElementById('forecastGrid');
    if (forecastEl) {
      const horizons = [7, 30];
      forecastEl.innerHTML = indicators.flatMap(key => horizons.map(days => forecastSignal(key, days))).map(item => {
        const unit = item.key === 'radiation' ? ' mSv' : '%';
        return `<div class="forecast-card ${item.status}"><div class="k">${meta[item.key].label}</div><div class="v">${Math.round(item.value)}${unit}</div><div class="horizon">DAY +${item.days} ${item.status.toUpperCase()}</div></div>`;
      }).join('');
    }

    const syncEl = document.getElementById('syncGrid');
    if (syncEl) {
      const queue = readOfflineQueue();
      syncEl.innerHTML = [
        ['DATABASE', dbOnline ? 'ONLINE' : 'OFFLINE / RETRYING'],
        ['OFFLINE QUEUE', `${queue.length} pending save${queue.length === 1 ? '' : 's'}`],
        ['LAST SAVE', lastPersistedAt ? new Date(lastPersistedAt).toLocaleTimeString() : 'Not saved yet']
      ].map(([k, v]) => `<div class="sync-item"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
    }

    const slider = document.getElementById('replaySlider');
    if (slider) {
      slider.max = Math.max(0, state.day);
      if (replayDay === null) slider.value = state.day;
      document.getElementById('replayLabel').textContent = replayDay === null ? `Day ${state.day}` : `Replay Day ${replayDay}`;
    }
    renderSourceMode();
    renderSurgeonNotes();
  }

  function presenceAge(lastSeen) {
    if (!lastSeen) return 'synced now';
    const seconds = Math.max(0, Math.round((Date.now() - lastSeen) / 1000));
    if (seconds < 4) return 'online now';
    if (seconds < 60) return `synced ${seconds}s ago`;
    return `synced ${Math.round(seconds / 60)}m ago`;
  }

  function renderServerAuthStatus(message) {
    const status = document.getElementById('serverAuthStatus');
    const form = document.getElementById('serverAccessForm');
    const logout = document.getElementById('serverLogoutBtn');
    if (status) status.textContent = message;
    if (form) form.hidden = serverAuthenticated;
    if (logout) logout.hidden = !serverAuthenticated;
  }

  async function checkServerSession() {
    if (!location.protocol.startsWith('http')) {
      renderServerAuthStatus('Browser-only mode; server access is unavailable.');
      return false;
    }
    try {
      const response = await fetch('/api/auth/session');
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Server access check failed (${response.status}).`);
      serverAuthenticated = result.authenticated === true;
      renderServerAuthStatus(serverAuthenticated
        ? 'Connected to the shared server. This shared password does not identify individual users.'
        : 'Connect with the shared server password to use MySQL, realtime updates, and shared workspace sync.');
      return serverAuthenticated;
    } catch (error) {
      serverAuthenticated = false;
      renderServerAuthStatus(`Server access unavailable: ${error.message}`);
      console.error('Could not check server authentication status.', error);
      return false;
    }
  }

  function renderAuthControls() {
    const status = document.getElementById('authStatus');
    const loginName = document.getElementById('loginName');
    const loginRole = document.getElementById('loginRole');
    if (loginName && authUser?.name) loginName.value = authUser.name;
    if (loginRole && authUser?.role) loginRole.value = authUser.role;
    document.body.dataset.authRole = authUser?.role || appRole;
    if (status) {
      status.textContent = authUser
        ? `Signed in as ${authUser.name || 'Operator'} (${(authUser.role || appRole).toUpperCase()}). Permission profile is active in this demo.`
        : 'Not signed in. Demo permissions are local to this browser.';
    }

    const canWriteNotes = ['surgeon', 'admin'].includes(authUser?.role || appRole);
    ['noteAlertSelect', 'noteStatus', 'noteSeverity', 'noteText', 'addNoteBtn'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = !canWriteNotes;
    });
    const reportBtn = document.getElementById('reportBtn');
    if (reportBtn) reportBtn.disabled = authUser && !['ground', 'admin', 'surgeon'].includes(authUser.role);
  }

  function renderSourceMode() {
    document.querySelectorAll('#sourceModeSwitch button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.sourceMode === dataSourceMode);
    });
    const status = document.getElementById('sourceModeStatus');
    if (!status) return;
    const importedDays = telemetry.length ? `${Math.min(...telemetry.map(f => f.day))}-${Math.max(...telemetry.map(f => f.day))}` : 'none';
    const copy = {
      simulation: 'Simulation mode is active. Daily check-ins generate the next telemetry frame.',
      imported: `Imported CSV mode is active. Next days will prefer imported telemetry (${importedDays}).`,
      hybrid: `Hybrid mode is active. Simulation runs first, then imported telemetry corrects matching days (${importedDays}).`
    };
    status.textContent = copy[dataSourceMode] || copy.simulation;
  }

  function renderIncidentManagement() {
    const list = document.getElementById('incidentList');
    if (!list) return;
    ensureIncidentIds();
    list.replaceChildren();
    if (!alertsHistory.length) {
      const empty = document.createElement('p');
      empty.className = 'sub';
      empty.textContent = 'No incidents yet. Health alerts will appear here as the mission progresses.';
      list.appendChild(empty);
      return;
    }
    alertsHistory.slice(0, 30).forEach((alert, index) => {
      const card = document.createElement('article');
      card.className = `incident-card ${alert.sev || 'watch'} ${alert.status || 'open'}`;
      const header = document.createElement('div');
      header.className = 'incident-header';
      const title = document.createElement('strong');
      title.textContent = `DAY ${alert.day} · ${(alert.sev || 'watch').toUpperCase()}`;
      const status = document.createElement('span');
      status.className = `incident-status ${alert.status || 'open'}`;
      status.textContent = (alert.status || 'open').replaceAll('_', ' ').toUpperCase();
      header.append(title, status);
      const text = document.createElement('p');
      text.textContent = alert.text;
      const timestamp = document.createElement('time');
      timestamp.dateTime = new Date(alert.createdAt).toISOString();
      timestamp.textContent = `Raised ${new Date(alert.createdAt).toLocaleString()}`;
      const assignment = document.createElement('label');
      assignment.className = 'incident-assignment';
      assignment.textContent = 'Assigned to';
      const select = document.createElement('select');
      select.className = 'text-input';
      select.dataset.incidentAssign = String(index);
      [
        ['', 'Unassigned'],
        ['crew', 'Crew'],
        ['surgeon', 'Flight Surgeon'],
        ['ground', 'Ground Control']
      ].forEach(([value, label]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        option.selected = (alert.assignedTo || '') === value;
        select.appendChild(option);
      });
      assignment.appendChild(select);
      const actions = document.createElement('div');
      actions.className = 'incident-actions';
      [
        ['acknowledged', 'Acknowledge'],
        ['resolved', 'Resolve']
      ].forEach(([action, label]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'tab-btn';
        button.dataset.incidentAction = action;
        button.dataset.incidentIndex = String(index);
        button.textContent = label;
        button.disabled = alert.status === 'resolved' || (action === 'acknowledged' && alert.status === 'acknowledged');
        actions.appendChild(button);
      });
      card.append(header, text, timestamp, assignment, actions);
      list.appendChild(card);
    });
  }

  function renderSurgeonNotes() {
    renderIncidentManagement();
    const select = document.getElementById('noteAlertSelect');
    if (select) {
      const options = alertsHistory.length
        ? alertsHistory.map((a, i) => `<option value="${i}">Day ${a.day} - ${a.sev.toUpperCase()} - ${a.text.slice(0, 54)}</option>`)
        : ['<option value="-1">No alerts yet - general note</option>'];
      select.innerHTML = options.join('');
    }
    const list = document.getElementById('surgeonNotesList');
    if (!list) return;
    if (!surgeonNotes.length) {
      list.innerHTML = '<p class="sub">No clinical notes yet.</p>';
      return;
    }
    list.replaceChildren(...surgeonNotes.slice(0, 12).map(note => {
      const card = document.createElement('div');
      card.className = `note-card ${note.severity}`;
      const meta = document.createElement('div');
      meta.className = 'note-meta';
      meta.textContent = `DAY ${note.day} · ${note.status.toUpperCase()} / ${note.severity.toUpperCase()}`;
      const content = document.createElement('div');
      content.textContent = note.note;
      const attribution = document.createElement('div');
      attribution.className = 'note-meta';
      attribution.textContent = `${note.author || 'Flight Surgeon'} · ${new Date(note.createdAt).toLocaleString()}`;
      card.append(meta, content, attribution);
      return card;
    }));
  }

  function postPresence() {
    if (!location.protocol.startsWith('http') || !serverAuthenticated) return;
    fetch(`/api/mission-state/${MISSION_ID}/presence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: REALTIME_CLIENT_ID,
        role: authUser?.role || appRole,
        name: authUser?.name || document.getElementById('crewName')?.value || 'Operator'
      })
    }).then(res => res.json()).then(data => {
      presenceUsers = data.users || presenceUsers;
      renderOperations();
    }).catch(() => {});
  }

  function openMissionReport() {
    const weakest = weakestSignal();
    const score = Math.round((state.current.bone + state.current.cardio + state.current.immune + state.current.behavioral) / 4);
    const riskScore = finalRiskScore();
    const alertRows = alertsHistory.slice(0, 10).map(a => `<tr><td>${a.day}</td><td>${a.sev}</td><td>${a.text}</td></tr>`).join('');
    const telemetryRows = telemetry.slice(-12).map(f => `<tr><td>${f.day}</td><td>${f.hr}</td><td>${f.spo2}</td><td>${f.temp}</td><td>${f.rad}</td></tr>`).join('');
    const noteRows = surgeonNotes.slice(0, 8).map(n => `<tr><td>${n.day}</td><td>${n.status}</td><td>${n.severity}</td><td>${n.note}</td></tr>`).join('');
    const forecastRows = indicators.map(key => {
      const f7 = forecastSignal(key, 7);
      const f30 = forecastSignal(key, 30);
      const unit = key === 'radiation' ? ' mSv' : '%';
      return `<tr><td>${meta[key].label}</td><td>${Math.round(f7.value)}${unit} (${f7.status})</td><td>${Math.round(f30.value)}${unit} (${f30.status})</td></tr>`;
    }).join('');
    const win = window.open('', '_blank');
    if (!win) { pushToast('Popup blocked. Allow popups to open the report.', 'watch'); return; }
    win.document.write(`<!doctype html><html><head><title>VITALS Mission Report</title><style>
      body{font-family:Arial,sans-serif;margin:32px;color:#14202b} h1{margin-bottom:4px} table{width:100%;border-collapse:collapse;margin:12px 0} td,th{border:1px solid #ccd6df;padding:7px;text-align:left} .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.card{border:1px solid #ccd6df;padding:10px}.k{font-size:11px;color:#667;text-transform:uppercase}.v{font-size:22px;font-weight:700}@media print{button{display:none}}</style></head><body>
      <button onclick="print()">Print / Save PDF</button>
      <h1>VITALS Mission Report</h1><p>Mission day ${state.day} of ${TOTAL_DAYS}. Generated ${new Date().toLocaleString()}.</p>
      <div class="grid"><div class="card"><div class="k">Composite</div><div class="v">${score}/100</div></div><div class="card"><div class="k">Final Risk</div><div class="v">${riskScore.label}</div></div><div class="card"><div class="k">Radiation</div><div class="v">${Math.round(state.current.radiation)} mSv</div></div><div class="card"><div class="k">Alerts</div><div class="v">${alertsHistory.length}</div></div></div>
      <p><b>Risk rationale:</b> ${riskScore.reason}</p>
      <h2>Current Readings</h2><table><tr><th>Bone</th><th>Cardio</th><th>Immune</th><th>Behavioral</th><th>Radiation</th></tr><tr><td>${Math.round(state.current.bone)}%</td><td>${Math.round(state.current.cardio)}%</td><td>${Math.round(state.current.immune)}%</td><td>${Math.round(state.current.behavioral)}%</td><td>${Math.round(state.current.radiation)} mSv</td></tr></table>
      <h2>Recent Alerts</h2><table><tr><th>Day</th><th>Severity</th><th>Message</th></tr>${alertRows || '<tr><td colspan="3">No alerts.</td></tr>'}</table>
      <h2>Flight Surgeon Notes</h2><table><tr><th>Day</th><th>Status</th><th>Severity</th><th>Note</th></tr>${noteRows || '<tr><td colspan="4">No notes.</td></tr>'}</table>
      <h2>Predictive Risk Forecast</h2><table><tr><th>System</th><th>+7 days</th><th>+30 days</th></tr>${forecastRows}</table>
      <h2>Recent Telemetry</h2><table><tr><th>Day</th><th>HR</th><th>SpO2</th><th>Temp</th><th>Radiation</th></tr>${telemetryRows || '<tr><td colspan="5">No telemetry.</td></tr>'}</table>
      <h2>Recommended Action</h2><p>${actionFor(weakest.key)}</p>
    </body></html>`);
    win.document.close();
  }

  function finalRiskScore() {
    const score = Math.round((state.current.bone + state.current.cardio + state.current.immune + state.current.behavioral) / 4);
    const radiationLoad = Math.min(100, (state.current.radiation / 600) * 100);
    const unresolvedCritical = alertsHistory.filter(a => a.sev === 'crit' && a.status !== 'resolved').length;
    const restricted = surgeonNotes.some(n => ['restricted', 'escalated'].includes(n.status));
    const risk = Math.min(100, Math.round((100 - score) * 0.58 + radiationLoad * 0.32 + unresolvedCritical * 8 + (restricted ? 12 : 0)));
    const level = risk >= 70 ? 'HIGH' : risk >= 40 ? 'MEDIUM' : 'LOW';
    return {
      value: risk,
      label: `${level} (${risk}/100)`,
      reason: `Composite health ${score}/100, radiation load ${Math.round(radiationLoad)}% of limit, ${unresolvedCritical} unresolved critical alert(s).`
    };
  }

  function indicatorsFromTelemetryFrame(frame, index = 0) {
    const hr = Number.isFinite(frame.hr) ? frame.hr : 72;
    const spo2 = Number.isFinite(frame.spo2) ? frame.spo2 : 97;
    const temp = Number.isFinite(frame.temp) ? frame.temp : 36.6;
    const hrPenalty = Math.max(0, hr - 72) * 0.9 + Math.max(0, 60 - hr) * 0.45;
    const spo2Penalty = Math.max(0, 97 - spo2) * 5.8;
    const tempPenalty = Math.abs(temp - 36.6) * 7;
    const rad = Math.max(0, Number(frame.rad) || 0);
    const sleep = Number.isFinite(frame.sleep) ? frame.sleep : 7;
    const exercise = Number.isFinite(frame.exercise) ? frame.exercise : 75;
    const mood = Number.isFinite(frame.mood) ? frame.mood : 3;
    const exerciseBoost = Math.min(9, Math.max(0, exercise - 45) * 0.11);
    const sleepBoost = Math.max(-12, Math.min(7, (sleep - 6.5) * 3));
    const moodBoost = (mood - 3) * 4.5;
    return {
      bone: Math.max(42, Math.min(100, 100 - index * 0.14 - rad * 0.018 + exerciseBoost)),
      cardio: Math.max(35, Math.min(100, 100 - hrPenalty - rad * 0.02 + exerciseBoost * 0.55 + sleepBoost * 0.25)),
      immune: Math.max(30, Math.min(100, 100 - spo2Penalty - tempPenalty - rad * 0.012 + sleepBoost)),
      radiation: Math.min(650, rad),
      behavioral: Math.max(30, Math.min(100, 100 - Math.max(0, hr - 82) * 0.5 - tempPenalty * 0.7 + sleepBoost + moodBoost))
    };
  }

  function rebuildMissionFromTelemetry(rows) {
    const ordered = rows.slice().sort((a, b) => a.day - b.day);
    state.day = ordered.at(-1)?.day || 0;
    indicators.forEach(key => { state.history[key] = [meta[key].start]; });
    ordered.forEach((frame, index) => {
      const snapshot = indicatorsFromTelemetryFrame(frame, index + 1);
      indicators.forEach(key => { state.history[key][frame.day] = snapshot[key]; });
    });
    indicators.forEach(key => {
      const hist = state.history[key];
      for (let i = 1; i <= state.day; i += 1) {
        if (hist[i] == null) hist[i] = hist[i - 1] ?? meta[key].start;
      }
      state.current[key] = hist[state.day] ?? meta[key].start;
    });
    indicators.forEach(k => { prevStatus[k] = statusFor(k, state.current[k]); });
  }

  function applyImportedFrame(frame, mode = 'imported') {
    const snapshot = indicatorsFromTelemetryFrame(frame, frame.day);
    if (mode === 'hybrid') {
      indicators.forEach(key => {
        const weighted = key === 'radiation'
          ? Math.max(state.current[key], snapshot[key])
          : (state.current[key] * 0.45) + (snapshot[key] * 0.55);
        state.current[key] = weighted;
        state.history[key][state.day] = weighted;
      });
    } else {
      indicators.forEach(key => {
        state.current[key] = snapshot[key];
        state.history[key][state.day] = snapshot[key];
      });
    }
    telemetry = telemetry.filter(f => f.day !== frame.day);
    telemetry.unshift({ ...frame, source: mode, timestamp: frame.timestamp || null });
    telemetry = telemetry.slice(0, 24);
    renderTelemetryTable();
  }

  function importTelemetryCsv() {
    const input = document.getElementById('csvInput');
    const rows = (input.value || '').trim().split(/\r?\n/).filter(Boolean);
    const imported = [];
    dataQualityEvents = [];
    const headerAliases = {
      day: ['day', 'mission_day'],
      hr: ['hr', 'hr_bpm', 'heart_rate_bpm'],
      spo2: ['spo2', 'spo2_pct', 'spo2_percent'],
      temp: ['temp', 'temp_c', 'temperature_c'],
      rad: ['rad', 'rad_msv', 'radiation_msv'],
      sleep: ['sleep', 'sleep_hours'],
      exercise: ['exercise', 'exercise_min', 'exercise_minutes'],
      mood: ['mood', 'mood_1_to_5'],
      timestamp: ['timestamp', 'timestamp_iso8601']
    };
    const firstColumns = rows[0]?.split(',').map(value => value.trim().toLowerCase()) || [];
    const hasHeader = firstColumns.length > 0 && !Number.isFinite(Number(firstColumns[0]));
    let headerInvalid = false;
    let timestampColumn = 8;
    if (hasHeader) {
      firstColumns.forEach((column, index) => {
        const field = Object.keys(headerAliases).find(key => headerAliases[key].includes(column));
        if (!field && index < 9) {
          headerInvalid = true;
          recordDataQualityEvent('imported', null, [`Invalid CSV header column ${index + 1} "${column}": unknown field or unsupported unit. Use the documented field names and units.`]);
        }
      });
      ['day', 'hr', 'spo2', 'temp', 'rad'].forEach((field, index) => {
        if (!headerAliases[field].includes(firstColumns[index] || '')) {
          headerInvalid = true;
          recordDataQualityEvent('imported', null, [`Invalid CSV header: column ${index + 1} must identify ${field} with its documented unit.`]);
        }
      });
      const timestampIndex = firstColumns.findIndex(column => headerAliases.timestamp.includes(column));
      timestampColumn = timestampIndex;
    }
    rows.forEach((row, rowIndex) => {
      const cols = row.split(',').map(value => value.trim());
      if (headerInvalid || (hasHeader && rowIndex === 0)) return;
      if (cols.length < 5) {
        recordDataQualityEvent('imported', null, [`CSV row ${rowIndex + 1} has fewer than five required columns.`]);
        return;
      }
      const numericFields = ['day', 'hr', 'spo2', 'temp', 'rad', 'sleep', 'exercise', 'mood'];
      let rowHasInvalidNumber = false;
      const parsed = numericFields.map((field, index) => {
        const raw = cols[index];
        if (raw === undefined || raw === '') return null;
        const value = Number(raw);
        if (!Number.isFinite(value)) {
          rowHasInvalidNumber = true;
          recordDataQualityEvent('imported', Number(cols[0]) || null, [`CSV row ${rowIndex + 1}: ${field} must be a finite number.`]);
          return null;
        }
        return value;
      });
      const [day, hr, spo2, temp, rad, sleep, exercise, mood] = parsed;
      if (!Number.isInteger(day) || day < 0 || day > TOTAL_DAYS) {
        recordDataQualityEvent('imported', Number.isInteger(day) ? day : null, [`CSV row ${rowIndex + 1}: day must be an integer from 0 to ${TOTAL_DAYS}.`]);
        return;
      }
      const frame = {
        day, hr, spo2, temp, rad, sleep: sleep ?? undefined, exercise: exercise ?? undefined,
        mood: mood ?? undefined, source: 'imported',
        timestamp: timestampColumn >= 0 ? cols[timestampColumn] || null : null
      };
      if (rowHasInvalidNumber) return;
      const issues = validateTelemetryFrame(frame);
      if (issues.some(issue => issue.startsWith('Invalid ' ) || issue.startsWith('Unit mismatch') || issue.startsWith('Timestamp is '))) {
        recordDataQualityEvent('imported', day, [`CSV row ${rowIndex + 1}: ${issues.join(' ')}`]);
        return;
      }
      if (issues.length) recordDataQualityEvent('imported', day, [`CSV row ${rowIndex + 1}: ${issues.join(' ')}`]);
      imported.push(frame);
    });
    if (!imported.length) {
      renderDataQuality();
      pushToast('No usable CSV rows found. Check the row and validation messages.', 'watch');
      return;
    }
    telemetry = imported.sort((a, b) => a.day - b.day);
    rebuildMissionFromTelemetry(telemetry);
    dataSourceMode = 'imported';
    localStorage.setItem('vitals_source_mode', dataSourceMode);
    renderTelemetryTable();
    renderAll();
    renderDataQuality();
    checkAlerts();
    saveState();
    renderOperations();
    pushToast(`Imported ${telemetry.length} usable rows. ${dataQualityEvents.length} row(s) need review.`, dataQualityEvents.length ? 'watch' : 'ok');
  }

  async function checkStructuredDatabase() {
    const target = document.getElementById('structuredStatus');
    if (!location.protocol.startsWith('http')) {
      target.textContent = 'Structured DB check requires the local server.';
      return;
    }
    try {
      const res = await fetch(`/api/mission-state/${MISSION_ID}/structured`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Structured DB check failed');
      target.textContent = `Structured DB OK: ${data.telemetry.length} telemetry frames, ${data.alerts.length} alerts, ${data.comms.length} comms, ${data.achievements.length} achievements.`;
    } catch(e) {
      target.textContent = `Structured DB unavailable: ${e.message}`;
    }
  }

  function startReplay() {
    stopReplay(false);
    replayDay = 0;
    const slider = document.getElementById('replaySlider');
    if (slider) slider.value = 0;
    replayTimer = setInterval(() => {
      replayDay = Math.min(state.day, (replayDay || 0) + 1);
      if (slider) slider.value = replayDay;
      showReplayDay(replayDay);
      if (replayDay >= state.day) stopReplay(false);
    }, 650);
  }

  function stopReplay(showCurrent = true) {
    if (replayTimer) clearInterval(replayTimer);
    replayTimer = null;
    if (showCurrent) {
      replayDay = null;
      const insight = document.getElementById('replayInsight');
      if (insight) {
        insight.className = 'replay-insight';
        insight.textContent = 'Replay will mark events and imported telemetry on the trend chart.';
      }
      renderAll();
    }
    renderOperations();
  }

  function showReplayDay(day) {
    replayDay = Number(day);
    const snapshot = {};
    indicators.forEach(key => {
      const hist = state.history[key] || [];
      snapshot[key] = hist[Math.min(replayDay, hist.length - 1)] ?? state.current[key];
    });
    indicators.forEach(key => {
      const valEl = document.getElementById('val-' + key);
      if (valEl) valEl.textContent = (key === 'radiation' ? Math.round(snapshot[key]) : Math.round(snapshot[key] * 10) / 10) + meta[key].unit;
      const badgeEl = document.getElementById('badge-' + key);
      if (badgeEl) {
        const st = statusFor(key, snapshot[key]);
        badgeEl.className = 'badge ' + st;
        badgeEl.textContent = st === 'ok' ? 'NORMAL' : st === 'watch' ? 'WATCH' : 'CRITICAL';
      }
    });
    els.dayLabel.innerHTML = `REPLAY DAY ${replayDay} <div>saved mission remains day ${state.day}</div>`;
    renderReplayInsight(snapshot);
    drawTrendChart();
    renderOperations();
  }

  function replayEventForDay(day) {
    const alert = alertsHistory.find(a => a.day === day);
    if (alert) return { severity: alert.sev, text: alert.text };
    const scripted = scriptedEvents[day];
    if (scripted) return { severity: scripted.warn ? 'watch' : 'ok', text: scripted.text };
    const frame = telemetry.find(f => f.day === day);
    if (frame) return { severity: 'ok', text: `Imported telemetry: HR ${frame.hr}, SpO2 ${frame.spo2}%, sleep ${frame.sleep ?? 'n/a'}h, exercise ${frame.exercise ?? 'n/a'} min.` };
    return { severity: 'ok', text: 'No notable event logged for this day.' };
  }

  function renderReplayInsight(snapshot) {
    const el = document.getElementById('replayInsight');
    if (!el) return;
    const event = replayEventForDay(replayDay);
    const score = Math.round((snapshot.bone + snapshot.cardio + snapshot.immune + snapshot.behavioral) / 4);
    el.className = 'replay-insight ' + event.severity;
    el.innerHTML = `<b>Day ${replayDay}</b> - Score ${score}/100 - ${event.text}`;
  }

  function saveState() {
    try {
      const payload = missionPayload();
      localStorage.setItem('vitals_state', JSON.stringify(payload));
      syncStateToDatabase(payload);
    } catch(e) {}
  }
  function loadState() {
    try {
      const raw = localStorage.getItem('vitals_state');
      if (!raw) return false;
      const s = JSON.parse(raw);
      applyMissionPayload(s);
      return true;
    } catch(e) { return false; }
  }

  // ---- Sound ----
  function playBeep(sev) {
    if (!settings.sound) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = sev === 'crit' ? 'sawtooth' : sev === 'click' ? 'triangle' : 'sine';
      o.frequency.value = sev === 'crit' ? 920 : sev === 'watch' ? 660 : sev === 'ach' ? 740 : sev === 'click' ? 440 : 520;
      g.gain.setValueAtTime(sev === 'click' ? 0.025 : 0.08, ctx.currentTime);
      if (sev === 'crit') {
        o.frequency.setValueAtTime(920, ctx.currentTime);
        o.frequency.setValueAtTime(640, ctx.currentTime + 0.12);
        o.frequency.setValueAtTime(920, ctx.currentTime + 0.24);
      }
      if (sev === 'ach') o.frequency.exponentialRampToValueAtTime(1180, ctx.currentTime + 0.28);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (sev === 'click' ? 0.08 : 0.38));
      o.start(); o.stop(ctx.currentTime + (sev === 'click' ? 0.08 : 0.38));
    } catch(e) {}
  }

  // ---- Toasts ----
  function pushToast(text, severity, isAch) {
    const stack = document.getElementById('toastStack');
    const t = document.createElement('div');
    t.className = 'toast ' + (severity === 'ok' ? '' : severity) + (isAch ? ' ach-toast' : '');
    t.innerHTML = `<button class="close-x" aria-label="Dismiss">✕</button>
      <div class="ttl">${isAch ? '🏆 ACHIEVEMENT UNLOCKED' : 'AUTO-MESSAGE TO CREW · DAY ' + state.day}</div>
      <div>${text}</div>`;
    t.querySelector('.close-x').addEventListener('click', () => t.remove());
    stack.appendChild(t);
    playBeep(isAch ? 'ach' : severity);
    setTimeout(() => { if (t.parentNode) { t.style.opacity = '0'; t.style.transition = 'opacity .4s'; setTimeout(() => t.remove(), 400); } }, isAch ? 7000 : 5500);
  }

  function announceMissionAlert(alert) {
    const severity = alert.sev || alert.severity || 'watch';
    if (!['watch', 'crit'].includes(severity) || !browserNotificationsEnabled ||
        !document.hidden || !('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      const notification = new Notification(`VITALS · ${severity === 'crit' ? 'CRITICAL' : 'WARNING'}`, {
        body: alert.text || 'A new mission alert was recorded.',
        icon: 'assets/vitals-logo.svg',
        tag: alert.incidentId || alert.code || `mission-alert-${Date.now()}`
      });
      notification.onclick = () => {
        window.focus();
        notification.close();
        goToPage('dashboard');
      };
    } catch (error) {
      console.error('Could not display browser notification.', error);
    }
  }

  function updateBrowserNotificationsButton() {
    const button = document.getElementById('browserNotificationsBtn');
    if (!button) return;
    const supported = 'Notification' in window;
    const enabled = supported && browserNotificationsEnabled && Notification.permission === 'granted';
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('aria-label', enabled ? 'Browser notifications enabled' : 'Enable browser notifications');
    button.title = enabled
      ? 'Browser notifications enabled (free)'
      : 'Enable free browser notifications';
    button.classList.toggle('active', enabled);
  }

  async function enableBrowserNotifications() {
    if (!('Notification' in window)) {
      pushToast('Browser notifications are not supported here. On-screen alerts and realtime sync still work.', 'watch');
      return;
    }
    if (Notification.permission === 'denied') {
      pushToast('Notifications are blocked by this browser. Allow them in site settings to enable alerts.', 'watch');
      return;
    }
    const permission = Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission();
    browserNotificationsEnabled = permission === 'granted';
    localStorage.setItem('vitals_browser_notifications', browserNotificationsEnabled ? '1' : '0');
    updateBrowserNotificationsButton();
    pushToast(
      browserNotificationsEnabled ? 'Free browser alerts enabled for new mission events.' : 'Browser notification permission was not granted.',
      browserNotificationsEnabled ? 'ok' : 'watch'
    );
  }

  function unlockAch(key) {
    if (unlocked.has(key)) return;
    unlocked.add(key);
    pushToast(`<b>${achievements[key].icon} ${achievements[key].name}</b> — ${achievements[key].desc}`, 'ok', true);
    renderAchievements();
    saveState();
  }

  // ---- AI ----
  let sampleFn = null, chatTurns = [];
  (async () => {
    try { sampleFn = window.claude ? await window.claude.use('sample') : null; } catch (e) { sampleFn = null; }
    const hint = document.getElementById('assistantHint');
    if (!sampleFn && hint) {
      hint.textContent = "The AI assistant isn't available in this view — try opening this page on claude.ai.";
      document.getElementById('chatSendBtn').disabled = false;
    }
    const source = document.getElementById('assistantSource');
    const status = document.querySelector('.bot-status');
    if (sampleFn) {
      if (hint) hint.textContent = 'Ask about your current readings, what a status means, or what to do next. Answers use live mission data with cloud AI support.';
      if (source) source.textContent = 'cloud AI + live telemetry';
      if (status) status.innerHTML = '<span class="live-dot" style="background:var(--ok);"></span>CLOUD AI ONLINE &middot; LIVE MISSION DATA LINKED';
    } else {
      if (hint) hint.textContent = 'Cloud AI is unavailable here, so the onboard advisor is active. It still answers from the current mission readings and action rules.';
      if (source) source.textContent = 'onboard rules + live telemetry';
      if (status) status.innerHTML = '<span class="live-dot" style="background:var(--watch);"></span>ONBOARD ADVISOR ONLINE &middot; LIVE MISSION DATA LINKED';
    }
  })();

  function buildContextPrompt() {
    const c = state.current;
    const now = new Date();
    const recentHistory = indicators.map(key => {
      const values = (state.history[key] || []).slice(Math.max(0, state.day - 7), state.day + 1);
      return `${meta[key].label}: ${values.map(value => Math.round(value * 10) / 10).join(' → ')}`;
    }).join('; ');
    const alertContext = alertsHistory.slice(0, 5).map(alert => `Day ${alert.day} ${alert.sev}: ${alert.text}`).join('; ') || 'none';
    return `You are an AI flight-health assistant embedded in the VITALS astronaut health dashboard, a simulated mission tool. Answer concisely, practically, and safely. This is a training simulation, not real medical advice; never diagnose or present a modeled result as clinically certain. Explain which dashboard data supports each factual claim. Current simulated status: Day ${state.day} of ${TOTAL_DAYS}, snapshot timestamp ${now.toISOString()}. Bone density: ${Math.round(c.bone)}%. Cardiovascular: ${Math.round(c.cardio)}%. Immune/inflammation: ${Math.round(c.immune)}%. Radiation dose: ${Math.round(c.radiation)} mSv (training thresholds: watch 300, critical 500; career reference limit 600). Behavioral health: ${Math.round(c.behavioral)}%. Last seven mission days by indicator: ${recentHistory}. Latest alert log: ${alertContext}. Current unsubmitted check-in controls: exercise ${els.inEx.value} min, sleep ${els.inSleep.value} h, mood ${els.inMood.value}/5, EVA ${els.inEva.value === '1' ? 'yes' : 'no'}.`;
  }
  function assistantSnapshot() {
    const c = state.current;
    const rank = { crit: 0, watch: 1, ok: 2 };
    const items = indicators.map(key => ({
      key,
      label: meta[key].label,
      value: c[key],
      status: statusFor(key, c[key])
    }));
    items.sort((a, b) => rank[a.status] - rank[b.status] || (a.key === 'radiation' ? b.value - a.value : a.value - b.value));
    return { current: c, items, top: items[0] };
  }

  function localAssistantAnswer(question) {
    const q = question.toLowerCase();
    const snap = assistantSnapshot();
    const c = snap.current;
    const top = snap.top;
    const score = Math.round((c.bone + c.cardio + c.immune + c.behavioral) / 4);
    const radMargin = Math.max(0, Math.round(600 - c.radiation));
    const statusWord = top.status === 'crit' ? 'critical' : top.status === 'watch' ? 'watch' : 'nominal';
    const actionMap = {
      radiation: c.radiation >= 300 ? 'limit EVA time, move optional work to shielded areas, and watch solar-event scheduling.' : 'keep EVA exposure planned and continue routine dose tracking.',
      bone: c.bone < 78 ? 'prioritize an ARED resistive session before sleep and keep protein/hydration steady.' : 'maintain the current resistive exercise block.',
      cardio: c.cardio < 78 ? 'add a controlled treadmill or cycle interval block and monitor dizziness symptoms.' : 'maintain the current cardio routine.',
      immune: c.immune < 78 ? 'prioritize sleep, hydration, and symptom logging for flight-surgeon review.' : 'continue normal immune and inflammation checks.',
      behavioral: c.behavioral < 78 ? 'schedule a support call or decompression block and protect the next sleep window.' : 'maintain the current sleep and recovery rhythm.'
    };
    if (q.includes('radiation') || q.includes('dose') || q.includes('eva')) {
      return `Radiation is currently ${Math.round(c.radiation)} mSv, leaving about ${radMargin} mSv before the 600 mSv training limit. ${statusFor('radiation', c.radiation) === 'ok' ? 'That is nominal, but EVA days still add dose over time.' : 'That needs closer scheduling control.'} Today I would ${actionMap.radiation}`;
    }
    if (q.includes('trend') || q.includes('trending') || q.includes('overall')) {
      return `Overall crew health score is about ${score}/100 on mission day ${state.day}. The weakest signal is ${top.label.toLowerCase()} at ${Math.round(top.value)}${top.key === 'radiation' ? ' mSv' : '%'}, currently ${statusWord}. The next best move is to ${actionMap[top.key]}`;
    }
    if (q.includes('weakest') || q.includes('priority') || q.includes('today') || q.includes('action') || q.includes('plan')) {
      return `Top priority: ${top.label.toLowerCase()}. Status is ${statusWord}, with a current value of ${Math.round(top.value)}${top.key === 'radiation' ? ' mSv' : '%'}. Three steps: 1. ${actionMap[top.key]} 2. Log the result in Daily Check-In. 3. Recheck trends after advancing one mission day.`;
    }
    if (q.includes('ground') || q.includes('summary') || q.includes('summarize')) {
      return `Ground summary: Day ${state.day}/${TOTAL_DAYS}, composite health ${score}/100. Bone ${Math.round(c.bone)}%, cardio ${Math.round(c.cardio)}%, immune ${Math.round(c.immune)}%, behavioral ${Math.round(c.behavioral)}%, radiation ${Math.round(c.radiation)} mSv. Primary watch item: ${top.label.toLowerCase()} (${statusWord}).`;
    }
    return `Current status: Day ${state.day}/${TOTAL_DAYS}, composite health ${score}/100, radiation ${Math.round(c.radiation)} mSv with ${radMargin} mSv margin. The main item to watch is ${top.label.toLowerCase()}. Recommended next action: ${actionMap[top.key]}`;
  }

  function answerExplainableQuestion(question) {
    const q = question.toLowerCase();
    const asksAboutAlert = (/\b(alert|alerts|warning|critical)\b/.test(q) || /অ্যালার্ট|সতর্কতা/.test(q)) &&
      (/\b(why|cause|reason|generated|trigger|explain)\b/.test(q) || /কেন|কারণ|তৈরি/.test(q));
    const asksAboutWeek = (/\b(7|seven|week)\b/.test(q) || /সাত|৭/.test(q)) &&
      (/\b(day|days|week)\b/.test(q) || /দিন|সপ্তাহ/.test(q)) &&
      (/\b(worse|worsen|declin|trend|change|health|indicator)\b/.test(q) || /খারাপ|কমেছে|স্বাস্থ্য|ইন্ডিকেটর|পরিবর্তন/.test(q));
    const asksAboutCheckin = (/\b(check.?in|exercise|sleep|mood|eva|risk)\b/.test(q) || /চেক.?ইন|ব্যায়াম|ঘুম|ঝুঁকি/.test(q)) &&
      (/\b(change|adjust|improv|reduce|lower|risk|could|should)\b/.test(q) || /পরিবর্তন|বদল|কমানো|কমাতে|কোন|ঝুঁকি/.test(q));
    if (!asksAboutAlert && !asksAboutWeek && !asksAboutCheckin) return null;

    const capturedAt = new Date();
    const timestamp = capturedAt.toISOString();
    const evidence = [
      `Mission state snapshot: Day ${state.day}/${TOTAL_DAYS}, captured ${capturedAt.toLocaleString()}.`,
      `Source: local VITALS dashboard mission state; training simulation, not a medical record.`
    ];
    let answer;

    if (asksAboutAlert) {
      const recentAlert = alertsHistory[0];
      const currentAlerts = indicators
        .map(key => ({ key, status: statusFor(key, state.current[key]), value: state.current[key] }))
        .filter(item => item.status !== 'ok');
      if (recentAlert) {
        evidence.push(`Most recent alert log: mission day ${recentAlert.day}, ${String(recentAlert.sev || 'notice').toUpperCase()}: ${recentAlert.text}`);
      }
      if (currentAlerts.length) {
        currentAlerts.forEach(item => {
          const value = item.key === 'radiation' ? `${Math.round(item.value)} mSv` : `${Math.round(item.value)}%`;
          const threshold = item.key === 'radiation'
            ? `${item.status === 'crit' ? 'critical ≥500' : 'watch ≥300'} mSv`
            : `${item.status === 'crit' ? 'critical <55' : 'watch <78'}%`;
          evidence.push(`${meta[item.key].label}: ${value}; simulator threshold ${threshold}; current status ${item.status}.`);
        });
        const primary = currentAlerts[0];
        const thresholdText = primary.key === 'radiation'
          ? primary.status === 'crit' ? 'the simulated critical threshold of 500 mSv' : 'the simulated watch threshold of 300 mSv'
          : primary.status === 'crit' ? 'the simulated critical threshold below 55%' : 'the simulated watch threshold below 78%';
        answer = `${meta[primary.key].label} is currently ${primary.status} (${scenarioMetricText(primary.key, primary.value)}), which meets ${thresholdText}. The alert is generated by the dashboard’s rule-based threshold check; ${recentAlert ? `the latest logged alert is from mission day ${recentAlert.day}.` : 'current readings are outside the nominal range.'}`;
      } else {
        answer = recentAlert
          ? `There is no currently active threshold alert. The most recent alert was logged on mission day ${recentAlert.day}: “${recentAlert.text}” (${recentAlert.sev || 'notice'}). It may have cleared because current values are back in the nominal range.`
          : 'No health alert is currently active or present in the mission alert log. Alerts are created when a simulated indicator crosses its configured watch or critical threshold.';
        evidence.push('Current rule check: radiation watch ≥300 mSv / critical ≥500 mSv; other health indicators watch <78% / critical <55%.');
      }
    } else if (asksAboutWeek) {
      const startDay = Math.max(0, state.day - 7);
      const changes = indicators.map(key => {
        const values = state.history[key] || [];
        const start = values[startDay] ?? values[0] ?? state.current[key];
        const end = values[state.day] ?? state.current[key];
        const change = end - start;
        const worsened = key === 'radiation' ? change > 0 : change < 0;
        return { key, start, end, change, worsened };
      });
      changes.forEach(item => {
        const unit = item.key === 'radiation' ? 'mSv' : '%';
        const sign = item.change > 0 ? '+' : '';
        evidence.push(`${meta[item.key].label}, Day ${startDay} → ${state.day}: ${item.start.toFixed(1)} → ${item.end.toFixed(1)} ${unit} (${sign}${item.change.toFixed(1)} ${unit}); ${item.worsened ? 'worsened by the simulator’s direction rule' : 'stable or improved'}.`);
      });
      const worsened = changes.filter(item => item.worsened && Math.abs(item.change) >= 0.05)
        .sort((a, b) => (b.key === 'radiation' ? b.change : -b.change) - (a.key === 'radiation' ? a.change : -a.change));
      answer = state.day === startDay
        ? `Only mission day ${state.day} is available, so there is not yet a seven-day comparison. Advance the simulation to build a trend.`
        : worsened.length
          ? `Over mission days ${startDay}–${state.day}, ${worsened.map(item => `${meta[item.key].label.toLowerCase()} ${item.key === 'radiation' ? 'increased' : 'decreased'} by ${Math.abs(item.change).toFixed(1)}${item.key === 'radiation' ? ' mSv' : ' percentage points'}`).join(', ')}. These are modeled mission-history changes, not clinical measurements.`
          : `No indicator worsened by a measurable amount over mission days ${startDay}–${state.day}. This compares saved mission-history values; it does not establish that health is clinically normal.`;
      evidence.push('Source: saved daily indicator history; radiation is worse when dose rises, other indicators are worse when their score falls.');
    } else {
      const currentCheckin = {
        exercise: Number(els.inEx.value),
        sleep: Number(els.inSleep.value),
        mood: Number(els.inMood.value),
        eva: els.inEva.value === '1'
      };
      const recommendedCheckin = { exercise: Math.max(90, currentCheckin.exercise), sleep: Math.max(7, currentCheckin.sleep), mood: Math.max(4, currentCheckin.mood), eva: false };
      const projectCheckin = checkin => {
        const projected = { ...state.current };
        const exFactor = Math.min(1, checkin.exercise / 90);
        const timePressure = 1 + (state.day + 1) / 360;
        projected.bone = Math.max(40, Math.min(100, projected.bone + exFactor * 0.35 * (1 - (state.day + 1) / 500) - 0.25 * timePressure - (checkin.eva ? 0.08 : 0)));
        projected.cardio = Math.max(40, Math.min(100, projected.cardio + exFactor * 0.45 - 0.3 + (checkin.sleep >= 6 ? 0.1 : -0.2)));
        const sleepFactor = checkin.sleep >= 7 ? 0.3 : checkin.sleep >= 5 ? 0 : -0.6;
        projected.immune = Math.max(30, Math.min(100, projected.immune + sleepFactor - 0.1));
        projected.radiation = Math.min(650, projected.radiation + 0.4 * (1 + (state.day + 1) / 720) + (checkin.eva ? 1.8 : 0));
        projected.behavioral = Math.max(30, Math.min(100, projected.behavioral + (checkin.mood - 3) * 1.1 + (checkin.sleep >= 6 ? 0.3 : -0.5)));
        return projected;
      };
      const currentProjection = projectCheckin(currentCheckin);
      const alternativeProjection = projectCheckin(recommendedCheckin);
      const healthScore = values => (values.bone + values.cardio + values.immune + values.behavioral) / 4;
      const alertCount = values => indicators.filter(key => statusFor(key, values[key]) !== 'ok').length;
      const scoreGain = healthScore(alternativeProjection) - healthScore(currentProjection);
      const fewerAlerts = alertCount(currentProjection) - alertCount(alternativeProjection);
      evidence.push(`Current unsubmitted check-in controls: exercise ${currentCheckin.exercise} min; sleep ${currentCheckin.sleep} h; mood ${currentCheckin.mood}/5; EVA ${currentCheckin.eva ? 'yes' : 'no'}.`);
      evidence.push(`Compared option: exercise ${recommendedCheckin.exercise} min; sleep ${recommendedCheckin.sleep} h; mood ${recommendedCheckin.mood}/5; EVA ${recommendedCheckin.eva ? 'yes' : 'no'}.`);
      evidence.push(`One-day modeled composite: ${healthScore(currentProjection).toFixed(1)} → ${healthScore(alternativeProjection).toFixed(1)} (${scoreGain >= 0 ? '+' : ''}${scoreGain.toFixed(1)}); non-nominal indicators ${alertCount(currentProjection)} → ${alertCount(alternativeProjection)}. Random mission events excluded.`);
      answer = scoreGain > 0.05 || fewerAlerts > 0
        ? `In this one-day training projection, try exercise at ${recommendedCheckin.exercise} min, sleep at ${recommendedCheckin.sleep} h, mood check-in at ${recommendedCheckin.mood}/5, and EVA “No” if that reflects your plan. Compared with the current sliders, the modeled composite changes ${scoreGain >= 0 ? 'by +' : 'by '}${scoreGain.toFixed(1)} points and non-nominal indicators change by ${fewerAlerts}. This is a hypothetical simulation, not a health recommendation.`
        : 'The current check-in already matches or exceeds the comparison settings for this simple one-day model. The projection excludes random mission events and should not be treated as clinical advice.';
    }

    return { text: answer, evidence, timestamp, source: 'deterministic local dashboard analysis' };
  }

  function appendAssistantEvidence(bubble, data) {
    const card = document.createElement('details');
    card.className = 'assistant-evidence';
    card.open = true;
    const summary = document.createElement('summary');
    summary.textContent = `Data used · ${data.source}`;
    const list = document.createElement('ul');
    data.evidence.forEach(item => {
      const entry = document.createElement('li');
      entry.textContent = item;
      list.appendChild(entry);
    });
    const timestamp = document.createElement('time');
    timestamp.dateTime = data.timestamp;
    timestamp.textContent = `Answer generated: ${new Date(data.timestamp).toLocaleString()}`;
    const disclaimer = document.createElement('p');
    disclaimer.className = 'assistant-disclaimer';
    disclaimer.textContent = 'Training simulation only. This generated explanation is not a diagnosis or a substitute for a qualified flight surgeon.';
    card.append(summary, list, timestamp, disclaimer);
    bubble.appendChild(card);
  }

  function assistantEvidence(question, source) {
    const now = new Date();
    const values = indicators.map(key => `${meta[key].label}: ${scenarioMetricText(key, state.current[key])} (${statusFor(key, state.current[key])})`);
    const checkin = `Current check-in controls (not yet logged): exercise ${els.inEx.value} min, sleep ${els.inSleep.value} h, mood ${els.inMood.value}/5, EVA ${els.inEva.value === '1' ? 'yes' : 'no'}.`;
    const recentTelemetry = telemetry.slice(0, 7).map(frame =>
      `Day ${frame.day}: HR ${frame.hr ?? 'n/a'} bpm, SpO₂ ${frame.spo2 ?? 'n/a'}%, temperature ${frame.temp ?? 'n/a'}°C, radiation ${frame.rad ?? 'n/a'} mSv${frame.sleep !== undefined || frame.exercise !== undefined ? `, sleep ${frame.sleep ?? 'n/a'} h, exercise ${frame.exercise ?? 'n/a'} min` : ''}.`
    );
    return {
      timestamp: now.toISOString(),
      source,
      evidence: [
        `Mission state snapshot: Day ${state.day}/${TOTAL_DAYS}, captured ${now.toLocaleString()}.`,
        ...values.map(value => `Current dashboard indicator: ${value}.`),
        checkin,
        recentTelemetry.length ? `Recent telemetry: ${recentTelemetry.join(' ')}` : 'Telemetry history: no daily telemetry frames are available yet.',
        `Alert log: ${alertsHistory.length ? `${alertsHistory.length} logged alert(s); latest is Day ${alertsHistory[0].day}: ${alertsHistory[0].text}` : 'no health alerts logged.'}`,
        `Question: ${question}`
      ]
    };
  }

  function updateAssistantStats() {
    const day = document.getElementById('aiDayStat');
    if (!day) return;
    const snap = assistantSnapshot();
    day.textContent = `${state.day} / ${TOTAL_DAYS}`;
    document.getElementById('aiPriorityStat').textContent = snap.top.status === 'ok' ? 'Nominal' : meta[snap.top.key].label;
    document.getElementById('aiRadStat').textContent = Math.round(state.current.radiation) + ' mSv';
  }

  const botAvatarSvg = `<span class="mission-avatar chat-avatar" aria-hidden="true"></span>`;
  const userAvatarSvg = `<span class="mission-avatar chat-avatar user" aria-hidden="true"></span>`;

  function appendChatBubble(role, text, isTyping, withChips) {
    const log = document.getElementById('chatLog');
    const row = document.createElement('div');
    row.className = 'chat-row' + (role === 'user' ? ' user' : '');
    const bubble = document.createElement('div');
    bubble.className = 'comm-bubble ' + (role === 'user' ? 'mine' : 'ground');
    bubble.innerHTML = `<div class="from">${role === 'user' ? 'YOU' : 'AI ASSISTANT'}</div>` +
      (isTyping ? '<span class="typing-dots"><span></span><span></span><span></span></span>' : `<span class="bubble-text"></span>`);
    if (!isTyping) bubble.querySelector('.bubble-text').textContent = text;
    row.innerHTML = role === 'user' ? userAvatarSvg : botAvatarSvg;
    row.appendChild(bubble);
    if (withChips && role === 'assistant') {
      const chips = document.createElement('div');
      chips.className = 'chat-actions';
      ['What should I prioritize today?', 'Am I trending well?', 'Explain my radiation risk'].forEach(q => {
        const b = document.createElement('button');
        b.className = 'chat-action-chip';
        b.textContent = q;
        b.addEventListener('click', () => { document.getElementById('chatInput').value = q; sendChat(); });
        chips.appendChild(b);
      });
      bubble.appendChild(chips);
    }
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
    return bubble;
  }

  const chatEmptyHTML = document.getElementById('chatLog').innerHTML;
  function bindSuggestButtons() {
    document.querySelectorAll('#suggestRow .tab-btn, .chat-tool-btn').forEach(btn => {
      btn.addEventListener('click', () => { document.getElementById('chatInput').value = btn.dataset.q; sendChat(); });
    });
    updateAssistantStats();
  }
  bindSuggestButtons();

  document.getElementById('clearChatBtn').addEventListener('click', () => {
    chatTurns = [];
    document.getElementById('chatLog').innerHTML = chatEmptyHTML;
    bindSuggestButtons();
  });

  async function sendChat() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    const emptyEl = document.getElementById('chatEmpty');
    if (emptyEl) emptyEl.remove();
    chatTurns.push({ role: 'user', content: text });
    appendChatBubble('user', text);
    const thinkingDiv = appendChatBubble('assistant', '', true);
    let streaming = false;
    document.getElementById('chatSendBtn').disabled = true;
    try {
      let answer = '';
      let evidenceData;
      const explainableAnswer = answerExplainableQuestion(text);
      if (explainableAnswer) {
        answer = explainableAnswer.text;
        evidenceData = explainableAnswer;
        await new Promise(resolve => setTimeout(resolve, 180));
      } else if (sampleFn) {
        const result = await sampleFn(
          [{ role: 'user', content: buildContextPrompt() }, ...chatTurns],
          { cache: false, onText: ({ text: t }) => {
              if (!streaming) { thinkingDiv.innerHTML = `<div class="from">AI ASSISTANT</div><span class="bubble-text"></span>`; streaming = true; }
              thinkingDiv.querySelector('.bubble-text').textContent = t;
              document.getElementById('chatLog').scrollTop = 1e9;
            } }
        );
        answer = result.text;
        evidenceData = assistantEvidence(text, 'dashboard snapshot + cloud AI response');
      } else {
        await new Promise(resolve => setTimeout(resolve, 450));
        answer = localAssistantAnswer(text);
        evidenceData = assistantEvidence(text, 'deterministic local dashboard analysis');
      }
      chatTurns.push({ role: 'assistant', content: answer });
      if (!streaming) {
        const label = document.createElement('div');
        label.className = 'from';
        label.textContent = 'AI ASSISTANT';
        const response = document.createElement('span');
        response.className = 'bubble-text';
        response.textContent = answer;
        thinkingDiv.replaceChildren(label, response);
      }
      appendAssistantEvidence(thinkingDiv, evidenceData);
      // add chips
      const chips = document.createElement('div');
      chips.className = 'chat-actions';
      ['What should I prioritize today?', 'Am I trending well?'].forEach(q => {
        const b = document.createElement('button');
        b.className = 'chat-action-chip';
        b.textContent = q;
        b.addEventListener('click', () => { document.getElementById('chatInput').value = q; sendChat(); });
        chips.appendChild(b);
      });
      thinkingDiv.appendChild(chips);
    } catch (e) {
      console.error('AI assistant request failed; using local dashboard fallback.', e);
      const msg = e.code === 'not_granted' ? 'Permission for AI answers was not granted in this view.'
        : e.code === 'rate_limited' ? 'Too many requests right now — try again in a moment.'
        : 'Could not get a response right now.';
      thinkingDiv.innerHTML = `<div class="from">AI ASSISTANT</div><span class="bubble-text"></span>
        <div class="chat-actions"><button class="chat-action-chip" id="retryBtn">↻ Retry</button></div>`;
      const fallbackAnswer = answerExplainableQuestion(text);
      const fallbackText = fallbackAnswer ? fallbackAnswer.text : localAssistantAnswer(text);
      thinkingDiv.querySelector('.bubble-text').textContent = (e.text || msg) + ' Onboard fallback: ' + fallbackText;
      appendAssistantEvidence(thinkingDiv, fallbackAnswer || assistantEvidence(text, 'deterministic local dashboard fallback'));
      const rb = thinkingDiv.querySelector('#retryBtn');
      if (rb) rb.addEventListener('click', () => { chatTurns.pop(); thinkingDiv.parentElement.remove(); sendChat(); });
    } finally {
      document.getElementById('chatSendBtn').disabled = false;
    }
  }
  document.getElementById('chatSendBtn').addEventListener('click', sendChat);
  document.getElementById('chatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

  let unreadComms = 0, cleanStreak = 0, bestStreak = 0, worstDayStreak = 0;

  function updateStreaks() {
    const allOk = indicators.every(k => statusFor(k, state.current[k]) === 'ok');
    if (allOk) { cleanStreak += 1; worstDayStreak = 0; } else { cleanStreak = 0; worstDayStreak += 1; }
    bestStreak = Math.max(bestStreak, cleanStreak);
    if (cleanStreak >= 7) unlockAch('streak7');
    if (cleanStreak >= 30) unlockAch('streak30');
    renderStreaks();
  }

  function goToPage(pageName) {
    document.querySelectorAll('.navbtn').forEach(b => b.classList.toggle('active', b.dataset.page === pageName));
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + pageName));
    if (pageName === 'comms') { unreadComms = 0; document.getElementById('commsBadge').style.display = 'none'; }
    if (pageName === 'scenarios') renderScenarioResult();
    if (location.hash !== '#' + pageName) history.replaceState(null, '', '#' + pageName);
  }
  document.querySelectorAll('#quickActions .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => goToPage(btn.dataset.goto));
  });

  function renderSnapshot() {
    const row = document.getElementById('snapshotRow');
    if (!row) return;
    const score = Math.round((state.current.bone + state.current.cardio + state.current.immune + state.current.behavioral) / 4);
    const radBudget = Math.max(0, Math.round(600 - state.current.radiation));
    row.innerHTML = `
      <div class="vital-mini"><div class="lbl">MISSION DAY</div><div class="num">${state.day}<span> / ${TOTAL_DAYS}</span></div></div>
      <div class="vital-mini"><div class="lbl">OVERALL SCORE</div><div class="num">${score}<span>/100</span></div></div>
      <div class="vital-mini"><div class="lbl">RAD BUDGET LEFT</div><div class="num">${radBudget}<span> mSv</span></div></div>`;
  }

  function environmentReadings() {
    const c = state.current;
    const co2 = Math.round(520 + (100 - c.immune) * 6 + (state.day % 17) * 3 + (c.behavioral < 70 ? 45 : 0));
    const o2 = Math.max(19.1, 21 - (100 - c.cardio) * 0.004 - (co2 > 850 ? 0.18 : 0));
    const pressure = Math.max(98.8, 101.3 - state.day * 0.004 - (c.radiation > 300 ? 0.25 : 0));
    const humidity = Math.round(43 + Math.sin(state.day * 0.31) * 7 + (c.behavioral < 65 ? 6 : 0));
    return [
      { key: 'co2', label: 'CABIN CO2', value: co2, unit: ' ppm', fill: Math.min(100, co2 / 12), sev: co2 > 950 ? 'crit' : co2 > 750 ? 'watch' : 'ok' },
      { key: 'o2', label: 'O2 PARTIAL', value: o2.toFixed(1), unit: '%', fill: Math.min(100, o2 / 21 * 100), sev: o2 < 19.5 ? 'crit' : o2 < 20.2 ? 'watch' : 'ok' },
      { key: 'pressure', label: 'CABIN PRESSURE', value: pressure.toFixed(1), unit: ' kPa', fill: Math.min(100, pressure / 101.3 * 100), sev: pressure < 99.3 ? 'crit' : pressure < 100.2 ? 'watch' : 'ok' },
      { key: 'humidity', label: 'HUMIDITY', value: humidity, unit: '%', fill: Math.min(100, humidity), sev: humidity > 62 || humidity < 30 ? 'watch' : 'ok' },
      { key: 'scrubber', label: 'SCRUBBER', value: co2 > 950 ? 'SERVICE' : co2 > 750 ? 'WATCH' : 'NOMINAL', unit: '', fill: co2 > 950 ? 92 : co2 > 750 ? 68 : 38, sev: co2 > 950 ? 'crit' : co2 > 750 ? 'watch' : 'ok' }
    ];
  }

  function renderEnvironment() {
    const grid = document.getElementById('envGrid');
    if (!grid) return;
    grid.innerHTML = environmentReadings().map(item => `
      <div class="env-cell ${item.sev}" title="${item.label}">
        <div class="env-top"><span>${item.label}</span><span>${item.sev.toUpperCase()}</span></div>
        <div class="env-value">${item.value}<span>${item.unit}</span></div>
        <div class="env-meter"><div class="env-fill" style="--fill:${item.fill}%"></div></div>
      </div>`).join('');
  }

  function renderFocus() {
    const panel = document.getElementById('focusPanel');
    const textEl = document.getElementById('focusText');
    if (!panel || state.day < 1) return;
    const c = state.current;
    const candidates = [
      { key: 'radiation', sev: statusFor('radiation', c.radiation), text: 'Radiation dose is elevated — minimize EVA exposure and use shielded areas.' },
      { key: 'bone', sev: statusFor('bone', c.bone), text: 'Bone density is slipping — prioritize resistive exercise (ARED) today.' },
      { key: 'cardio', sev: statusFor('cardio', c.cardio), text: 'Cardiovascular conditioning is declining — add cardio intervals today.' },
      { key: 'immune', sev: statusFor('immune', c.immune), text: 'Immune/inflammation markers are off — prioritize sleep and rest.' },
      { key: 'behavioral', sev: statusFor('behavioral', c.behavioral), text: 'Behavioral health is low — consider a support call with family or ground crew.' }
    ];
    const rank = { crit: 0, watch: 1, ok: 2 };
    candidates.sort((a, b) => rank[a.sev] - rank[b.sev]);
    const top = candidates[0];
    panel.className = 'panel focus-panel' + (top.sev !== 'ok' ? ' ' + top.sev : '');
    textEl.textContent = top.sev === 'ok' ? 'All indicators nominal — maintain your current routine.' : top.text;
  }

  function renderStreaks() {
    const row = document.getElementById('streakRow');
    if (!row) return;
    const badges = [];
    badges.push(`<div class="streak-badge ${cleanStreak >= 3 ? 'lit' : ''}">🏅 Clean streak: ${cleanStreak} day${cleanStreak === 1 ? '' : 's'}</div>`);
    badges.push(`<div class="streak-badge">⭐ Best streak: ${bestStreak} day${bestStreak === 1 ? '' : 's'}</div>`);
    if (worstDayStreak >= 3) badges.push(`<div class="streak-badge crit">⚠️ ${worstDayStreak} days with an issue flagged</div>`);
    row.innerHTML = badges.join('');
  }

  function drawOverviewRing() {
    const c = document.getElementById('overviewRing');
    if (!c) return;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    const score = Math.round((state.current.bone + state.current.cardio + state.current.immune + state.current.behavioral) / 4);
    const cx = 75, cy = 75, r = 60;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.strokeStyle = '#1c2838'; ctx.lineWidth = 12; ctx.stroke();
    const frac = Math.max(0, Math.min(1, score / 100));
    const color = score < 55 ? '#ff5d5d' : score < 78 ? '#f2c14e' : '#4ad99b';
    ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.strokeStyle = color; ctx.lineWidth = 12; ctx.lineCap = 'round';
    ctx.shadowBlur = 14; ctx.shadowColor = color; ctx.stroke(); ctx.shadowBlur = 0;
    document.getElementById('overviewScore').textContent = score;
    document.getElementById('overviewScore').style.color = color;
  }

  function renderOverviewStats() {
    const dayEl = document.getElementById('overviewDay');
    if (!dayEl) return;
    const c = state.current;
    const systemScores = [
      { name: 'BONE', value: c.bone },
      { name: 'CARDIO', value: c.cardio },
      { name: 'IMMUNE', value: c.immune },
      { name: 'BEHAV.', value: c.behavioral }
    ].sort((a, b) => a.value - b.value);
    const phase = state.day >= 150 ? 'RETURN PREP'
      : state.day >= 90 ? 'DEEP MISSION'
      : state.day >= 30 ? 'CRUISE'
      : state.day > 0 ? 'ADAPTATION'
      : 'LAUNCH';
    dayEl.textContent = `${state.day} / ${TOTAL_DAYS}`;
    document.getElementById('overviewPhase').textContent = phase;
    document.getElementById('overviewRad').textContent = Math.max(0, Math.round(600 - c.radiation)) + ' mSv';
    document.getElementById('overviewLowest').textContent = `${systemScores[0].name} ${Math.round(systemScores[0].value)}%`;
  }

  function updateProgress() {
    const pct = Math.round((state.day / TOTAL_DAYS) * 100);
    document.getElementById('progressBar').style.width = pct + '%';
    document.getElementById('progressLabel').textContent = `Day ${state.day} of ${TOTAL_DAYS} (${pct}%)`;
    const pctEl = document.getElementById('progressPct');
    if (pctEl) pctEl.textContent = pct + '%';
  }

  document.getElementById('crewName').addEventListener('input', (e) => {
    const name = e.target.value || 'Commander';
    document.querySelector('header .tag').textContent = `ASTRONAUT HEALTH MONITOR — ${name.toUpperCase()}`;
    saveState();
  });

  // ---- Comms ----
  let commsThread = [];
  let commsFilter = 'all';
  let commsChannelFilter = 'all';
  let commsDelaySeconds = 8;
  let commsQueueTimer = null;
  let commsLastStatusRefresh = 0;
  const commsChannels = {
    crew: 'Crew',
    surgeon: 'Flight Surgeon',
    ground: 'Ground Control'
  };

  function commsMessageStatus(message, now = Date.now()) {
    if (!message.direction) return '';
    if (message.isAck) return 'ACK RECEIVED';
    if (message.status === 'acknowledged') return 'ACKNOWLEDGED';
    if (message.status === 'delivered') return 'DELIVERED · AWAITING ACK';
    if (message.status === 'queued' && message.deliveryAt) {
      return `QUEUED · ETA ${Math.max(0, Math.ceil((message.deliveryAt - now) / 1000))}s`;
    }
    return (message.status || '').toUpperCase();
  }

  function renderCommsQueueSummary(now = Date.now()) {
    const summary = document.getElementById('commsQueueSummary');
    if (!summary) return;
    const queued = commsThread.filter(message => message.direction === 'outbound' && message.status === 'queued').length;
    const awaitingAck = commsThread.filter(message => message.direction === 'outbound' && message.status === 'delivered').length;
    const effectiveDelay = message => Math.max(1, Math.ceil((message.delaySeconds || commsDelaySeconds) * (message.priority === 'emergency' ? 0.25 : 1)));
    const nextMessage = commsThread
      .filter(message => message.direction === 'outbound' && message.status === 'queued' && message.deliveryAt)
      .sort((a, b) => a.deliveryAt - b.deliveryAt)[0];
    summary.replaceChildren();
    [
      ['QUEUED', String(queued)],
      ['AWAITING ACK', String(awaitingAck)],
      ['ONE-WAY DELAY', `${commsDelaySeconds}s`],
      ['NEXT DELIVERY', nextMessage ? `${Math.max(0, Math.ceil((nextMessage.deliveryAt - now) / 1000))}s · ${effectiveDelay(nextMessage)}s priority-adjusted` : 'None']
    ].forEach(([label, value]) => {
      const card = document.createElement('div');
      card.className = 'comms-queue-card';
      const caption = document.createElement('span');
      caption.textContent = label;
      const content = document.createElement('strong');
      content.textContent = value;
      card.append(caption, content);
      summary.appendChild(card);
    });
  }

  function renderComms() {
    const list = document.getElementById('commsList');
    const shouldScroll = list.scrollHeight - list.scrollTop - list.clientHeight < 48;
    const items = commsThread.filter(message =>
      (commsChannelFilter === 'all' || (message.channel || (message.type === 'ground' ? 'ground' : 'crew')) === commsChannelFilter) &&
      (commsFilter === 'all' || message.sev === commsFilter)
    );
    list.replaceChildren();
    if (!items.length) {
      const empty = document.createElement('p');
      empty.className = 'sub';
      empty.textContent = 'No messages in this channel yet. Compose a message or advance the mission to see automatic alerts.';
      list.appendChild(empty);
      renderCommsQueueSummary();
      return;
    }
    items.forEach(message => {
      const channel = commsChannels[message.channel] ? message.channel : (message.type === 'ground' ? 'ground' : 'crew');
      const isOutbound = message.direction === 'outbound' || (!message.direction && message.type === 'crew');
      const sender = message.direction === 'outbound'
        ? `CREW → ${commsChannels[channel].toUpperCase()}`
        : message.isAck
          ? `${commsChannels[channel].toUpperCase()} → CREW · ACK`
          : message.type === 'crew'
            ? 'YOU (CREW)'
            : message.type === 'ground'
              ? 'GROUND CONTROL'
              : message.type === 'surgeon'
                ? 'FLIGHT SURGEON'
                : 'AUTO-MONITOR → CREW';
      const bubble = document.createElement('div');
      bubble.className = `comm-bubble ${isOutbound ? 'mine' : message.type === 'ground' ? 'ground' : (message.sev || 'ok')} ${message.priority === 'emergency' ? 'emergency-message' : ''}`;
      const avatar = document.createElement('span');
      avatar.className = `mission-avatar comm-avatar ${isOutbound ? 'user' : message.type === 'ground' || message.type === 'surgeon' ? 'ground' : ''}`;
      avatar.setAttribute('aria-hidden', 'true');
      const content = document.createElement('div');
      content.className = 'comm-content';
      const header = document.createElement('div');
      header.className = 'from';
      header.textContent = `${sender} · ${commsChannels[channel].toUpperCase()} CHANNEL · DAY ${message.day ?? state.day}`;
      const text = document.createElement('div');
      text.className = 'comm-text';
      text.textContent = message.text;
      content.append(header, text);
      if (message.priority === 'emergency') {
        const priority = document.createElement('span');
        priority.className = 'comms-priority-tag';
        priority.textContent = 'EMERGENCY PRIORITY';
        content.appendChild(priority);
      }
      const deliveryStatus = commsMessageStatus(message);
      if (deliveryStatus) {
        const status = document.createElement('div');
        status.className = `comms-delivery-status ${message.isAck ? 'acknowledged' : message.status}`;
        status.textContent = deliveryStatus;
        content.appendChild(status);
      }
      bubble.append(avatar, content);
      list.appendChild(bubble);
    });
    if (shouldScroll) list.scrollTop = list.scrollHeight;
    renderCommsQueueSummary();
  }
  function buildCommsFilterTabs() {
    const row = document.getElementById('commsFilterTabs');
    row.innerHTML = '';
    [['all','All'],['watch','Watch'],['crit','Critical']].forEach(([key,label]) => {
      const b = document.createElement('button');
      b.className = 'tab-btn' + (commsFilter === key ? ' active' : '');
      b.textContent = label;
      b.addEventListener('click', () => { commsFilter = key; buildCommsFilterTabs(); renderComms(); });
      row.appendChild(b);
    });
  }
  buildCommsFilterTabs();

  function buildCommsChannelTabs() {
    const row = document.getElementById('commsChannelTabs');
    row.replaceChildren();
    [['all', 'All channels'], ['crew', 'Crew'], ['surgeon', 'Flight Surgeon'], ['ground', 'Ground Control']].forEach(([key, label]) => {
      const button = document.createElement('button');
      button.className = 'tab-btn' + (commsChannelFilter === key ? ' active' : '');
      button.textContent = label;
      button.addEventListener('click', () => {
        commsChannelFilter = key;
        buildCommsChannelTabs();
        renderComms();
      });
      row.appendChild(button);
    });
  }
  buildCommsChannelTabs();

  function processCommsQueue() {
    const now = Date.now();
    let changed = false;
    const acknowledgements = [];
    commsThread.forEach(message => {
      if (message.direction !== 'outbound') return;
      if (message.status === 'queued' && message.deliveryAt <= now) {
        message.status = 'delivered';
        message.deliveredAt = now;
        changed = true;
      }
      if (message.status === 'delivered' && message.ackAt <= now && !message.ackMessageId) {
        message.status = 'acknowledged';
        message.acknowledgedAt = now;
        message.ackMessageId = `${message.id}-ack`;
        const recipient = commsChannels[message.channel] || 'Mission Control';
        acknowledgements.push({
          id: message.ackMessageId,
          type: message.channel,
          channel: message.channel,
          direction: 'inbound',
          isAck: true,
          day: message.day,
          text: `Acknowledgement received from ${recipient} after the simulated return delay.`,
          status: 'delivered',
          priority: message.priority,
          createdAt: now,
          ackFor: message.id
        });
        changed = true;
      }
    });
    if (acknowledgements.length) commsThread.push(...acknowledgements);
    if (changed) {
      renderComms();
      saveState();
    } else if (now - commsLastStatusRefresh >= 1000) {
      commsLastStatusRefresh = now;
      renderComms();
    }
  }

  document.getElementById('replySendBtn').addEventListener('click', () => {
    const input = document.getElementById('replyInput');
    const text = input.value.trim();
    if (!text) return;
    const delayInput = document.getElementById('commsDelaySeconds');
    const configuredDelay = Number(delayInput.value);
    if (!Number.isInteger(configuredDelay) || configuredDelay < 1 || configuredDelay > 120) {
      pushToast('One-way delay must be a whole number from 1 to 120 seconds.', 'watch');
      delayInput.value = String(commsDelaySeconds);
      return;
    }
    commsDelaySeconds = configuredDelay;
    const priority = document.getElementById('commsEmergencyPriority').checked ? 'emergency' : 'normal';
    const delaySeconds = Math.max(1, Math.ceil(commsDelaySeconds * (priority === 'emergency' ? 0.25 : 1)));
    const sentAt = Date.now();
    const id = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : `${sentAt}-${Math.random()}`;
    commsThread.push({
      id,
      type: 'crew',
      channel: document.getElementById('commsChannelSelect').value,
      direction: 'outbound',
      priority,
      day: state.day,
      text,
      status: 'queued',
      delaySeconds: commsDelaySeconds,
      createdAt: sentAt,
      deliveryAt: sentAt + delaySeconds * 1000,
      ackAt: sentAt + delaySeconds * 2000
    });
    input.value = '';
    document.getElementById('commsEmergencyPriority').checked = false;
    commsSent += 1;
    if (commsSent >= 10) unlockAch('comms10');
    renderComms();
    saveState();
  });
  document.getElementById('replyInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('replySendBtn').click(); });
  const commsDelayInput = document.getElementById('commsDelaySeconds');
  commsDelayInput.value = String(commsDelaySeconds);
  commsDelayInput.addEventListener('change', () => {
    const value = Number(commsDelayInput.value);
    if (!Number.isInteger(value) || value < 1 || value > 120) {
      pushToast('One-way delay must be a whole number from 1 to 120 seconds.', 'watch');
      commsDelayInput.value = String(commsDelaySeconds);
      return;
    }
    commsDelaySeconds = value;
    renderCommsQueueSummary();
    saveState();
  });
  commsQueueTimer = setInterval(processCommsQueue, 250);
  processCommsQueue();
  document.getElementById('markReadBtn').addEventListener('click', () => { unreadComms = 0; document.getElementById('commsBadge').style.display = 'none'; });

  function renderAlertsFeed() {
    const feed = document.getElementById('alertsFeed');
    if (!alertsHistory.length) { feed.innerHTML = '<li class="ok"><span class="dot"></span><span>No alerts yet. Advance a mission day to begin monitoring.</span></li>'; return; }
    feed.innerHTML = alertsHistory.slice(0, 8).map(a => `<li class="${a.sev}" style="cursor:pointer;"><span class="dot"></span><span><b>Day ${a.day}:</b> ${a.text}</span></li>`).join('');
    feed.querySelectorAll('li').forEach(li => {
      li.addEventListener('click', () => goToPage('comms'));
    });
  }

  const alertMsg = {
    bone: 'Bone density has dropped into {s} range — increase resistive exercise (ARED) time.',
    cardio: 'Cardiovascular conditioning is now {s} — add cardio intervals and watch for orthostatic symptoms.',
    immune: 'Immune/inflammation markers are {s} — prioritize sleep and rest; flag to flight surgeon if it persists.',
    radiation: 'Radiation dose is {s} relative to the career limit — reduce EVA exposure.',
    behavioral: 'Behavioral health score is {s} — consider a support call with family or ground crew.'
  };

  function checkAlerts() {
    indicators.forEach(key => {
      const st = statusFor(key, state.current[key]);
      if (st !== 'ok' && st !== prevStatus[key]) {
        const text = alertMsg[key].replace('{s}', st === 'crit' ? 'critical' : 'watch-level');
        pushToast(text, st);
        const alert = {
          incidentId: createAuditId(),
          day: state.day,
          text,
          sev: st,
          status: 'open',
          assignedTo: '',
          createdAt: Date.now(),
          values: { ...state.current }
        };
        alertsHistory.unshift(alert);
        announceMissionAlert(alert);
        recordAuditEvent('alert.created', 'incident', alert.incidentId, null, alert);
        commsThread.push({ type: 'auto', day: state.day, text, sev: st });
        unreadComms += 1;
        const badge = document.getElementById('commsBadge');
        badge.textContent = unreadComms;
        badge.style.display = 'inline-block';
        if (st === 'crit') { critAlertSeen = true; triggerCriticalAlert(text); }
      }
      prevStatus[key] = st;
    });
    renderAlertsFeed();
    renderIncidentManagement();
    renderComms();
    saveState();
  }

  function triggerCriticalAlert(text) {
    document.body.classList.remove('critical-alert');
    void document.body.offsetWidth;
    document.body.classList.add('critical-alert');
    showOverlay('Critical Health Alert', text + ' Mission control has been notified.');
    setTimeout(() => document.body.classList.remove('critical-alert'), 2600);
  }

  function liveVitals() {
    const c = state.current;
    const hr = Math.max(50, Math.min(140, 60 + (100 - c.cardio) * 0.5 + (c.radiation / 600) * 10));
    const spo2 = Math.max(90, Math.min(100, 94 + (c.immune / 100) * 5));
    const temp = Math.max(35.5, Math.min(38.5, 36.5 + (100 - c.behavioral) * 0.02 + (c.immune < 60 ? 0.3 : 0)));
    return { hr: Math.round(hr), spo2: Math.round(spo2 * 10) / 10, temp: Math.round(temp * 10) / 10 };
  }

  function updateStatusBar() {
    const c = state.current;
    const worst = Math.min(c.bone, c.cardio, c.immune, c.behavioral);
    const radCrit = c.radiation >= 500;
    const pill = document.getElementById('statusPill');
    const text = document.getElementById('statusText');
    if (worst < 55 || radCrit) { pill.className = 'pill emergency'; text.textContent = 'CRITICAL'; }
    else if (worst < 78 || c.radiation >= 300) { pill.className = 'pill caution'; text.textContent = 'CAUTION'; }
    else { pill.className = 'pill'; text.textContent = 'NOMINAL'; }
    document.getElementById('metClock').textContent = String(state.day).padStart(3, '0') + ':00:00:00';
    document.getElementById('utcClock').textContent = 'UTC ' + new Date().toISOString().substr(11, 8);
  }

  function updateLiveVitals() {
    const v = latestLiveFrame || liveVitals();
    const readingStatus = (value, lowWatch, lowCrit, highWatch, highCrit) => {
      if (!Number.isFinite(value)) return 'crit';
      if (value <= lowCrit || value >= highCrit) return 'crit';
      if (value <= lowWatch || value >= highWatch) return 'watch';
      return 'ok';
    };
    const hrState = readingStatus(v.hr, 55, 45, 110, 130);
    const spo2State = Number.isFinite(v.spo2) ? (v.spo2 < 90 ? 'crit' : v.spo2 < 94 ? 'watch' : 'ok') : 'crit';
    const tempState = readingStatus(v.temp, 36, 35.5, 37.8, 38.5);
    const setLiveCard = (id, stateName, labelId) => {
      const el = document.getElementById(id);
      if (el) el.className = 'vital-mini ' + stateName;
      const label = document.getElementById(labelId);
      if (label) {
        const value = id === 'liveHrCard' ? v.hr : id === 'liveSpo2Card' ? v.spo2 : v.temp;
        label.textContent = !Number.isFinite(value) ? 'MISSING' : stateName === 'ok' ? 'NOMINAL' : stateName === 'crit' ? 'CRITICAL' : 'WATCH';
      }
    };
    document.getElementById('liveHr').innerHTML = Number.isFinite(v.hr) ? v.hr + '<span> bpm</span>' : 'N/A';
    document.getElementById('liveSpo2').innerHTML = Number.isFinite(v.spo2) ? v.spo2 + '<span>%</span>' : 'N/A';
    document.getElementById('liveTemp').innerHTML = Number.isFinite(v.temp) ? v.temp + '<span>°C</span>' : 'N/A';
    document.getElementById('waveHrLabel').textContent = Number.isFinite(v.hr) ? 'HR ' + v.hr + ' BPM' : 'HR SENSOR MISSING';
    document.getElementById('waveHrLabel').className = 'signal-chip ' + hrState;
    const signal = document.getElementById('liveSignal');
    if (signal) {
      const liveStates = [hrState, spo2State, tempState];
      const liveState = liveStates.includes('crit') ? 'crit' : liveStates.includes('watch') ? 'watch' : 'ok';
      signal.className = 'signal-chip ' + liveState;
      signal.textContent = latestLiveFrame?.source === 'sensor'
        ? liveState === 'ok' ? 'LIVE SENSOR' : 'SENSOR ANOMALY'
        : liveState === 'ok' ? 'SIMULATED' : 'SIM ANOMALY';
    }
    setLiveCard('liveHrCard', hrState, 'liveHrState');
    setLiveCard('liveSpo2Card', spo2State, 'liveSpo2State');
    const tempCard = document.getElementById('liveTemp').closest('.vital-mini');
    if (tempCard && !tempCard.id) {
      tempCard.id = 'liveTempCard';
      tempCard.insertAdjacentHTML('beforeend', '<div class="mini-meta"><span>THERMAL</span><span id="liveTempState">NOMINAL</span></div>');
    }
    setLiveCard('liveTempCard', tempState, 'liveTempState');
    renderTelemetryStatus();
    return v;
  }

  function drawGauge() {
    const c = document.getElementById('gaugeCanvas');
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    const cx = 70, cy = 72, r = 58;
    const frac = Math.min(1, state.current.radiation / 600);
    [[0,0.5,'#4ad99b'],[0.5,0.83,'#f2c14e'],[0.83,1,'#ff5d5d']].forEach(s => {
      ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI + s[0]*Math.PI, Math.PI + s[1]*Math.PI);
      ctx.strokeStyle = s[2]; ctx.lineWidth = 10; ctx.stroke();
    });
    const angle = Math.PI + frac * Math.PI;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(angle) * (r - 4), cy + Math.sin(angle) * (r - 4));
    ctx.strokeStyle = '#e7eef4'; ctx.lineWidth = 2; ctx.stroke();
    document.getElementById('gaugeVal').textContent = Math.round(state.current.radiation) + ' mSv';
    const dose = document.getElementById('doseState');
    if (dose) dose.textContent = `${Math.max(0, Math.round(600 - state.current.radiation))} mSv margin to 600 mSv limit`;
  }

  function pushTelemetryFrame(v, checkin = {}, source = 'simulation') {
    telemetry = telemetry.filter(f => f.day !== state.day);
    telemetry.unshift({
      day: state.day, hr: v.hr, spo2: v.spo2, temp: v.temp, rad: Math.round(state.current.radiation),
      source,
      timestamp: new Date().toISOString(),
      sleep: Number.isFinite(checkin.sleep) ? checkin.sleep : undefined,
      exercise: Number.isFinite(checkin.exercise) ? checkin.exercise : undefined
    });
    telemetry = telemetry.slice(0, 24);
    renderTelemetryTable();
    renderHealthRiskPrediction();
  }

  function renderTelemetryTable() {
    const body = document.getElementById('telemetryBody');
    if (!body) return;
    body.replaceChildren(...telemetry.map(frame => {
      const row = document.createElement('tr');
      const observedAt = frame.timestamp && Number.isFinite(Date.parse(frame.timestamp))
        ? new Date(frame.timestamp).toLocaleString()
        : 'Missing';
      const source = frame.source || (dataSourceMode === 'simulation' ? 'simulation' : 'imported');
      [
        frame.day,
        frame.hr ?? 'Missing',
        frame.spo2 ?? 'Missing',
        frame.temp ?? 'Missing',
        frame.rad ?? 'Missing',
        source.toUpperCase(),
        observedAt
      ].forEach(value => {
        const cell = document.createElement('td');
        cell.textContent = String(value);
        row.appendChild(cell);
      });
      return row;
    }));
  }

  function persistLiveTelemetry() {
    localStorage.setItem('vitals_live_telemetry', JSON.stringify(liveTelemetryHistory));
    localStorage.setItem('vitals_telemetry_alerts', JSON.stringify(telemetryAlertHistory));
  }

  function renderTelemetryAlertHistory() {
    const list = document.getElementById('telemetryAlertHistory');
    if (!list) return;
    if (!telemetryAlertHistory.length) {
      list.innerHTML = '<li class="telemetry-alert-empty">No telemetry alerts recorded.</li>';
      return;
    }
    list.replaceChildren(...telemetryAlertHistory.slice(0, 20).map(alert => {
      const item = document.createElement('li');
      item.className = `telemetry-alert-item ${alert.severity}`;
      const heading = document.createElement('div');
      heading.className = 'telemetry-alert-heading';
      const severity = document.createElement('strong');
      severity.textContent = alert.severity === 'crit' ? 'CRITICAL' : alert.severity === 'watch' ? 'WARNING' : 'RECOVERED';
      const source = document.createElement('span');
      source.textContent = alert.source === 'sensor' ? 'REAL SENSOR' : 'SIMULATION';
      heading.append(severity, source);
      const text = document.createElement('div');
      text.className = 'telemetry-alert-text';
      text.textContent = alert.text;
      const timestamp = document.createElement('time');
      timestamp.dateTime = alert.timestamp;
      timestamp.textContent = new Date(alert.timestamp).toLocaleString();
      item.append(heading, text, timestamp);
      return item;
    }));
  }

  const telemetryRanges = {
    hr: { label: 'Heart rate', min: 0, max: 250, unit: 'bpm' },
    spo2: { label: 'SpO₂', min: 0, max: 100, unit: '%' },
    temp: { label: 'Skin temperature', min: 25, max: 45, unit: '°C' },
    rad: { label: 'Radiation dose', min: 0, max: 650, unit: 'mSv' },
    sleep: { label: 'Sleep', min: 0, max: 24, unit: 'h' },
    exercise: { label: 'Exercise', min: 0, max: 1440, unit: 'min' },
    mood: { label: 'Mood', min: 1, max: 5, unit: 'score' }
  };
  const expectedUnits = { hr: 'bpm', spo2: '%', temp: '°C', rad: 'mSv', sleep: 'h', exercise: 'min', mood: 'score' };

  function validateTelemetryFrame(frame, { live = false } = {}) {
    const issues = [];
    if (!Number.isInteger(frame.day) || frame.day < 0 || frame.day > TOTAL_DAYS) {
      issues.push(`Invalid mission day: expected an integer from 0 to ${TOTAL_DAYS}.`);
    }
    Object.entries(telemetryRanges).forEach(([field, rule]) => {
      const value = frame[field];
      if (value === undefined || value === null || value === '') {
        if ((live && ['hr', 'spo2', 'temp'].includes(field)) ||
            (!live && ['hr', 'spo2', 'temp', 'rad', 'sleep', 'exercise', 'mood'].includes(field))) {
          const label = ['sleep', 'exercise', 'mood'].includes(field) ? `${rule.label.toLowerCase()} check-in` : rule.label.toLowerCase();
          issues.push(`Missing ${label} (${rule.unit}).`);
        }
        return;
      }
      if (typeof value !== 'number' || !Number.isFinite(value) || value < rule.min || value > rule.max) {
        issues.push(`Invalid ${rule.label.toLowerCase()}: expected ${rule.min}–${rule.max} ${rule.unit}.`);
      }
    });
    const source = frame.source || 'simulation';
    if (!['simulation', 'sensor', 'imported', 'hybrid'].includes(source)) {
      issues.push(`Invalid data source "${source}".`);
    }
    const timestamp = frame.timestamp;
    if (!timestamp) {
      issues.push('Missing timestamp.');
    } else {
      const parsed = Date.parse(timestamp);
      const isoParts = typeof timestamp === 'string'
        ? timestamp.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/)
        : null;
      const calendarValid = isoParts && Number(isoParts[2]) >= 1 && Number(isoParts[2]) <= 12 &&
        Number(isoParts[3]) >= 1 &&
        Number(isoParts[3]) <= new Date(Date.UTC(Number(isoParts[1]), Number(isoParts[2]), 0)).getUTCDate() &&
        Number(isoParts[4]) <= 23 && Number(isoParts[5]) <= 59 && Number(isoParts[6]) <= 59 &&
        (!isoParts[8] || Number(isoParts[8]) <= 23) && (!isoParts[9] || Number(isoParts[9]) <= 59);
      if (!isoParts || !calendarValid || !Number.isFinite(parsed)) {
        issues.push('Invalid timestamp; expected an ISO-8601 date/time.');
      }
      else if (parsed > Date.now() + 5 * 60 * 1000) issues.push('Timestamp is more than five minutes in the future.');
    }
    if (frame.units && typeof frame.units === 'object') {
      Object.entries(expectedUnits).forEach(([field, unit]) => {
        if (frame.units[field] && frame.units[field] !== unit) {
          issues.push(`Unit mismatch for ${field}: expected ${unit}, received ${frame.units[field]}.`);
        }
      });
    }
    return issues;
  }

  function recordDataQualityEvent(source, day, issues) {
    if (!issues.length) return;
    const issueKey = issues.slice().sort().join('|');
    const recentDuplicate = dataQualityEvents.some(event =>
      event.source === source && event.day === day && event.issueKey === issueKey &&
      Date.now() - event.timestamp < 30000
    );
    if (recentDuplicate) return;
    dataQualityEvents.unshift({
      source,
      day,
      issues: [...issues],
      issueKey,
      timestamp: Date.now()
    });
    dataQualityEvents = dataQualityEvents.slice(0, 100);
    saveState();
  }

  function renderDataQuality() {
    const summary = document.getElementById('dataQualitySummary');
    const details = document.getElementById('dataQualityDetails');
    const mode = document.getElementById('dataQualityMode');
    if (!summary || !details || !mode) return;
    const frames = [
      ...telemetry.slice(0, 24).map(frame => ({
        frame: { ...frame, source: frame.source || (dataSourceMode === 'simulation' ? 'simulation' : 'imported') },
        live: false
      })),
      ...liveTelemetryHistory.slice(0, 120).map(frame => ({ frame, live: true }))
    ];
    const reported = frames.map(({ frame, live }) => ({ frame, issues: validateTelemetryFrame(frame, { live }) }))
      .filter(result => result.issues.length);
    const missingCount = reported.reduce((count, result) =>
      count + result.issues.filter(issue =>
        issue.startsWith('Missing ') && !issue.startsWith('Missing timestamp')
      ).length, 0);
    const invalidCount = reported.reduce((count, result) =>
      count + result.issues.filter(issue =>
        issue.startsWith('Invalid ') || issue.startsWith('Unit mismatch') ||
        issue.startsWith('Timestamp is ') || issue.startsWith('Missing timestamp')
      ).length, 0);
    const invalidImportCount = dataQualityEvents.reduce((count, event) =>
      count + event.issues.filter(issue => /Invalid |Unit mismatch|must be a finite number|Timestamp is /.test(issue)).length, 0);
    const latestTimestamp = latestLiveFrame?.timestamp
      ? new Date(latestLiveFrame.timestamp).toLocaleString()
      : 'No live-feed timestamp';
    const sourceLabel = {
      simulation: 'SIMULATION',
      imported: 'IMPORTED CSV',
      hybrid: 'HYBRID (SIMULATION + CSV)'
    }[dataSourceMode] || 'SIMULATION';
    mode.textContent = `Mission source: ${sourceLabel} · Live feed: ${latestLiveFrame?.source || 'simulation'} · Last frame: ${latestTimestamp}`;
    summary.replaceChildren();
    [
      ['CHECKED FRAMES', String(frames.length)],
      ['MISSING READINGS', String(missingCount)],
      ['INVALID VALUES / METADATA', String(invalidCount + invalidImportCount)],
      ['IMPORT WARNINGS', String(dataQualityEvents.length)]
    ].forEach(([label, value]) => {
      const card = document.createElement('div');
      card.className = 'data-quality-stat';
      const count = document.createElement('strong');
      count.textContent = value;
      const name = document.createElement('span');
      name.textContent = label;
      card.append(count, name);
      summary.appendChild(card);
    });
    details.replaceChildren();
    const items = [
      ...reported.slice(0, 8).map(({ frame, issues }) => ({
        label: `${String(frame.source || 'unknown').toUpperCase()} · DAY ${frame.day ?? '—'}`,
        timestamp: frame.timestamp,
        message: issues.join(' ')
      })),
      ...dataQualityEvents.slice(0, 8).map(event => ({
        label: `IMPORT · DAY ${event.day ?? '—'}`,
        timestamp: new Date(event.timestamp).toISOString(),
        message: event.issues.join(' ')
      }))
    ].slice(0, 10);
    if (!items.length) {
      const empty = document.createElement('p');
      empty.className = 'data-quality-empty';
      empty.textContent = frames.length ? 'No missing readings or invalid values were found in the checked frames.' : 'No telemetry frames available to validate yet.';
      details.appendChild(empty);
      return;
    }
    items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'data-quality-issue';
      const heading = document.createElement('strong');
      heading.textContent = item.label;
      const text = document.createElement('p');
      text.textContent = item.message;
      const time = document.createElement('time');
      if (item.timestamp && Number.isFinite(Date.parse(item.timestamp))) {
        time.dateTime = new Date(item.timestamp).toISOString();
        time.textContent = new Date(item.timestamp).toLocaleString();
      } else {
        time.textContent = 'Timestamp unavailable';
      }
      row.append(heading, text, time);
      details.appendChild(row);
    });
  }

  function renderTelemetryStatus() {
    const status = document.getElementById('telemetryMonitorStatus');
    if (!status) return;
    const age = lastLiveTelemetryAt ? Date.now() - lastLiveTelemetryAt : Infinity;
    const stale = age > telemetryIntervalMs * 2;
    const latestSource = latestLiveFrame?.source || 'simulation';
    const sourceLabel = document.getElementById('telemetrySourceLabel');
    const sensorLabel = document.getElementById('sensorConnectionLabel');
    sourceLabel.textContent = latestSource === 'sensor' ? 'LIVE SENSOR DATA' : 'SIMULATED DATA · NOT A LIVE SENSOR';
    sourceLabel.className = `telemetry-source ${latestSource === 'sensor' ? 'sensor' : 'simulated'}`;
    sensorLabel.textContent = latestSource === 'sensor' ? 'REAL SENSOR · CONNECTED' : 'REAL SENSOR · NOT CONNECTED';
    sensorLabel.className = `telemetry-source ${latestSource === 'sensor' ? 'sensor' : 'disconnected'}`;
    document.getElementById('telemetryLastSeen').textContent = lastLiveTelemetryAt
      ? `Last reading: ${new Date(lastLiveTelemetryAt).toLocaleTimeString()}`
      : 'Waiting for first reading';
    document.getElementById('telemetryPauseBtn').textContent = telemetryPaused ? 'Resume feed' : 'Pause feed';
    const feedState = telemetryPaused ? 'PAUSED' : stale ? 'STALE' : 'STREAMING';
    status.className = `telemetry-monitor-status ${stale ? 'watch' : telemetryPaused ? 'paused' : 'ok'}`;
    status.textContent = stale
      ? `STALE DATA WARNING — no reading received for ${Math.max(1, Math.round(age / 1000))} seconds. Check the feed or sensor connection.`
      : telemetryPaused
        ? 'Telemetry feed is paused. The stale-data monitor remains active.'
        : `${feedState} · ${latestSource === 'sensor' ? 'REAL SENSOR' : 'SIMULATION'} · new reading every ${telemetryIntervalMs / 1000} seconds${telemetryServerOnline ? ' · SSE relay connected' : ' · local feed only'}`;
    renderDataQuality();
    if (stale && !activeTelemetryIssues.has('stale_feed')) {
      activeTelemetryIssues.add('stale_feed');
      recordTelemetryAlert({
        code: 'stale_feed',
        severity: 'watch',
        source: latestSource,
        day: state.day,
        timestamp: new Date().toISOString(),
        text: `No telemetry reading received for more than ${Math.round(telemetryIntervalMs * 2 / 1000)} seconds.`
      }, true);
    } else if (!stale && activeTelemetryIssues.delete('stale_feed')) {
      recordTelemetryAlert({
        code: 'feed_recovered',
        severity: 'ok',
        source: latestSource,
        day: state.day,
        timestamp: new Date().toISOString(),
        text: 'Telemetry feed resumed and fresh readings are arriving.'
      }, true);
    }
  }

  function recordTelemetryAlert(alert, shouldBroadcast = false) {
    const timestamp = alert.timestamp || new Date().toISOString();
    const key = `${alert.code}:${timestamp}`;
    if (telemetryAlertHistory.some(existing =>
      `${existing.code}:${existing.timestamp}` === key ||
      (existing.code === alert.code && existing.day === alert.day && existing.text === alert.text &&
        Math.abs(new Date(existing.timestamp).getTime() - new Date(timestamp).getTime()) < 5000)
    )) return;
    const savedAlert = { ...alert, timestamp };
    telemetryAlertHistory.unshift(savedAlert);
    telemetryAlertHistory = telemetryAlertHistory.slice(0, 100);
    renderTelemetryAlertHistory();
    persistLiveTelemetry();
    announceMissionAlert({
      ...alert,
      incidentId: alert.code ? `${alert.code}:${timestamp}` : timestamp
    });
    if (alert.severity === 'crit' || alert.severity === 'watch') pushToast(alert.text, alert.severity);
    if (shouldBroadcast) postTelemetryAlerts([savedAlert]);
  }

  function detectTelemetryAnomalies(frame, remoteAlerts = []) {
    const remoteCodes = new Set(remoteAlerts.map(alert => alert.code));
    const checks = [
      {
        field: 'hr', name: 'Heart-rate', missing: 'missing_hr',
        lowWatch: 55, lowCrit: 45, highWatch: 110, highCrit: 130,
        unit: 'bpm'
      },
      {
        field: 'spo2', name: 'SpO₂', missing: 'missing_spo2',
        lowWatch: 94, lowCrit: 90, highWatch: Infinity, highCrit: Infinity,
        unit: '%'
      },
      {
        field: 'temp', name: 'Skin temperature', missing: 'missing_temp',
        lowWatch: 36, lowCrit: 35.5, highWatch: 37.8, highCrit: 38.5,
        unit: '°C'
      }
    ];
    const generated = [];
    checks.forEach(check => {
      const value = frame[check.field];
      if (!Number.isFinite(value)) {
        const code = check.missing;
        if (!activeTelemetryIssues.has(code)) {
          activeTelemetryIssues.add(code);
          const alert = {
            code, severity: 'watch', source: frame.source, day: frame.day,
            timestamp: frame.timestamp, text: `${check.name} sensor reading is missing.`
          };
          if (!remoteCodes.has(code)) generated.push(alert);
        }
        return;
      }
      if (activeTelemetryIssues.delete(check.missing)) {
        const recoveredCode = `${check.field}_recovered`;
        const alert = {
          code: recoveredCode, severity: 'ok', source: frame.source, day: frame.day,
          timestamp: frame.timestamp, text: `${check.name} sensor readings resumed.`
        };
        generated.push(alert);
      }
      const low = value <= check.lowCrit ? 'crit' : value <= check.lowWatch ? 'watch' : null;
      const high = value >= check.highCrit ? 'crit' : value >= check.highWatch ? 'watch' : null;
      const level = low || high;
      const anomalyCode = level
        ? `${check.field}_${low ? 'low' : 'high'}_${level}` : null;
      const issuePrefix = `${check.field}_`;
      [...activeTelemetryIssues].filter(code => code.startsWith(issuePrefix) && code !== check.missing && code !== anomalyCode)
        .forEach(code => activeTelemetryIssues.delete(code));
      if (anomalyCode && !activeTelemetryIssues.has(anomalyCode)) {
        activeTelemetryIssues.add(anomalyCode);
        const alert = {
          code: anomalyCode,
          severity: level,
          source: frame.source,
          day: frame.day,
          timestamp: frame.timestamp,
          text: `${check.name} ${low ? 'below' : 'above'} the ${level === 'crit' ? 'critical' : 'watch'} rule threshold (${value}${check.unit}).`
        };
        if (!remoteCodes.has(anomalyCode)) generated.push(alert);
      }
    });
    remoteAlerts.forEach(alert => {
      if (alert.code) activeTelemetryIssues.add(alert.code);
      recordTelemetryAlert({ ...alert, day: frame.day, source: frame.source });
    });
    generated.forEach(alert => recordTelemetryAlert(alert));
    return generated;
  }

  function receiveTelemetryFrame(frame, remoteAlerts = [], isRemote = false) {
    const parsedTimestamp = new Date(frame.timestamp || Date.now());
    const source = frame.source === 'sensor' || frame.source === 'simulation' ? frame.source : 'simulation';
    const rawIssues = validateTelemetryFrame({ ...frame, source }, { live: true });
    if (frame.source !== 'sensor' && frame.source !== 'simulation') {
      rawIssues.push(`Invalid data source "${frame.source ?? 'missing'}".`);
    }
    recordDataQualityEvent(source, Number.isInteger(frame.day) ? frame.day : null, rawIssues);
    const normalized = {
      source,
      day: Number.isInteger(frame.day) && frame.day >= 0 && frame.day <= TOTAL_DAYS ? frame.day : 0,
      hr: Number.isFinite(frame.hr) ? frame.hr : null,
      spo2: Number.isFinite(frame.spo2) ? frame.spo2 : null,
      temp: Number.isFinite(frame.temp) ? frame.temp : null,
      units: frame.units,
      timestamp: Number.isNaN(parsedTimestamp.getTime()) ? new Date().toISOString() : parsedTimestamp.toISOString()
    };
    latestLiveFrame = normalized;
    lastLiveTelemetryAt = new Date(normalized.timestamp).getTime();
    liveTelemetryHistory.unshift(normalized);
    liveTelemetryHistory = liveTelemetryHistory.slice(0, 120);
    const generatedAlerts = detectTelemetryAnomalies(normalized, remoteAlerts);
    persistLiveTelemetry();
    renderTelemetryStatus();
    updateLiveVitals();
    renderHealthRiskPrediction();
    if (!isRemote) postLiveTelemetryFrame(normalized, generatedAlerts);
  }

  function createSimulatedTelemetryFrame() {
    const base = liveVitals();
    const frame = {
      source: 'simulation',
      sourceClientId: REALTIME_CLIENT_ID,
      day: state.day,
      hr: Math.max(35, Math.min(150, base.hr + Math.round((Math.random() - 0.5) * 8))),
      spo2: Math.max(85, Math.min(100, Math.round((base.spo2 + (Math.random() - 0.5) * 0.8) * 10) / 10)),
      temp: Math.max(34, Math.min(40, Math.round((base.temp + (Math.random() - 0.5) * 0.4) * 10) / 10)),
      timestamp: new Date().toISOString()
    };
    if (pendingMissingSpo2) {
      frame.spo2 = null;
      pendingMissingSpo2 = false;
      document.getElementById('simulateDropout').checked = false;
    }
    return frame;
  }

  function postLiveTelemetryFrame(frame, alerts = []) {
    if (!frame || !location.protocol.startsWith('http') || !serverAuthenticated) return;
    fetch(`${DB_API}/telemetry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frame, alerts })
    }).then(response => {
      telemetryServerOnline = response.ok;
      renderTelemetryStatus();
    }).catch(() => {
      telemetryServerOnline = false;
      renderTelemetryStatus();
    });
  }

  function postTelemetryAlerts(alerts) {
    if (!location.protocol.startsWith('http') || !serverAuthenticated || !alerts.length) return;
    fetch(`${DB_API}/telemetry/alerts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceClientId: REALTIME_CLIENT_ID, alerts })
    }).then(response => {
      telemetryServerOnline = response.ok;
      renderTelemetryStatus();
    }).catch(() => {
      telemetryServerOnline = false;
      renderTelemetryStatus();
    });
  }

  async function loadLiveTelemetryFromServer() {
    if (!location.protocol.startsWith('http') || !serverAuthenticated) return;
    try {
      const response = await fetch(`${DB_API}/telemetry`);
      if (!response.ok) return;
      const data = await response.json();
      const frames = Array.isArray(data.frames) ? data.frames : [];
      const alerts = Array.isArray(data.alerts) ? data.alerts : [];
      const newFrames = frames.filter(frame => !liveTelemetryHistory.some(existing =>
        existing.source === frame.source && existing.day === frame.day &&
        existing.hr === frame.hr && existing.spo2 === frame.spo2 && existing.temp === frame.temp &&
        Math.abs(new Date(existing.timestamp).getTime() - new Date(frame.timestamp).getTime()) < 2000
      ));
      liveTelemetryHistory = [...newFrames, ...liveTelemetryHistory]
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 120);
      const newAlerts = alerts.filter(alert => !telemetryAlertHistory.some(existing =>
        existing.code === alert.code && existing.day === alert.day && existing.text === alert.text &&
        Math.abs(new Date(existing.timestamp).getTime() - new Date(alert.timestamp).getTime()) < 5000
      ));
      telemetryAlertHistory = [...newAlerts, ...telemetryAlertHistory]
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 100);
      if (liveTelemetryHistory.length && (!latestLiveFrame || new Date(liveTelemetryHistory[0].timestamp) > new Date(latestLiveFrame.timestamp))) {
        latestLiveFrame = liveTelemetryHistory[0];
        lastLiveTelemetryAt = new Date(latestLiveFrame.timestamp).getTime();
      }
      telemetryServerOnline = true;
      persistLiveTelemetry();
      renderTelemetryAlertHistory();
      renderTelemetryStatus();
      updateLiveVitals();
    } catch (error) {
      telemetryServerOnline = false;
      renderTelemetryStatus();
    }
  }

  function startLiveTelemetry() {
    clearInterval(telemetryTimer);
    telemetryTimer = null;
    if (!telemetryPaused) {
      const tick = () => receiveTelemetryFrame(createSimulatedTelemetryFrame());
      tick();
      telemetryTimer = setInterval(tick, telemetryIntervalMs);
    }
    if (!telemetryMonitorTimer) telemetryMonitorTimer = setInterval(renderTelemetryStatus, 1000);
    renderTelemetryStatus();
  }

  let wavePhase = 0, waveRunning = true;
  function animateWave() {
    if (!waveRunning) return;
    const c = document.getElementById('waveCanvas');
    const ctx = c.getContext('2d');
    const light = document.documentElement.getAttribute('data-theme') === 'light';
    ctx.fillStyle = light ? '#f7fafc' : '#07111a';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = light ? 'rgba(13,143,168,.14)' : 'rgba(79,211,232,.12)';
    ctx.lineWidth = 1;
    for (let x = 0; x < c.width; x += 28) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, c.height); ctx.stroke();
    }
    for (let y = 0; y < c.height; y += 24) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(c.width, y); ctx.stroke();
    }
    ctx.fillStyle = light ? 'rgba(13,143,168,.08)' : 'rgba(79,211,232,.055)';
    ctx.fillRect(0, c.height / 2 - 1, c.width, 2);
    const v = latestLiveFrame || liveVitals();
    if (!Number.isFinite(v.hr)) {
      wavePhase += settings.reduceMotion ? 1 : 3;
      requestAnimationFrame(animateWave);
      return;
    }
    const speed = v.hr / 60;
    const waveColor = v.hr >= 105 ? '#f2c14e' : '#ff5d5d';
    ctx.beginPath(); ctx.strokeStyle = waveColor; ctx.lineWidth = 2;
    ctx.shadowBlur = 8; ctx.shadowColor = waveColor;
    const midY = c.height / 2;
    for (let x = 0; x < c.width; x++) {
      const t = (x + wavePhase) * 0.05 * speed;
      const beat = t % (Math.PI * 2);
      let y = Math.sin(t) * 6;
      if (beat > 2.9 && beat < 3.3) y -= 28 * Math.sin((beat - 2.9) / 0.4 * Math.PI);
      ctx.lineTo(x, midY + y);
    }
    ctx.stroke(); ctx.shadowBlur = 0;
    wavePhase += settings.reduceMotion ? 1 : 3;
    requestAnimationFrame(animateWave);
  }
  document.addEventListener('visibilitychange', () => { waveRunning = !document.hidden; if (waveRunning) animateWave(); });

  const els = {
    dayLabel: document.getElementById('dayLabel'),
    cardGrid: document.getElementById('cardGrid'),
    eventLine: document.getElementById('eventLine'),
    chartTitle: document.getElementById('chartTitle'),
    chartSub: document.getElementById('chartSub'),
    recoList: document.getElementById('recoList'),
    advanceBtn: document.getElementById('advanceBtn'),
    inEx: document.getElementById('in-exercise'), inSleep: document.getElementById('in-sleep'),
    inMood: document.getElementById('in-mood'), inEva: document.getElementById('in-eva'),
    lblEx: document.getElementById('lbl-ex'), lblSleep: document.getElementById('lbl-sleep'),
    lblMood: document.getElementById('lbl-mood'), lblEva: document.getElementById('lbl-eva')
  };

  function statusFor(key, val) {
    if (key === 'radiation') { if (val >= 500) return 'crit'; if (val >= 300) return 'watch'; return 'ok'; }
    if (val < 55) return 'crit'; if (val < 78) return 'watch'; return 'ok';
  }

  function scenarioValue(key, value) {
    return key === 'radiation'
      ? Math.max(0, Math.min(650, value))
      : Math.max(30, Math.min(100, value));
  }

  function scenarioAlert(key, severity, text) {
    return { key, severity, text };
  }

  function loadDailyChallengeState() {
    try {
      const saved = JSON.parse(localStorage.getItem(dailyChallengeStorageKey) || '{}');
      return {
        streak: Number.isSafeInteger(saved.streak) && saved.streak >= 0 ? saved.streak : 0,
        bestStreak: Number.isSafeInteger(saved.bestStreak) && saved.bestStreak >= 0 ? saved.bestStreak : 0,
        completedCount: Number.isSafeInteger(saved.completedCount) && saved.completedCount >= 0 ? saved.completedCount : 0,
        lastCompletedDate: typeof saved.lastCompletedDate === 'string' ? saved.lastCompletedDate : '',
        lastScore: Number.isSafeInteger(saved.lastScore) ? saved.lastScore : null,
        lastChoice: Number.isSafeInteger(saved.lastChoice) ? saved.lastChoice : null
      };
    } catch (error) {
      console.error('Could not read the saved daily challenge progress.', error);
      return { streak: 0, bestStreak: 0, completedCount: 0, lastCompletedDate: '', lastScore: null, lastChoice: null };
    }
  }

  function currentChallengeDate() {
    return new Date().toISOString().slice(0, 10);
  }

  function dailyChallengeForDate(date) {
    const dateNumber = Number(date.replaceAll('-', ''));
    return dailyChallengeScenarios[dateNumber % dailyChallengeScenarios.length];
  }

  function renderDailyChallenge() {
    const date = currentChallengeDate();
    const challenge = dailyChallengeForDate(date);
    const completedToday = dailyChallengeState.lastCompletedDate === date;
    const choiceContainer = document.getElementById('dailyChallengeChoices');
    if (!choiceContainer) return;

    document.getElementById('dailyChallengeDate').textContent = `UTC CHALLENGE · ${date}`;
    document.getElementById('dailyChallengeTitle').textContent = challenge.title;
    document.getElementById('dailyChallengeBrief').textContent = challenge.brief;
    document.getElementById('challengeCompleted').textContent = String(dailyChallengeState.completedCount);
    document.getElementById('challengeBestStreak').textContent = String(dailyChallengeState.bestStreak);

    const lastDate = dailyChallengeState.lastCompletedDate;
    const daysSinceLastCompletion = lastDate
      ? Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${lastDate}T00:00:00Z`)) / 86400000)
      : Infinity;
    const activeStreak = daysSinceLastCompletion >= 0 && daysSinceLastCompletion <= 1
      ? dailyChallengeState.streak : 0;
    document.getElementById('challengeStreak').textContent = String(activeStreak);

    const challengeChoices = challenge.choices.map((choice, index) => ({ ...choice, index }));
    const choiceOffset = Number(date.replaceAll('-', '')) % challengeChoices.length;
    const orderedChoices = challengeChoices.slice(choiceOffset).concat(challengeChoices.slice(0, choiceOffset));
    choiceContainer.replaceChildren(...orderedChoices.map(choice => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'daily-challenge-choice';
      button.dataset.challengeChoice = String(choice.index);
      button.disabled = completedToday;
      if (completedToday && dailyChallengeState.lastChoice === choice.index) button.classList.add('selected');
      if (completedToday && choice.score === 100) button.classList.add('best-choice');
      const label = document.createElement('strong');
      label.textContent = choice.label;
      const detail = document.createElement('span');
      detail.textContent = choice.detail;
      button.append(label, detail);
      return button;
    }));

    const result = document.getElementById('dailyChallengeResult');
    if (completedToday && Number.isSafeInteger(dailyChallengeState.lastChoice) &&
        challenge.choices[dailyChallengeState.lastChoice]) {
      const choice = challenge.choices[dailyChallengeState.lastChoice];
      result.replaceChildren();
      const score = document.createElement('strong');
      score.textContent = `Debrief · ${dailyChallengeState.lastScore}/100 points. `;
      result.append(score, document.createTextNode(choice.feedback));
    } else {
      result.textContent = 'Choose a response to receive your mission debrief.';
    }
  }

  function completeDailyChallenge(choiceIndex) {
    const date = currentChallengeDate();
    if (dailyChallengeState.lastCompletedDate === date) return;
    const challenge = dailyChallengeForDate(date);
    const choice = challenge.choices[choiceIndex];
    if (!choice) return;

    const yesterday = new Date(Date.parse(`${date}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
    const streak = dailyChallengeState.lastCompletedDate === yesterday
      ? dailyChallengeState.streak + 1
      : 1;
    const nextState = {
      streak,
      bestStreak: Math.max(dailyChallengeState.bestStreak, streak),
      completedCount: dailyChallengeState.completedCount + 1,
      lastCompletedDate: date,
      lastScore: choice.score,
      lastChoice: choiceIndex
    };
    try {
      localStorage.setItem(dailyChallengeStorageKey, JSON.stringify(nextState));
      dailyChallengeState = nextState;
      renderDailyChallenge();
      pushToast(`Daily mission challenge complete: ${choice.score}/100 points.`, 'ok');
    } catch (error) {
      console.error('Could not save daily challenge progress.', error);
      pushToast('Challenge completed, but progress could not be saved in this browser.', 'watch');
    }
  }

  function simulateMissionScenario() {
    const name = document.getElementById('scenarioName').value.trim() || 'Custom mission scenario';
    const days = Number(document.getElementById('scenarioDuration').value);
    const controls = {
      radiation: {
        enabled: document.getElementById('scenarioRadiation').checked,
        dose: Number(document.getElementById('scenarioRadiationDose').value)
      },
      sleep: {
        enabled: document.getElementById('scenarioSleep').checked,
        hours: Number(document.getElementById('scenarioSleepHours').value)
      },
      exercise: {
        enabled: document.getElementById('scenarioExercise').checked,
        minutes: Number(document.getElementById('scenarioExerciseMinutes').value)
      },
      comms: {
        enabled: document.getElementById('scenarioComms').checked,
        minutes: Number(document.getElementById('scenarioCommsMinutes').value)
      },
      emergency: document.getElementById('scenarioEmergency').checked
    };
    const invalid = !Number.isInteger(days) || days < 1 || days > 90 ||
      (controls.radiation.enabled && (!Number.isFinite(controls.radiation.dose) || controls.radiation.dose < 0.1 || controls.radiation.dose > 20)) ||
      (controls.sleep.enabled && (!Number.isFinite(controls.sleep.hours) || controls.sleep.hours < 0 || controls.sleep.hours > 8)) ||
      (controls.exercise.enabled && (!Number.isFinite(controls.exercise.minutes) || controls.exercise.minutes < 0 || controls.exercise.minutes > 90)) ||
      (controls.comms.enabled && (!Number.isFinite(controls.comms.minutes) || controls.comms.minutes < 1 || controls.comms.minutes > 180));
    if (invalid) {
      pushToast('Check scenario inputs: duration must be 1–90 days and stressor values must be within their stated ranges.', 'watch');
      return;
    }
    if (!Object.values(controls).some(value => typeof value === 'boolean' ? value : value.enabled)) {
      pushToast('Select at least one mission stressor before running the scenario.', 'watch');
      return;
    }

    const baseline = { ...state.current };
    const projected = { ...state.current };
    const baselineHistory = Object.fromEntries(indicators.map(key => [key, [baseline[key]]]));
    const scenarioHistory = Object.fromEntries(indicators.map(key => [key, [projected[key]]]));
    const recentSlopes = {};
    indicators.forEach(key => {
      const recent = (state.history[key] || []).slice(-8);
      recentSlopes[key] = recent.length > 1
        ? (recent[recent.length - 1] - recent[0]) / (recent.length - 1)
        : (key === 'radiation' ? 0.55 : key === 'bone' ? -0.18 : -0.08);
    });
    const baseSleep = Number(els.inSleep.value);
    const baseExercise = Number(els.inEx.value);
    const sleepEffect = hours => hours >= 7 ? 0.3 : hours >= 5 ? 0 : -0.6;

    for (let day = 1; day <= days; day += 1) {
      indicators.forEach(key => {
        baseline[key] = scenarioValue(key, baseline[key] + recentSlopes[key]);
        projected[key] = scenarioValue(key, projected[key] + recentSlopes[key]);
      });
      if (controls.radiation.enabled) projected.radiation = scenarioValue('radiation', projected.radiation + controls.radiation.dose);
      if (controls.sleep.enabled) {
        const sleep = controls.sleep.hours;
        projected.cardio = scenarioValue('cardio', projected.cardio + (sleep >= 6 ? 0.1 : -0.2) - (baseSleep >= 6 ? 0.1 : -0.2));
        projected.immune = scenarioValue('immune', projected.immune + sleepEffect(sleep) - sleepEffect(baseSleep));
        projected.behavioral = scenarioValue('behavioral', projected.behavioral + (sleep >= 6 ? 0.3 : -0.5) - (baseSleep >= 6 ? 0.3 : -0.5));
      }
      if (controls.exercise.enabled) {
        const change = controls.exercise.minutes - baseExercise;
        projected.bone = scenarioValue('bone', projected.bone + change / 90 * 0.35);
        projected.cardio = scenarioValue('cardio', projected.cardio + change / 90 * 0.45);
      }
      if (controls.comms.enabled) {
        projected.behavioral = scenarioValue('behavioral', projected.behavioral - controls.comms.minutes * 0.01);
      }
      if (controls.emergency && day === 1) {
        projected.cardio = scenarioValue('cardio', projected.cardio - 9);
        projected.immune = scenarioValue('immune', projected.immune - 8);
        projected.behavioral = scenarioValue('behavioral', projected.behavioral - 12);
      }
      indicators.forEach(key => {
        baselineHistory[key].push(baseline[key]);
        scenarioHistory[key].push(projected[key]);
      });
    }

    const beforeAlerts = indicators
      .filter(key => statusFor(key, state.current[key]) !== 'ok')
      .map(key => scenarioAlert(key, statusFor(key, state.current[key]), `${meta[key].label} is currently ${statusFor(key, state.current[key])}.`));
    const afterAlerts = indicators
      .filter(key => statusFor(key, projected[key]) !== 'ok')
      .map(key => scenarioAlert(key, statusFor(key, projected[key]), `${meta[key].label} is projected to reach ${statusFor(key, projected[key])}.`));
    if (controls.radiation.enabled) afterAlerts.push(scenarioAlert('radiation-exposure', 'watch', `Additional radiation exposure: ${(controls.radiation.dose * days).toFixed(1)} mSv across ${days} days.`));
    if (controls.sleep.enabled) afterAlerts.push(scenarioAlert('sleep', 'watch', `Sleep deprivation: ${controls.sleep.hours} hours/night for ${days} days.`));
    if (controls.exercise.enabled) afterAlerts.push(scenarioAlert('exercise', 'watch', `Reduced exercise: ${controls.exercise.minutes} minutes/day for ${days} days.`));
    if (controls.comms.enabled) afterAlerts.push(scenarioAlert('comms', 'watch', `Communication delay: ${controls.comms.minutes} minutes.`));
    if (controls.emergency) afterAlerts.push(scenarioAlert('emergency', 'crit', 'Medical emergency simulated on the first scenario day; immediate medical review required.'));

    lastScenarioResult = {
      name, days, startDay: state.day, controls,
      baseline: { ...baseline }, scenario: { ...projected },
      baselineHistory, scenarioHistory, beforeAlerts, afterAlerts,
      simulatedAt: Date.now()
    };
    saveState();
    renderScenarioResult();
  }

  function scenarioMetricText(key, value) {
    const rounded = Math.round(value * 10) / 10;
    return key === 'radiation' ? `${rounded} mSv` : `${rounded}%`;
  }

  function renderScenarioResult() {
    const result = lastScenarioResult;
    const container = document.getElementById('scenarioResults');
    if (!container) return;
    if (!result) {
      container.hidden = true;
      return;
    }
    container.hidden = false;
    document.getElementById('scenarioResultTitle').textContent = result.name;
    document.getElementById('scenarioResultSummary').textContent =
      `Current mission day ${result.startDay} → projected day ${result.startDay + result.days}. This forecast is separate from the live mission.`;

    const compositeScore = values => Math.round((values.bone + values.cardio + values.immune + values.behavioral) / 4);
    const scoreRow = document.getElementById('scenarioScoreRow');
    scoreRow.replaceChildren();
    [
      ['CURRENT HEALTH SCORE', compositeScore(Object.fromEntries(indicators.map(key => [key, state.current[key]])))],
      ['BASELINE AT END', compositeScore(result.baseline)],
      ['SCENARIO AT END', compositeScore(result.scenario)]
    ].forEach(([label, value]) => {
      const card = document.createElement('div');
      card.className = 'scenario-score-card';
      const title = document.createElement('span');
      title.textContent = label;
      const score = document.createElement('strong');
      score.textContent = `${value}/100`;
      card.append(title, score);
      scoreRow.appendChild(card);
    });

    const rows = document.getElementById('scenarioMetricRows');
    rows.replaceChildren();
    indicators.forEach(key => {
      const row = rows.insertRow();
      const values = [
        meta[key].label,
        scenarioMetricText(key, state.current[key]),
        scenarioMetricText(key, result.baseline[key]),
        scenarioMetricText(key, result.scenario[key]),
        `${result.scenario[key] - result.baseline[key] >= 0 ? '+' : ''}${(result.scenario[key] - result.baseline[key]).toFixed(1)}${key === 'radiation' ? ' mSv' : '%'}`
      ];
      values.forEach((value, index) => {
        const cell = row.insertCell();
        cell.textContent = value;
        if (index === 4) cell.className = result.scenario[key] === result.baseline[key] ? '' : result.scenario[key] < result.baseline[key] ? 'scenario-worse' : 'scenario-better';
      });
    });

    const alertComparison = document.getElementById('scenarioAlertComparison');
    alertComparison.replaceChildren();
    [
      ['BEFORE SCENARIO', result.beforeAlerts.length],
      ['AFTER SCENARIO', result.afterAlerts.length]
    ].forEach(([label, count]) => {
      const card = document.createElement('div');
      card.className = 'scenario-alert-count';
      const title = document.createElement('span');
      title.textContent = label;
      const value = document.createElement('strong');
      value.textContent = String(count);
      card.append(title, value);
      alertComparison.appendChild(card);
    });
    const alertList = document.getElementById('scenarioAlertList');
    alertList.replaceChildren();
    const alerts = [
      ...result.beforeAlerts.map(alert => ({ ...alert, when: 'BEFORE' })),
      ...result.afterAlerts.map(alert => ({ ...alert, when: 'PROJECTED' }))
    ];
    if (!alerts.length) {
      const item = document.createElement('li');
      item.textContent = 'No active or projected alerts.';
      alertList.appendChild(item);
    } else {
      alerts.forEach(alert => {
        const item = document.createElement('li');
        item.className = `scenario-alert ${alert.severity}`;
        const tag = document.createElement('strong');
        tag.textContent = alert.when;
        item.append(tag, document.createTextNode(` ${alert.text}`));
        alertList.appendChild(item);
      });
    }
    drawScenarioTrend(result);
  }

  function drawScenarioTrend(result) {
    const canvas = document.getElementById('scenarioTrendChart');
    if (!canvas || !document.getElementById('page-scenarios').classList.contains('active')) return;
    const width = Math.max(320, canvas.parentElement.clientWidth);
    const height = 250;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    const light = document.documentElement.getAttribute('data-theme') === 'light';
    const colors = {
      grid: light ? 'rgba(20,40,55,.14)' : 'rgba(220,240,255,.12)',
      text: light ? '#536879' : '#9aabba',
      baseline: '#4fd3e8',
      scenario: '#ff5d5d',
      radBaseline: '#c77dff',
      radScenario: '#f2c14e'
    };
    const left = 42, right = 12, top = 46, bottom = 34;
    const chartWidth = width - left - right;
    const chartHeight = height - top - bottom;
    ctx.clearRect(0, 0, width, height);
    ctx.font = '10px "Space Mono", monospace';
    ctx.textAlign = 'right';
    for (let value = 0; value <= 100; value += 25) {
      const y = top + chartHeight * (1 - value / 100);
      ctx.strokeStyle = colors.grid;
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(width - right, y); ctx.stroke();
      ctx.fillStyle = colors.text;
      ctx.fillText(String(value), left - 7, y + 3);
    }
    ctx.textAlign = 'center';
    ctx.fillText('CURRENT', left, height - 10);
    ctx.fillText(`+${result.days} DAYS`, width - right, height - 10);
    const scoreAt = (history, index) => (history.bone[index] + history.cardio[index] + history.immune[index] + history.behavioral[index]) / 4;
    const radiationMarginAt = (history, index) => Math.max(0, 100 - history.radiation[index] / 6);
    const drawSeries = (history, valueAt, color, dashed) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash(dashed ? [5, 4] : []);
      ctx.beginPath();
      history.bone.forEach((_, index) => {
        const x = left + chartWidth * index / result.days;
        const y = top + chartHeight * (1 - Math.max(0, Math.min(100, valueAt(history, index))) / 100);
        if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    };
    drawSeries(result.baselineHistory, scoreAt, colors.baseline, false);
    drawSeries(result.scenarioHistory, scoreAt, colors.scenario, false);
    drawSeries(result.baselineHistory, radiationMarginAt, colors.radBaseline, true);
    drawSeries(result.scenarioHistory, radiationMarginAt, colors.radScenario, true);
    const legends = [
      [colors.baseline, 'Baseline health'],
      [colors.scenario, 'Scenario health'],
      [colors.radBaseline, 'Baseline rad margin'],
      [colors.radScenario, 'Scenario rad margin']
    ];
    ctx.textAlign = 'left';
    legends.forEach(([color, label], index) => {
      const x = left + (index % 2) * Math.max(135, chartWidth / 2);
      const y = 14 + Math.floor(index / 2) * 14;
      ctx.fillStyle = color;
      ctx.fillRect(x, y - 6, 12, 2);
      ctx.fillStyle = colors.text;
      ctx.fillText(label, x + 16, y - 2);
    });
  }

  let cardSort = 'default', expandedCard = null;
  document.querySelectorAll('#cardSortRow .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#cardSortRow .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active'); cardSort = btn.dataset.sort; expandedCard = null;
      buildCards(); renderAll();
    });
  });
  function cardOrder() {
    if (cardSort === 'default') return indicators.slice();
    const rank = { crit: 0, watch: 1, ok: 2 };
    return indicators.slice().sort((a, b) => rank[statusFor(a, state.current[a])] - rank[statusFor(b, state.current[b])]);
  }

  function buildCards() {
    els.cardGrid.innerHTML = '';
    cardOrder().forEach(key => {
      const div = document.createElement('div');
      div.className = 'card' + (key === activeIndicator ? ' active' : '');
      div.id = 'card-' + key;
      div.innerHTML = `
        <div class="name">${meta[key].label} <span class="info-ic" data-key="${key}" title="Source">ⓘ</span></div>
        <div class="val"><span id="val-${key}">--</span> <span class="delta" id="delta-${key}"></span></div>
        <span class="badge" id="badge-${key}"></span>
        <canvas class="spark" id="spark-${key}" width="200" height="24"></canvas>
        <div class="card-info" id="info-${key}">${meta[key].sub}</div>
        <div class="card-expand" id="expand-${key}">
          <canvas class="spark-lg" id="sparklg-${key}" width="260" height="60"></canvas>
          <button class="view-trend-btn" data-key="${key}">VIEW FULL TREND →</button>
        </div>`;
      div.querySelector('.info-ic').addEventListener('click', (e) => {
        e.stopPropagation();
        const box = document.getElementById('info-' + key);
        box.style.display = box.style.display === 'block' ? 'none' : 'block';
      });
      div.querySelector('.view-trend-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        activeIndicator = key; renderAll(); goToPage('trends');
      });
      div.addEventListener('click', () => {
        expandedCard = expandedCard === key ? null : key;
        document.querySelectorAll('.card').forEach(c => c.classList.remove('expanded'));
        if (expandedCard) { div.classList.add('expanded'); drawSparkLarge(key); }
      });
      els.cardGrid.appendChild(div);
    });
  }

  function drawSparkLarge(key) {
    const c = document.getElementById('sparklg-' + key); if (!c) return;
    const ctx = c.getContext('2d'); ctx.clearRect(0, 0, c.width, c.height);
    const hist = state.history[key]; if (hist.length < 2) return;
    const max = key === 'radiation' ? 600 : 100;
    ctx.beginPath();
    hist.forEach((v, i) => {
      const x = (i / (hist.length - 1)) * c.width;
      const y = c.height - (v / max) * c.height;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    const st = statusFor(key, state.current[key]);
    ctx.strokeStyle = st === 'crit' ? '#ff5d5d' : st === 'watch' ? '#f2c14e' : '#4ad99b';
    ctx.lineWidth = 2; ctx.stroke();
  }
  function drawSpark(key) {
    const c = document.getElementById('spark-' + key); if (!c) return;
    const ctx = c.getContext('2d'); ctx.clearRect(0, 0, c.width, c.height);
    const hist = state.history[key].slice(-20); if (hist.length < 2) return;
    const max = key === 'radiation' ? 600 : 100;
    ctx.beginPath();
    hist.forEach((v, i) => {
      const x = (i / (hist.length - 1)) * c.width;
      const y = c.height - (v / max) * c.height;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    const st = statusFor(key, state.current[key]);
    ctx.strokeStyle = st === 'crit' ? '#ff5d5d' : st === 'watch' ? '#f2c14e' : '#4ad99b';
    ctx.lineWidth = 1.6; ctx.stroke();
  }

  function buildTrendTabs() {
    const row = document.getElementById('trendTabs'); row.innerHTML = '';
    indicators.forEach(key => {
      const b = document.createElement('button');
      b.className = 'tab-btn' + (key === activeIndicator ? ' active' : '');
      b.textContent = meta[key].label;
      b.addEventListener('click', () => { activeIndicator = key; if (compareIndicator === key) compareIndicator = null; renderAll(); });
      row.appendChild(b);
    });
  }
  function buildCompareTabs() {
    const row = document.getElementById('compareTabs'); row.innerHTML = '';
    const label = document.createElement('span');
    label.textContent = 'COMPARE:';
    label.style.cssText = "font-family:'Space Mono',monospace;font-size:0.6rem;color:var(--text-dim);align-self:center;margin-right:2px;";
    row.appendChild(label);
    ['none', ...indicators.filter(k => k !== activeIndicator)].forEach(key => {
      const b = document.createElement('button');
      const isActive = key === 'none' ? compareIndicator === null : compareIndicator === key;
      b.className = 'tab-btn' + (isActive ? ' active' : '');
      b.textContent = key === 'none' ? 'None' : meta[key].label;
      b.addEventListener('click', () => { compareIndicator = key === 'none' ? null : key; renderAll(); });
      row.appendChild(b);
    });
    const legend = document.getElementById('trendLegend');
    if (compareIndicator) legend.innerHTML = `<span style="color:#4fd3e8;">●</span> ${meta[activeIndicator].label} &nbsp;&nbsp; <span style="color:#c77dff;">●</span> ${meta[compareIndicator].label}`;
    else legend.innerHTML = '';
  }
  document.querySelectorAll('#trendRangeTabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#trendRangeTabs .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      trendRange = btn.dataset.trange;
      drawTrendChart();
    });
  });

  const trendCanvas = document.getElementById('trendChart');
  const trendTooltip = document.getElementById('trendTooltip');
  trendCanvas.addEventListener('mousemove', (e) => {
    const hist = state.history[activeIndicator]; if (hist.length < 2) return;
    const rangeInfo = getTrendRange(hist.length);
    const rect = trendCanvas.getBoundingClientRect();
    const scaleX = trendCanvas.width / rect.width;
    const xPix = (e.clientX - rect.left) * scaleX;
    const frac = xPix / trendCanvas.width;
    const idx = Math.round(rangeInfo.start + frac * (rangeInfo.end - rangeInfo.start));
    const clamped = Math.max(rangeInfo.start, Math.min(rangeInfo.end, idx));
    const val = hist[clamped];
    let text = `Day ${clamped} · ${Math.round(val * 10) / 10}${meta[activeIndicator].unit}`;
    if (compareIndicator) {
      const chist = state.history[compareIndicator];
      const cval = chist[Math.min(clamped, chist.length - 1)];
      text += ` · ${meta[compareIndicator].label}: ${Math.round(cval * 10) / 10}${meta[compareIndicator].unit}`;
    }
    trendTooltip.textContent = text;
    trendTooltip.style.display = 'block';
    trendTooltip.style.left = (e.clientX - rect.left) + 'px';
    trendTooltip.style.top = (e.clientY - rect.top) + 'px';
  });
  trendCanvas.addEventListener('mouseleave', () => { trendTooltip.style.display = 'none'; });

  function getTrendRange(len) {
    if (trendRange === 'full') return { start: 0, end: len - 1 };
    const n = parseInt(trendRange);
    return { start: Math.max(0, len - n), end: len - 1 };
  }

  let matrixRange = 30;
  document.querySelectorAll('#matrixRange .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#matrixRange .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      matrixRange = btn.dataset.range === 'full' ? 'full' : parseInt(btn.dataset.range);
      buildRiskMatrix();
    });
  });

  function showRiskDetail(d) {
    document.querySelectorAll('.risk-cell').forEach(c => c.classList.remove('selected'));
    const cell = document.getElementById('riskcell-' + d);
    if (cell) cell.classList.add('selected');
    const vals = indicators.map(k => `${meta[k].label}: ${Math.round(state.history[k][d] * 10) / 10}${meta[k].unit}`).join('  ·  ');
    document.getElementById('riskDetail').textContent = `Day ${d} — ${vals}`;
  }

  function buildRiskMatrix() {
    const grid = document.getElementById('riskGrid'); if (!grid) return;
    const totalDays = state.day;
    if (totalDays < 1) { grid.innerHTML = ''; return; }
    let start = 1;
    if (matrixRange === 30) start = Math.max(1, totalDays - 29);
    else if (matrixRange === 90) start = Math.max(1, totalDays - 89);
    grid.innerHTML = '';
    for (let d = start; d <= totalDays; d++) {
      const statuses = indicators.map(k => statusFor(k, state.history[k][d]));
      const worst = statuses.includes('crit') ? 'crit' : statuses.includes('watch') ? 'watch' : 'ok';
      const cell = document.createElement('div');
      cell.className = 'risk-cell ' + worst; cell.id = 'riskcell-' + d; cell.textContent = d;
      cell.addEventListener('click', () => showRiskDetail(d));
      grid.appendChild(cell);
    }
  }

  function drawTrendChart() {
    const c = document.getElementById('trendChart');
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    const fullHist = state.history[activeIndicator];
    const rangeInfo = getTrendRange(fullHist.length);
    const hist = fullHist.slice(rangeInfo.start, rangeInfo.end + 1);
    const max = activeIndicator === 'radiation' ? 600 : 100;
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#4fd3e8';
    const dimGrid = document.documentElement.getAttribute('data-theme') === 'light' ? 'rgba(60,80,100,.16)' : 'rgba(180,220,255,.12)';
    ctx.strokeStyle = dimGrid; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = (i / 4) * c.height;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(c.width, y); ctx.stroke();
    }
    if (hist.length > 1) {
      const pts = hist.map((v, i) => ({
        x: (i / (hist.length - 1)) * c.width,
        y: c.height - (v / max) * c.height,
        v
      }));
      const fill = ctx.createLinearGradient(0, 0, 0, c.height);
      fill.addColorStop(0, 'rgba(79,211,232,0.28)');
      fill.addColorStop(1, 'rgba(79,211,232,0.02)');
      ctx.beginPath();
      pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.lineTo(c.width, c.height); ctx.lineTo(0, c.height); ctx.closePath();
      ctx.fillStyle = fill; ctx.fill();
      ctx.beginPath();
      pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.strokeStyle = accent; ctx.lineWidth = 2.4;
      ctx.shadowBlur = 12; ctx.shadowColor = accent; ctx.stroke(); ctx.shadowBlur = 0;
      pts.filter((_, i) => i === pts.length - 1 || i % Math.max(1, Math.floor(pts.length / 8)) === 0).forEach(p => {
        ctx.beginPath(); ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
        ctx.fillStyle = '#061019'; ctx.fill(); ctx.strokeStyle = accent; ctx.lineWidth = 1.4; ctx.stroke();
      });
    }
    const thresholds = activeIndicator === 'radiation' ? [300, 500] : [78, 55];
    thresholds.forEach(th => {
        const y = c.height - (th / max) * c.height;
        const warnLine = activeIndicator === 'radiation' ? th === 300 : th === 78;
        ctx.strokeStyle = warnLine ? 'rgba(242,193,78,0.55)' : 'rgba(255,93,93,0.55)';
        ctx.setLineDash([4,4]); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(c.width, y); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = warnLine ? 'rgba(242,193,78,0.85)' : 'rgba(255,93,93,0.85)';
        ctx.font = '10px Space Mono, monospace';
        ctx.fillText((warnLine ? 'WATCH ' : 'CRIT ') + th, 8, Math.max(10, y - 4));
    });
    if (compareIndicator) {
      const cf = state.history[compareIndicator].slice(rangeInfo.start, rangeInfo.end + 1);
      const cmax = compareIndicator === 'radiation' ? 600 : 100;
      if (cf.length > 1) {
        ctx.beginPath();
        cf.forEach((v, i) => {
          const x = (i / (cf.length - 1)) * c.width;
          const y = c.height - (v / cmax) * c.height;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = '#c77dff'; ctx.lineWidth = 2;
        ctx.shadowBlur = 10; ctx.shadowColor = '#c77dff'; ctx.stroke(); ctx.shadowBlur = 0;
      }
    }
    if (replayDay !== null && replayDay >= rangeInfo.start && replayDay <= rangeInfo.end && hist.length > 1) {
      const x = ((replayDay - rangeInfo.start) / Math.max(1, rangeInfo.end - rangeInfo.start)) * c.width;
      ctx.save();
      ctx.strokeStyle = 'rgba(242,193,78,0.95)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, c.height);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(242,193,78,0.95)';
      ctx.font = '11px Space Mono, monospace';
      ctx.fillText(`DAY ${replayDay}`, Math.min(c.width - 58, x + 7), 16);
      ctx.restore();
    }
  }

  function buildRecommendations() {
    els.recoList.innerHTML = '';
    const recos = [];
    const bone = state.current.bone, cardio = state.current.cardio, immune = state.current.immune, rad = state.current.radiation, beh = state.current.behavioral;
    if (statusFor('bone', bone) !== 'ok') recos.push({ s: statusFor('bone', bone), t: 'Bone density trending down — increase resistive exercise time (ARED) and prioritize weight-bearing sessions today.' });
    else recos.push({ s: 'ok', t: 'Bone density stable — current exercise routine is sufficient.' });
    if (statusFor('cardio', cardio) !== 'ok') recos.push({ s: statusFor('cardio', cardio), t: 'Cardiovascular conditioning declining — add treadmill/cycle cardio intervals; watch for orthostatic symptoms.' });
    else recos.push({ s: 'ok', t: 'Cardiovascular status nominal.' });
    if (statusFor('immune', immune) !== 'ok') recos.push({ s: statusFor('immune', immune), t: 'Elevated inflammation markers — ensure adequate sleep and rest; flag to flight surgeon if trend continues 3+ days.' });
    else recos.push({ s: 'ok', t: 'Immune markers within normal range.' });
    const radStatus = statusFor('radiation', rad);
    if (radStatus !== 'ok') recos.push({ s: radStatus, t: radStatus === 'crit' ? 'Radiation dose approaching career limit — minimize EVA exposure and use shielded areas during solar events.' : 'Radiation dose climbing — monitor EVA scheduling closely.' });
    else recos.push({ s: 'ok', t: 'Radiation dose well within career limits.' });
    if (statusFor('behavioral', beh) !== 'ok') recos.push({ s: statusFor('behavioral', beh), t: 'Mood/sleep scores low — schedule a support call with family or ground crew; consider adjusting sleep schedule.' });
    else recos.push({ s: 'ok', t: 'Behavioral health indicators look good — keep up current routine.' });
    recos.forEach(r => {
      const li = document.createElement('li');
      li.className = r.s;
      li.innerHTML = `<span class="dot"></span><span>${r.t}</span>`;
      els.recoList.appendChild(li);
    });
  }

  function buildActionChecklist() {
    const grid = document.getElementById('actionGrid');
    if (!grid) return;
    const c = state.current;
    const envWorst = environmentReadings().find(item => item.sev !== 'ok');
    const items = [
      {
        sev: statusFor('radiation', c.radiation),
        text: c.radiation >= 300 ? 'Move nonessential work away from EVA windows and use shielded areas.' : 'Keep EVA exposure within planned limits.',
        reason: 'Radiation protection'
      },
      {
        sev: statusFor('bone', c.bone),
        text: c.bone < 78 ? 'Schedule an ARED session before the next sleep cycle.' : 'Complete planned resistive exercise block.',
        reason: 'Bone and muscle countermeasure'
      },
      {
        sev: statusFor('behavioral', c.behavioral),
        text: c.behavioral < 78 ? 'Book a support call or decompression block with ground crew.' : 'Maintain current sleep and recovery rhythm.',
        reason: 'Isolation and stress control'
      },
      {
        sev: statusFor('immune', c.immune),
        text: c.immune < 78 ? 'Prioritize rest, hydration, and symptom logging for flight surgeon review.' : 'Continue daily immune and inflammation check.',
        reason: 'Immune monitoring'
      },
      {
        sev: envWorst ? envWorst.sev : 'ok',
        text: envWorst ? `Inspect ${envWorst.label.toLowerCase()} and confirm life-support status.` : 'Cabin atmosphere is nominal; continue routine life-support scan.',
        reason: 'Closed environment safety'
      }
    ];
    grid.innerHTML = items.map((item, i) => `
      <label class="action-item ${item.sev}">
        <input type="checkbox" aria-label="Complete action ${i + 1}">
        <span>
          <span class="action-top"><span>${item.reason}</span><span class="mini-status"></span></span>
          <span class="action-text">${item.text}</span>
          <span class="action-reason">${item.sev.toUpperCase()}</span>
        </span>
      </label>`).join('');
  }

  function renderMissionCal() {
    const el = document.getElementById('missionCal'); if (!el) return;
    const start = Math.max(1, state.day - 1);
    const end = Math.min(TOTAL_DAYS, start + 14);
    let html = '';
    for (let d = start; d <= end; d++) {
      const ev = scriptedEvents[d];
      const cls = 'cal-day' + (d < state.day ? ' past' : '') + (ev ? ' event' : '');
      html += `<div class="${cls}" title="${ev ? ev.text : ''}"><div class="cal-num">${d}</div><div class="cal-icon">${ev ? (ev.warn ? '⚠️' : '⭐') : '·'}</div></div>`;
    }
    el.innerHTML = html;
  }

  function renderMissionTimeline() {
    const el = document.getElementById('missionTimeline'); if (!el) return;
    const milestones = [
      { d: 1, text: 'Launch adaptation and baseline vitals.' },
      { d: 15, text: 'Solar particle event drill.', crit: true },
      { d: 45, text: 'Resupply docking and morale boost.' },
      { d: 90, text: 'Half-mission medical review.' },
      { d: 120, text: 'CO2 scrubber repair window.', crit: true },
      { d: 150, text: 'Return conditioning phase.' },
      { d: 180, text: 'Mission closeout and landing prep.' }
    ];
    el.innerHTML = milestones.map(m => {
      const cls = 'timeline-node' + (m.d < state.day ? ' past' : '') + (m.d >= state.day ? ' event' : '') + (m.crit ? ' crit' : '');
      return `<div class="${cls}"><div class="timeline-day">DAY ${m.d}</div><div class="timeline-text">${m.text}</div></div>`;
    }).join('');
  }

  function renderAstronautProfile() {
    const nameInput = document.getElementById('crewName');
    const name = (nameInput && nameInput.value.trim()) || 'Commander';
    const v = liveVitals();
    const worst = Math.min(state.current.bone, state.current.cardio, state.current.immune, state.current.behavioral);
    const rad = state.current.radiation;
    const risk = (worst < 55 || rad >= 500) ? 'HIGH' : (worst < 78 || rad >= 300) ? 'MED' : 'LOW';
    const eva = risk === 'HIGH' ? 'HOLD' : risk === 'MED' ? 'CHECK' : 'GO';
    document.getElementById('profileName').textContent = name;
    document.getElementById('profileO2').textContent = v.spo2 + '%';
    document.getElementById('profileTemp').textContent = v.temp + 'C';
    document.getElementById('profileEva').textContent = eva;
    document.getElementById('profileRisk').textContent = risk;
    document.getElementById('profileStatus').textContent = risk === 'HIGH'
      ? 'Critical review required before EVA activity.'
      : risk === 'MED' ? 'Flight surgeon review recommended before EVA.' : 'Suit telemetry linked. EVA readiness nominal.';
  }

  function twinValue(key, day) {
    const history = state.history[key] || [];
    return Number.isFinite(history[day]) ? history[day] : (day === state.day ? state.current[key] : meta[key].start);
  }

  function twinHealthScore(snapshot) {
    return Math.round(['bone', 'cardio', 'immune', 'behavioral']
      .reduce((total, key) => total + snapshot[key], 0) / 4);
  }

  function twinDisplayValue(key, value) {
    return key === 'radiation' ? `${Math.round(value)} mSv` : `${Math.round(value * 10) / 10}%`;
  }

  function twinStatusText(key, value) {
    const status = statusFor(key, value);
    return status === 'ok' ? 'NOMINAL' : status === 'watch' ? 'WATCH' : 'CRITICAL';
  }

  function renderTwinSystemDetail(snapshot, baseline) {
    const detail = document.getElementById('twinSystemDetail');
    if (!detail) return;
    const key = twinSystem;
    const value = snapshot[key];
    const base = baseline[key];
    const diff = value - base;
    const better = key === 'radiation' ? diff <= 0 : diff >= 0;
    const system = meta[key];
    detail.innerHTML = `
      <div>
        <div class="twin-detail-label">${system.full}</div>
        <div class="twin-detail-sub">${key === 'radiation' ? 'Cumulative mission exposure' : 'Modeled health relative to baseline'}</div>
      </div>
      <div class="twin-detail-values">
        <span><small>BASELINE</small><strong>${twinDisplayValue(key, base)}</strong></span>
        <span><small>DAY ${Math.max(0, Math.min(state.day, twinDay ?? state.day))}</small><strong>${twinDisplayValue(key, value)}</strong></span>
        <span class="${better ? 'improved' : diff === 0 ? '' : 'declined'}"><small>CHANGE</small><strong>${diff > 0 ? '+' : ''}${twinDisplayValue(key, diff)}</strong></span>
      </div>
      <span class="badge ${statusFor(key, value)}">${twinStatusText(key, value)}</span>`;
  }

  function simulateTwinScenario(startDay, startingSnapshot, horizon) {
    const scenarioInputs = {
      optimal: { exercise: 110, sleep: 8, mood: 5, eva: false },
      rest: { exercise: 20, sleep: 9, mood: 4, eva: false },
      eva: { exercise: 60, sleep: 6, mood: 3, eva: true },
      neglect: { exercise: 0, sleep: 4, mood: 1, eva: false }
    };
    const inputs = scenarioInputs[twinScenario] || scenarioInputs.optimal;
    const projected = { ...startingSnapshot };
    const days = Math.min(horizon, Math.max(0, TOTAL_DAYS - startDay));
    for (let offset = 1; offset <= days; offset += 1) {
      const day = startDay + offset;
      const exerciseFactor = Math.min(1, inputs.exercise / 90);
      const timePressure = 1 + day / 360;
      projected.bone = Math.max(40, Math.min(100,
        projected.bone + (exerciseFactor * 0.35 * (1 - day / 500)) - (0.25 * timePressure) - (inputs.eva ? 0.08 : 0)));
      projected.cardio = Math.max(40, Math.min(100,
        projected.cardio + (exerciseFactor * 0.45) - 0.3 + (inputs.sleep >= 6 ? 0.1 : -0.2)));
      const sleepFactor = inputs.sleep >= 7 ? 0.3 : inputs.sleep >= 5 ? 0 : -0.6;
      projected.immune = Math.max(30, Math.min(100, projected.immune + sleepFactor - 0.1));
      projected.radiation = Math.min(650,
        projected.radiation + (0.4 * (1 + day / 720)) + (inputs.eva ? 1.8 : 0));
      projected.behavioral = Math.max(30, Math.min(100,
        projected.behavioral + ((inputs.mood - 3) * 1.1) + (inputs.sleep >= 6 ? 0.3 : -0.5)));
    }
    return { projected, days };
  }

  function renderTwinScenario(snapshot) {
    const result = document.getElementById('twinScenarioResult');
    if (!result) return;
    const horizon = Number(document.getElementById('twinScenarioDays').value) || 7;
    const startDay = Math.max(0, Math.min(state.day, twinDay ?? state.day));
    const simulation = simulateTwinScenario(startDay, snapshot, horizon);
    const startScore = twinHealthScore(snapshot);
    const projectedScore = twinHealthScore(simulation.projected);
    const delta = projectedScore - startScore;
    const heading = document.createElement('strong');
    heading.className = `twin-scenario-score ${delta > 0 ? 'improved' : delta < 0 ? 'declined' : ''}`;
    heading.textContent = `Day ${startDay} → Day ${startDay + simulation.days}: ${projectedScore}/100 (${delta > 0 ? '+' : ''}${delta} points)`;
    const list = document.createElement('div');
    list.className = 'twin-scenario-systems';
    ['bone', 'cardio', 'immune', 'behavioral', 'radiation'].forEach(key => {
      const change = simulation.projected[key] - snapshot[key];
      const better = key === 'radiation' ? change <= 0 : change >= 0;
      const item = document.createElement('span');
      item.className = better ? 'improved' : change === 0 ? '' : 'declined';
      item.textContent = `${meta[key].label}: ${twinDisplayValue(key, simulation.projected[key])} (${change > 0 ? '+' : ''}${twinDisplayValue(key, change)})`;
      list.appendChild(item);
    });
    result.replaceChildren(heading, list);
  }

  function renderDigitalTwin() {
    const slider = document.getElementById('twinDaySlider');
    const grid = document.getElementById('twinSystemGrid');
    if (!slider || !grid) return;
    const selectedDay = Math.max(0, Math.min(state.day, twinDay ?? state.day));
    slider.max = state.day;
    slider.value = selectedDay;
    document.getElementById('twinDayMax').textContent = `DAY ${state.day}`;
    document.getElementById('twinSelectedDay').textContent = selectedDay;
    document.getElementById('twinCurrentLabel').textContent = `DAY ${selectedDay} CONDITION`;

    const baseline = Object.fromEntries(indicators.map(key => [key, twinValue(key, 0)]));
    const snapshot = Object.fromEntries(indicators.map(key => [key, twinValue(key, selectedDay)]));
    const baselineScore = twinHealthScore(baseline);
    const selectedScore = twinHealthScore(snapshot);
    const delta = selectedScore - baselineScore;
    document.getElementById('twinBaselineScore').textContent = baselineScore;
    document.getElementById('twinCurrentScore').textContent = selectedScore;
    const deltaCard = document.getElementById('twinScoreDeltaCard');
    deltaCard.classList.toggle('improved', delta > 0);
    deltaCard.classList.toggle('declined', delta < 0);
    document.getElementById('twinScoreDelta').textContent = `${delta > 0 ? '+' : ''}${delta}`;

    grid.replaceChildren(...indicators.map(key => {
      const value = snapshot[key];
      const base = baseline[key];
      const scale = key === 'radiation' ? 600 : 100;
      const currentPercent = Math.max(0, Math.min(100, value / scale * 100));
      const baselinePercent = Math.max(0, Math.min(100, base / scale * 100));
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `twin-system ${statusFor(key, value)}${twinSystem === key ? ' active' : ''}`;
      button.dataset.twinSystem = key;
      button.setAttribute('aria-pressed', String(twinSystem === key));
      button.innerHTML = `
        <span class="twin-system-top"><span>${meta[key].label}</span><strong>${twinDisplayValue(key, value)}</strong></span>
        <span class="twin-track"><span class="twin-track-fill" style="width:${currentPercent}%"></span><i class="twin-baseline-marker" style="left:${baselinePercent}%"></i></span>
        <span class="twin-system-bottom"><span>Baseline ${twinDisplayValue(key, base)}</span><span>${twinStatusText(key, value)}</span></span>`;
      return button;
    }));
    renderTwinSystemDetail(snapshot, baseline);
    renderTwinScenario(snapshot);
    document.querySelectorAll('#twinScenarioSwitch button').forEach(button => {
      button.classList.toggle('active', button.dataset.twinScenario === twinScenario);
    });
  }

  function updateThemeChips() {
    document.querySelectorAll('#themeModeRow .theme-chip').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.themeMode === settings.theme);
    });
  }

  function renderAchievements() {
    const grid = document.getElementById('achGrid'); if (!grid) return;
    grid.innerHTML = Object.entries(achievements).map(([k, a]) =>
      `<div class="ach-cell ${unlocked.has(k) ? 'unlocked' : ''}">
        <div class="ach-icon">${a.icon}</div>
        <div class="ach-name">${a.name}</div>
        <div class="ach-desc">${a.desc}</div>
      </div>`).join('');
    const count = unlocked.size;
    document.getElementById('achCount').textContent = `${count} / ${Object.keys(achievements).length}`;
    document.getElementById('achBar').style.width = (count / Object.keys(achievements).length * 100) + '%';
  }

  function predictionSlope(samples) {
    if (samples.length < 2) return 0;
    const first = samples[0];
    const last = samples[samples.length - 1];
    const elapsedDays = last.day - first.day;
    return elapsedDays > 0 ? (last.value - first.value) / elapsedDays : 0;
  }

  function predictionConfidence(telemetryCount, checkinCount, healthDays, horizon) {
    let confidence = telemetryCount >= 5 && checkinCount >= 3 && healthDays >= 5
      ? 'high'
      : telemetryCount >= 2 && checkinCount >= 1 && healthDays >= 2 ? 'medium' : 'low';
    if (horizon >= 2 && confidence === 'high') confidence = 'medium';
    if (horizon >= 3) confidence = confidence === 'high' ? 'medium' : confidence === 'medium' ? 'low' : 'low';
    return confidence;
  }

  function recordPredictionSnapshots() {
    const cards = [...document.querySelectorAll('#healthRiskPredictions .risk-prediction-card')];
    cards.forEach(card => {
      const horizon = Number(card.dataset.horizon);
      if (!Number.isInteger(horizon) || predictionOutcomes.some(item => item.issuedDay === state.day && item.horizon === horizon)) return;
      predictionOutcomes.unshift({
        id: `${state.day}:${horizon}`,
        issuedDay: state.day,
        targetDay: state.day + horizon,
        horizon,
        predictedScore: Number(card.dataset.score),
        predictedLevel: card.dataset.level,
        confidence: card.dataset.confidence,
        issuedAt: new Date().toISOString(),
        outcomeStatus: 'pending'
      });
    });
    predictionOutcomes = predictionOutcomes.slice(0, 100);
    renderPredictionOutcomes();
  }

  function evaluatePredictionOutcomes(day) {
    const pending = predictionOutcomes.filter(item => item.targetDay === day && item.outcomeStatus === 'pending');
    if (!pending.length) return;
    const frame = telemetry.find(item => item.day === day);
    const healthKeys = ['bone', 'cardio', 'immune', 'behavioral'];
    const requiredHealthMissing = healthKeys.some(key => !Number.isFinite(state.history[key]?.[day]));
    const frameIssues = frame ? validateTelemetryFrame(frame) : ['Daily telemetry frame is missing.'];
    const requiredMissing = !frame ||
      !Number.isFinite(frame.hr) || !Number.isFinite(frame.spo2) ||
      !Number.isFinite(frame.sleep) || !Number.isFinite(frame.exercise) ||
      requiredHealthMissing;
    if (requiredMissing || frameIssues.some(issue => issue.startsWith('Invalid '))) {
      pending.forEach(item => {
        item.outcomeStatus = 'not_evaluable';
        item.evaluatedAt = new Date().toISOString();
        item.outcomeNote = 'Required target-day telemetry, check-in, or health readings were missing or invalid.';
      });
      renderPredictionOutcomes();
      return;
    }

    const measurements = telemetry
      .filter(item => Number.isInteger(item.day) && Number.isFinite(item.hr) && Number.isFinite(item.spo2))
      .slice()
      .sort((a, b) => a.day - b.day)
      .slice(-7);
    const trends = {
      hr: predictionSlope(measurements.map(item => ({ day: item.day, value: item.hr }))),
      spo2: predictionSlope(measurements.map(item => ({ day: item.day, value: item.spo2 })))
    };
    const healthSeries = {};
    healthKeys.forEach(key => {
      const history = state.history[key] || [];
      const startDay = Math.max(0, day - 6);
      healthSeries[key] = [];
      for (let sampleDay = startDay; sampleDay <= day; sampleDay += 1) {
        if (Number.isFinite(history[sampleDay])) healthSeries[key].push({ day: sampleDay, value: history[sampleDay] });
      }
      trends[key] = predictionSlope(healthSeries[key]);
    });
    const healthDays = Math.min(...Object.values(healthSeries).map(series => series.length));
    const actual = healthRiskForecast(
      0, measurements.length, 1, frame.sleep, frame.exercise, healthDays, trends,
      { hr: frame.hr, spo2: frame.spo2 }
    );
    pending.forEach(item => {
      item.outcomeStatus = 'evaluated';
      item.actualScore = actual.score;
      item.actualLevel = actual.level;
      item.matched = item.predictedLevel === actual.level;
      item.evaluatedAt = new Date().toISOString();
      item.outcomeNote = 'Observed target-day values scored with the same rule thresholds as the forecast.';
    });
    renderPredictionOutcomes();
  }

  function renderPredictionOutcomes() {
    const container = document.getElementById('predictionOutcomeHistory');
    const summary = document.getElementById('predictionOutcomeSummary');
    if (!container || !summary) return;
    const evaluated = predictionOutcomes.filter(item => item.outcomeStatus === 'evaluated');
    const matches = evaluated.filter(item => item.matched).length;
    summary.textContent = evaluated.length
      ? `${matches}/${evaluated.length} matched risk level${evaluated.length === 1 ? '' : 's'} so far. Descriptive only; this small, mission-specific sample is not a validated accuracy estimate.`
      : 'No forecasts have reached an evaluable target day yet.';
    container.replaceChildren();
    const recent = [...predictionOutcomes].sort((a, b) => b.issuedDay - a.issuedDay || a.horizon - b.horizon).slice(0, 12);
    if (!recent.length) {
      const empty = document.createElement('p');
      empty.className = 'data-quality-empty';
      empty.textContent = 'Forecasts will be captured when you advance a mission day.';
      container.appendChild(empty);
      return;
    }
    recent.forEach(item => {
      const row = document.createElement('div');
      row.className = `prediction-outcome-row ${item.outcomeStatus}${item.outcomeStatus === 'evaluated' ? item.matched ? ' matched' : ' different' : ''}`;
      const forecast = document.createElement('strong');
      forecast.textContent = `Day ${item.issuedDay} → ${item.targetDay}`;
      const predicted = document.createElement('span');
      predicted.textContent = `Predicted ${item.predictedLevel} (${item.predictedScore})`;
      const actual = document.createElement('span');
      actual.textContent = item.outcomeStatus === 'evaluated'
        ? `Observed ${item.actualLevel} (${item.actualScore}) · ${item.matched ? 'MATCH' : 'DIFFERENT'}`
        : item.outcomeStatus === 'not_evaluable' ? 'Outcome not evaluable · required data missing/invalid' : 'Outcome pending';
      const time = document.createElement('time');
      time.dateTime = item.evaluatedAt || item.issuedAt;
      time.textContent = new Date(item.evaluatedAt || item.issuedAt).toLocaleString();
      row.append(forecast, predicted, actual, time);
      container.appendChild(row);
    });
  }

  function healthRiskForecast(horizon, telemetryCount, checkinCount, sleep, exercise, healthDays, trends, live) {
    const projectedHr = Math.max(40, Math.min(180, live.hr + trends.hr * horizon));
    const projectedSpo2 = Math.max(80, Math.min(100, live.spo2 + trends.spo2 * horizon));
    let score = 0;
    const reasons = [];
    const addReason = (points, text) => {
      score += points;
      reasons.push({ points, text });
    };

    if (projectedHr >= 100) addReason(2, `Projected heart rate is ${Math.round(projectedHr)} bpm (rule threshold: 100 bpm).`);
    else if (projectedHr >= 90) addReason(1, `Projected heart rate is ${Math.round(projectedHr)} bpm (watch threshold: 90 bpm).`);
    if (trends.hr >= 3) addReason(1, `Recent heart-rate trend is rising about ${trends.hr.toFixed(1)} bpm/day.`);

    if (projectedSpo2 < 93) addReason(2, `Projected SpO₂ is ${projectedSpo2.toFixed(1)}% (rule threshold: below 93%).`);
    else if (projectedSpo2 < 95) addReason(1, `Projected SpO₂ is ${projectedSpo2.toFixed(1)}% (watch threshold: below 95%).`);
    if (trends.spo2 <= -0.5) addReason(1, `Recent SpO₂ trend is falling about ${Math.abs(trends.spo2).toFixed(1)} percentage points/day.`);

    if (sleep < 5) addReason(2, `Recent sleep averages ${sleep.toFixed(1)} hours (rule threshold: below 5 hours).`);
    else if (sleep < 7) addReason(1, `Recent sleep averages ${sleep.toFixed(1)} hours (watch threshold: below 7 hours).`);
    if (exercise < 30) addReason(1, `Recent exercise averages ${Math.round(exercise)} minutes/day (low-activity rule: below 30 minutes).`);

    const projectedHealth = {};
    ['bone', 'cardio', 'immune', 'behavioral'].forEach(key => {
      const current = state.current[key];
      const slope = trends[key] || 0;
      const forecast = Math.max(0, Math.min(100, current + slope * horizon));
      projectedHealth[key] = forecast;
      const status = statusFor(key, forecast);
      if (status === 'crit') addReason(2, `${meta[key].full} is projected to reach ${Math.round(forecast)}%, in the critical range.`);
      else if (status === 'watch') addReason(1, `${meta[key].full} is projected to reach ${Math.round(forecast)}%, in the watch range.`);
      else if (slope <= -0.2) addReason(1, `${meta[key].full} has a declining recent trend (${slope.toFixed(2)} points/day).`);
    });

    const level = score >= 5 ? 'high' : score >= 2 ? 'medium' : 'low';
    const confidence = predictionConfidence(telemetryCount, checkinCount, healthDays, horizon);
    return { horizon, score, level, confidence, reasons };
  }

  function renderHealthRiskPrediction() {
    const cards = document.getElementById('healthRiskPredictions');
    const drivers = document.getElementById('healthRiskDrivers');
    const quality = document.getElementById('healthRiskConfidence');
    if (!cards || !drivers || !quality) return;

    const recentTelemetry = telemetry
      .filter(frame => Number.isInteger(frame.day) &&
        Number.isFinite(frame.hr) && frame.hr >= 0 && frame.hr <= 250 &&
        Number.isFinite(frame.spo2) && frame.spo2 >= 0 && frame.spo2 <= 100)
      .slice()
      .sort((a, b) => Number(a.day) - Number(b.day))
      .slice(-7);
    const measurements = recentTelemetry.map(frame => ({ day: Number(frame.day), hr: Number(frame.hr), spo2: Number(frame.spo2) }));
    const sleepFrames = recentTelemetry.filter(frame => Number.isFinite(frame.sleep)).slice(-3);
    const exerciseFrames = recentTelemetry.filter(frame => Number.isFinite(frame.exercise)).slice(-3);
    const checkinCount = Math.min(sleepFrames.length, exerciseFrames.length);
    const sleep = sleepFrames.length
      ? sleepFrames.reduce((total, frame) => total + frame.sleep, 0) / sleepFrames.length
      : Number(els.inSleep.value);
    const exercise = exerciseFrames.length
      ? exerciseFrames.reduce((total, frame) => total + frame.exercise, 0) / exerciseFrames.length
      : Number(els.inEx.value);
    const healthSeries = {};
    ['bone', 'cardio', 'immune', 'behavioral'].forEach(key => {
      const history = state.history[key] || [];
      healthSeries[key] = [];
      const startDay = Math.max(0, state.day - 6);
      for (let day = startDay; day <= state.day; day += 1) {
        if (Number.isFinite(history[day])) {
          healthSeries[key].push({ day, value: Number(history[day]) });
        }
      }
    });
    const healthDays = Math.min(...Object.values(healthSeries).map(series => series.length));
    const trends = {
      hr: predictionSlope(measurements.map(frame => ({ day: frame.day, value: frame.hr }))),
      spo2: predictionSlope(measurements.map(frame => ({ day: frame.day, value: frame.spo2 })))
    };
    Object.keys(healthSeries).forEach(key => {
      trends[key] = predictionSlope(healthSeries[key]);
    });

    const forecasts = [1, 2, 3].map(horizon =>
      healthRiskForecast(horizon, measurements.length, checkinCount, sleep, exercise, healthDays, trends, liveVitals())
    );
    cards.replaceChildren(...forecasts.map(forecast => {
      const card = document.createElement('div');
      card.className = `risk-prediction-card ${forecast.level}`;
      const title = document.createElement('div');
      title.className = 'risk-prediction-horizon';
      title.textContent = `Next ${forecast.horizon} day${forecast.horizon === 1 ? '' : 's'}`;
      const result = document.createElement('strong');
      result.className = 'risk-prediction-level';
      result.textContent = `${forecast.level.toUpperCase()} RISK`;
      const confidence = document.createElement('span');
      confidence.className = 'risk-prediction-confidence';
      confidence.textContent = `${forecast.score} RULE POINT${forecast.score === 1 ? '' : 'S'} · ${forecast.confidence.toUpperCase()} CONFIDENCE`;
      card.dataset.horizon = String(forecast.horizon);
      card.dataset.score = String(forecast.score);
      card.dataset.level = forecast.level;
      card.dataset.confidence = forecast.confidence;
      card.append(title, result, confidence);
      return card;
    }));

    drivers.replaceChildren();
    const explanationItems = forecasts.flatMap(forecast =>
      forecast.reasons.slice(0, 3).map(reason =>
        `Day +${forecast.horizon}: +${reason.points} point${reason.points === 1 ? '' : 's'} — ${reason.text}`
      )
    );
    const visibleExplanations = explanationItems.length
      ? explanationItems.slice(0, 9)
      : ['No elevated rule-based factors are projected for the next day; this does not guarantee there is no health risk.'];
    visibleExplanations.forEach(text => {
      const item = document.createElement('li');
      item.textContent = text;
      drivers.appendChild(item);
    });
    if (!sleepFrames.length || !exerciseFrames.length) {
      const item = document.createElement('li');
      const missing = [
        !sleepFrames.length ? `sleep (${Number(els.inSleep.value).toFixed(1)} h)` : null,
        !exerciseFrames.length ? `exercise (${Number(els.inEx.value)} min)` : null
      ].filter(Boolean).join(' and ');
      item.textContent = `No logged value for ${missing}; current check-in input is used provisionally.`;
      drivers.appendChild(item);
    }

    const coverage = `${measurements.length} recent telemetry point${measurements.length === 1 ? '' : 's'}, ${checkinCount} complete sleep/exercise check-in${checkinCount === 1 ? '' : 's'}`;
    quality.textContent = `Prediction uncertainty: confidence is shown separately for each horizon and decreases as the forecast extends. Data coverage: ${coverage}. Confidence describes data coverage, not a probability. Rule-based training estimate only; not clinically validated or for diagnosis.`;
    renderPredictionOutcomes();
  }

  function renderAll() {
    els.dayLabel.innerHTML = `MISSION DAY ${state.day} <div>of ${TOTAL_DAYS}</div>`;
    indicators.forEach(key => {
      const val = state.current[key];
      const disp = key === 'radiation' ? Math.round(val) : Math.round(val * 10) / 10;
      const valEl = document.getElementById('val-' + key);
      if (valEl) valEl.textContent = disp + meta[key].unit;
      const st = statusFor(key, val);
      const badgeEl = document.getElementById('badge-' + key);
      if (badgeEl) { badgeEl.className = 'badge ' + st; badgeEl.textContent = st === 'ok' ? 'NORMAL' : st === 'watch' ? 'WATCH' : 'CRITICAL'; }
      const cardEl = document.getElementById('card-' + key);
      if (cardEl) cardEl.classList.toggle('active', key === activeIndicator);
      const hist = state.history[key];
      const deltaEl = document.getElementById('delta-' + key);
      if (deltaEl) {
        if (hist.length >= 2) {
          const diff = hist[hist.length - 1] - hist[hist.length - 2];
          const better = key === 'radiation' ? diff <= 0 : diff >= 0;
          deltaEl.className = 'delta ' + (better ? 'up' : 'down');
          deltaEl.textContent = (diff >= 0 ? '▲' : '▼') + Math.abs(Math.round(diff * 10) / 10);
        } else deltaEl.textContent = '';
      }
      if (expandedCard === key) drawSparkLarge(key);
      drawSpark(key);
    });
    els.chartTitle.textContent = meta[activeIndicator].full + ' — Trend';
    els.chartSub.textContent = meta[activeIndicator].sub;
    buildTrendTabs(); buildCompareTabs(); drawTrendChart(); buildRiskMatrix();
    buildRecommendations(); updateStatusBar(); updateLiveVitals(); drawGauge();
    drawOverviewRing(); renderOverviewStats(); updateProgress(); renderSnapshot(); renderFocus(); renderMissionCal();
    renderMissionTimeline(); renderAstronautProfile(); updateThemeChips(); updateAssistantStats();
    renderAchievements(); renderOperations(); renderHealthRiskPrediction(); renderDigitalTwin();
    renderAuditTrail();
  }

  const previewMeta = { bone: 'BONE', cardio: 'CARDIO', immune: 'IMMUNE', radiation: 'RAD (mSv)', behavioral: 'BEHAV.' };
  function computePreview() {
    const ex = parseFloat(els.inEx.value), sleep = parseFloat(els.inSleep.value);
    const mood = parseFloat(els.inMood.value), eva = els.inEva.value === '1';
    const exFactor = Math.min(1, ex / 90);
    return {
      bone: (exFactor * 0.35) - 0.25 - (eva ? 0.05 : 0),
      cardio: (exFactor * 0.45) - 0.3 + (sleep >= 6 ? 0.1 : -0.2),
      immune: (sleep >= 7 ? 0.3 : sleep >= 5 ? 0 : -0.6) - 0.1,
      radiation: 0.4 + (eva ? 1.8 : 0),
      behavioral: ((mood - 3) * 1.1) + (sleep >= 6 ? 0.3 : -0.5)
    };
  }
  function renderPreview() {
    const d = computePreview();
    document.getElementById('previewGrid').innerHTML = Object.keys(d).map(k => {
      const v = d[k];
      const isRad = k === 'radiation';
      const dir = isRad ? (v > 0.6 ? 'down' : 'up') : (v >= 0 ? 'up' : 'down');
      const sign = v >= 0 ? '+' : '';
      return `<div class="preview-cell"><div class="lbl">${previewMeta[k]}</div><div class="delta ${dir}">${sign}${v.toFixed(2)}</div></div>`;
    }).join('');
    renderHealthRiskPrediction();
  }

  const presets = {
    optimal: { ex: 110, sleep: 8, mood: 5, eva: 0 },
    rest: { ex: 20, sleep: 9, mood: 4, eva: 0 },
    eva: { ex: 60, sleep: 6, mood: 3, eva: 1 },
    neglect: { ex: 0, sleep: 4, mood: 1, eva: 0 }
  };
  document.querySelectorAll('#presetRow .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#presetRow .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const p = presets[btn.dataset.preset];
      els.inEx.value = p.ex; els.lblEx.textContent = p.ex;
      els.inSleep.value = p.sleep; els.lblSleep.textContent = p.sleep.toFixed(1);
      els.inMood.value = p.mood; els.lblMood.textContent = p.mood;
      els.inEva.value = p.eva; els.lblEva.textContent = p.eva === 1 ? 'Yes' : 'No';
      renderPreview();
      renderHealthRiskPrediction();
    });
  });
  function clearPresetActive() { document.querySelectorAll('#presetRow .tab-btn').forEach(b => b.classList.remove('active')); }
  els.inEx.addEventListener('input', () => { els.lblEx.textContent = els.inEx.value; clearPresetActive(); renderPreview(); renderHealthRiskPrediction(); });
  els.inSleep.addEventListener('input', () => { els.lblSleep.textContent = parseFloat(els.inSleep.value).toFixed(1); clearPresetActive(); renderPreview(); renderHealthRiskPrediction(); });
  els.inMood.addEventListener('input', () => { els.lblMood.textContent = els.inMood.value; clearPresetActive(); renderPreview(); });
  els.inEva.addEventListener('input', () => { els.lblEva.textContent = els.inEva.value === '1' ? 'Yes' : 'No'; clearPresetActive(); renderPreview(); });

  // ---- Expanded random events ----
  const eventsPool = [
    { text: 'Solar activity nominal. No radiation spikes detected.', rad: 0.4 },
    { text: 'Minor solar event detected — slight radiation uptick.', rad: 1.2, warn: true },
    { text: 'Equipment check complete. All life support systems green.', },
    { text: 'Crew reports good rest cycle — no anomalies.', beh: 1 },
    { text: 'CO2 scrubber running slightly inefficient — flagged for maintenance.', immune: -1, warn: true },
    { text: 'Resupply/comms window with ground support completed.', beh: 2 },
    { text: 'Exercise equipment calibration required — ARED session shortened.', bone: -1, warn: true },
    { text: 'Sleep log shows mild insomnia reported by crew member.', beh: -1, warn: true },
    { text: 'Ground control sends a family video uplink. Morale up.', beh: 3 },
    { text: 'Experiment rack troubleshooting consumed scheduled exercise window.', bone: -0.5, warn: true },
    { text: 'Microgravity adaptation remains stable. No issues.', },
    { text: 'Routine EVA suit inspection — no faults.', },
    { text: 'A mild headache reported; resolved after hydration.', beh: -0.5, warn: true },
    { text: 'Dust filter replacement completed.', },
    { text: 'Amateur radio contact with a school on Earth — behavioral boost.', beh: 2 },
    { text: 'Deep-space radiation monitor flagged elevated GCR counts.', rad: 1.5, warn: true },
    { text: 'Crew sleep cycle slightly ahead of schedule — rested.', beh: 1 },
    { text: 'Water reclamation system nominal.', },
    { text: 'Ground control adjusted daily schedule for efficiency.', beh: 1 },
    { text: 'A minor cut during exercise — treated; no impact on vitals.', },
    { text: 'Solar panel output dipped briefly due to orientation drift.', },
    { text: 'Crew member reported muscle soreness after ARED session.', bone: -0.3, warn: true },
    { text: 'Comms delay with ground briefly increased; resolved.', beh: -0.5, warn: true },
    { text: 'Surprise birthday message from family. Morale spike.', beh: 3 }
  ];

  // ---- Scripted events ----
  const scriptedEvents = {
    15: { text: 'Solar particle event detected — radiation shields activated.', rad: 3.5, warn: true },
    30: { text: 'Monthly medical checkup completed. All systems reviewed.', beh: 1 },
    45: { text: 'Resupply vehicle docked. Fresh food and letters from Earth.', beh: 4 },
    60: { text: 'Quarter-mission milestone. Ground control sends congratulations.', beh: 3 },
    90: { text: 'Halfway point reached. Commander records a message home.', beh: 2 },
    120: { text: 'Minor CO2 scrubber issue — repaired, no impact to crew.', warn: true },
    150: { text: 'Pre-return preparations begin. Physical conditioning emphasized.', },
    175: { text: 'Final stretch. Ground control increases monitoring.', warn: true }
  };

  function runDay(restoring) {
    const beforeMission = {
      day: state.day,
      current: { ...state.current },
      checkin: {
        exercise: Number(els.inEx.value),
        sleep: Number(els.inSleep.value),
        mood: Number(els.inMood.value),
        eva: els.inEva.value === '1'
      }
    };
    if (!restoring) recordPredictionSnapshots();
    if (!restoring) {
      undoStack.push(JSON.stringify({
        day: state.day, current: {...state.current},
        history: JSON.parse(JSON.stringify(state.history)),
        telemetry: [...telemetry], alertsHistory: [...alertsHistory],
        evaCount, critAlertSeen, radMilestoneHit
      }));
      if (undoStack.length > 20) undoStack.shift();
    }
    state.day += 1;
    const importedFrame = telemetry.find(f => f.day === state.day);
    if (dataSourceMode === 'imported' && importedFrame) {
      applyImportedFrame(importedFrame, 'imported');
      els.eventLine.textContent = `Imported telemetry frame applied for mission day ${state.day}.`;
      els.eventLine.classList.remove('warn');
      els.advanceBtn.textContent = `LOG DAY ${state.day + 1} & ADVANCE`;
      renderAll();
      checkAlerts();
      evaluatePredictionOutcomes(state.day);
      updateStreaks();
      if (state.day >= 1) unlockAch('firstDay');
      if (state.day >= 90) unlockAch('missionHalf');
      if (state.day >= TOTAL_DAYS) unlockAch('missionDone');
      if (!restoring) recordAuditEvent('mission.day_advanced', 'mission_day', state.day, beforeMission, {
        day: state.day,
        current: { ...state.current },
        telemetry: importedFrame,
        source: 'imported'
      });
      saveState();
      return;
    }
    if (dataSourceMode === 'imported' && !importedFrame) {
      pushToast('No imported frame found for this day. Falling back to simulator.', 'watch');
    }

    // prefer scripted event if any
    let ev = scriptedEvents[state.day];
    if (!ev) ev = eventsPool[Math.floor(Math.random() * eventsPool.length)];

    const ex = parseFloat(els.inEx.value);
    const sleep = parseFloat(els.inSleep.value);
    const mood = parseFloat(els.inMood.value);
    const eva = els.inEva.value === '1';
    if (eva) evaCount += 1;
    if (evaCount >= 5) unlockAch('evaVet');

    const exFactor = Math.min(1, ex / 90);

    // Non-linear bone loss: diminishing returns from exercise, accelerating loss over time
    const timePressure = 1 + state.day / 360;
    state.current.bone += (exFactor * 0.35 * (1 - state.day / 500)) - (0.25 * timePressure) - (eva ? 0.08 : 0);
    state.current.bone = Math.max(40, Math.min(100, state.current.bone));

    state.current.cardio += (exFactor * 0.45) - 0.3 + (sleep >= 6 ? 0.1 : -0.2);
    state.current.cardio = Math.max(40, Math.min(100, state.current.cardio));

    const sleepFactor = sleep >= 7 ? 0.3 : sleep >= 5 ? 0 : -0.6;
    state.current.immune += sleepFactor + (ev.immune || 0) * 0.3 - 0.1;
    state.current.immune = Math.max(30, Math.min(100, state.current.immune));

    // Non-linear radiation accumulation (a bit faster later in mission due to cumulative
    // background GCR - realistic modeling of cumulative exposure)
    let radGain = (ev.rad || 0.4) * (1 + state.day / 720);
    if (eva) radGain += 1.8;
    state.current.radiation = Math.min(650, state.current.radiation + radGain);

    const moodFactor = (mood - 3) * 1.1;
    state.current.behavioral += moodFactor + (sleep >= 6 ? 0.3 : -0.5) + (ev.beh || 0) * 0.3;
    state.current.behavioral = Math.max(30, Math.min(100, state.current.behavioral));

    indicators.forEach(k => state.history[k].push(state.current[k]));
    if (dataSourceMode === 'hybrid' && importedFrame) {
      applyImportedFrame(importedFrame, 'hybrid');
      ev = { text: `${ev.text} Imported telemetry correction applied.`, warn: ev.warn };
    }

    els.eventLine.textContent = ev.text;
    els.eventLine.classList.toggle('warn', !!ev.warn);
    els.advanceBtn.textContent = `LOG DAY ${state.day + 1} & ADVANCE`;

    renderAll();
    pushTelemetryFrame(liveVitals(), { sleep, exercise: ex }, dataSourceMode === 'hybrid' && importedFrame ? 'hybrid' : 'simulation');
    checkAlerts();
    evaluatePredictionOutcomes(state.day);
    updateStreaks();

    // achievements
    if (state.day >= 1) unlockAch('firstDay');
    if (state.day >= 90) unlockAch('missionHalf');
    if (state.day >= TOTAL_DAYS) unlockAch('missionDone');
    if (state.day >= 30 && state.current.bone >= 95) unlockAch('boneKeeper');
    if (state.day >= 60 && state.current.radiation < 100) unlockAch('radMiser');
    if (state.day >= 90 && !critAlertSeen) unlockAch('flawless');

    if (state.current.radiation >= 600 && !radMilestoneHit) {
      radMilestoneHit = true;
      showOverlay('Career Radiation Limit Reached', `On Day ${state.day}, cumulative dose hit the ~600 mSv career limit. In a real mission this would trigger mandatory EVA restrictions.`);
    } else if (state.day >= TOTAL_DAYS) {
      showOverlay('Mission Complete', `The crew member completed all ${TOTAL_DAYS} days of the simulated mission. Review the trend charts to see how daily choices shaped long-term health.`);
    }
    if (!restoring) recordAuditEvent('mission.day_advanced', 'mission_day', state.day, beforeMission, {
      day: state.day,
      current: { ...state.current },
      checkin: { ...beforeMission.checkin },
      source: dataSourceMode,
      event: ev.text
    });
    saveState();
  }

  function undoLastDay() {
    if (!undoStack.length) { pushToast('Nothing to undo.', 'ok'); return; }
    const before = { day: state.day, current: { ...state.current } };
    const prev = JSON.parse(undoStack.pop());
    state.day = prev.day; state.current = prev.current; state.history = prev.history;
    telemetry = prev.telemetry; alertsHistory = prev.alertsHistory;
    evaCount = prev.evaCount || 0; critAlertSeen = prev.critAlertSeen || false;
    radMilestoneHit = prev.radMilestoneHit || false;
    indicators.forEach(k => { prevStatus[k] = statusFor(k, state.current[k]); });
    els.advanceBtn.textContent = `LOG DAY ${state.day + 1} & ADVANCE`;
    renderAll();
    pushToast('Undid last mission day.', 'ok');
    recordAuditEvent('mission.day_undone', 'mission_day', before.day, before, { day: state.day, current: { ...state.current } });
    saveState();
  }

  function showOverlay(title, text) {
    document.getElementById('overlayTitle').textContent = title;
    document.getElementById('overlayText').textContent = text;
    document.getElementById('overlay').classList.add('show');
  }
  document.getElementById('closeOverlay').addEventListener('click', () => {
    document.getElementById('overlay').classList.remove('show');
  });

  els.advanceBtn.addEventListener('click', () => runDay(false));

  document.getElementById('exportBtn').addEventListener('click', () => {
    const rows = [['Day','HR_bpm','SpO2_pct','Temp_C','Radiation_mSv','Sleep_hours','Exercise_min','Mood_1_to_5','Timestamp_ISO8601']].concat(telemetry.map(f => [f.day, f.hr ?? '', f.spo2 ?? '', f.temp ?? '', f.rad ?? '', f.sleep ?? '', f.exercise ?? '', f.mood ?? '', f.timestamp ?? '']));
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'vitals-telemetry-log.csv';
    a.click();
  });
  document.getElementById('exportJsonBtn').addEventListener('click', () => {
    const data = {
      day: state.day, current: state.current, history: state.history, telemetry, alertsHistory,
      liveTelemetryHistory, telemetryAlertHistory, achievements: [...unlocked],
    commsThread, surgeonNotes, auditTrail, dataQualityEvents, predictionOutcomes,
      crewName: document.getElementById('crewName').value
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'vitals-mission-report.json';
    a.click();
  });
  document.getElementById('exportAuditBtn').addEventListener('click', async () => {
    await loadAuditTrailFromDatabase();
    const data = {
      exportedAt: new Date().toISOString(),
      mission: {
        missionId: MISSION_ID,
        day: state.day,
        crewName: document.getElementById('crewName').value,
        current: { ...state.current },
        history: state.history,
        telemetry,
        liveTelemetryHistory,
        telemetryAlertHistory,
        dataQualityEvents,
        predictionOutcomes,
        alerts: alertsHistory,
        surgeonNotes,
        communicationMessages: commsThread,
        auditTrail: [...auditTrail].sort((a, b) => a.timestamp - b.timestamp),
        unlockedAchievements: [...unlocked],
        missionDataSource: dataSourceMode,
        scenarioProjection: lastScenarioResult
      },
      disclaimer: 'Training simulation record. Actor labels are local demo identities unless authenticated by a separately configured deployment.'
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'vitals-full-mission-history.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  document.getElementById('resetBtn').addEventListener('click', () => {
    if (!confirm('Reset the mission simulation back to Day 0?')) return;
    const before = {
      day: state.day,
      current: { ...state.current },
      alertCount: alertsHistory.length,
      noteCount: surgeonNotes.length,
      auditCount: auditTrail.length
    };
    localStorage.removeItem('vitals_state');
    if (location.protocol.startsWith('http')) {
      fetch(`${DB_API}?source=${encodeURIComponent(REALTIME_CLIENT_ID)}`, { method: 'DELETE' }).catch(() => {});
    }
    resetMissionUi('Systems reset. Mission restarting from Day 0.');
    recordAuditEvent('mission.reset', 'mission', MISSION_ID, before, {
      day: state.day,
      current: { ...state.current },
      auditHistoryRetained: true
    });
  });

  document.querySelectorAll('.navbtn').forEach(btn => {
    btn.addEventListener('click', () => goToPage(btn.dataset.page));
  });
  document.getElementById('dailyChallengeChoices').addEventListener('click', event => {
    const choice = event.target.closest('[data-challenge-choice]');
    if (choice) completeDailyChallenge(Number(choice.dataset.challengeChoice));
  });
  document.getElementById('runScenarioBtn').addEventListener('click', simulateMissionScenario);
  document.getElementById('clearScenarioBtn').addEventListener('click', () => {
    lastScenarioResult = null;
    saveState();
    renderScenarioResult();
  });
  window.addEventListener('resize', () => {
    if (document.getElementById('page-scenarios').classList.contains('active') && lastScenarioResult) {
      drawScenarioTrend(lastScenarioResult);
    }
  });

  document.querySelectorAll('#roleSwitch button').forEach(btn => {
    btn.addEventListener('click', () => {
      setRole(btn.dataset.role);
      playBeep('click');
    });
  });
  document.getElementById('loginBtn')?.addEventListener('click', () => {
    const role = document.getElementById('loginRole').value;
    const name = document.getElementById('loginName').value.trim() || role.replace(/^\w/, c => c.toUpperCase());
    authUser = { name, role, signedInAt: Date.now() };
    localStorage.setItem('vitals_auth_user', JSON.stringify(authUser));
    setRole(role === 'admin' ? 'ground' : role);
    renderOperations();
    saveState();
    pushToast(`Signed in as ${name} (${role.toUpperCase()}).`, 'ok');
  });
  document.getElementById('serverAccessForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const passwordInput = document.getElementById('serverAccessPassword');
    const button = document.getElementById('serverLoginBtn');
    button.disabled = true;
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordInput.value })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Server login failed (${response.status}).`);
      passwordInput.value = '';
      window.location.reload();
    } catch (error) {
      renderServerAuthStatus(error.message);
    } finally {
      button.disabled = false;
    }
  });
  document.getElementById('serverLogoutBtn')?.addEventListener('click', async () => {
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error(`Server logout failed (${response.status}).`);
      serverAuthenticated = false;
      renderServerAuthStatus('Disconnected from the shared server. Local browser data remains available.');
      window.location.reload();
    } catch (error) {
      renderServerAuthStatus(error.message);
      console.error('Could not log out from the shared server.', error);
    }
  });
  document.getElementById('browserNotificationsBtn')?.addEventListener('click', enableBrowserNotifications);
  document.querySelectorAll('#sourceModeSwitch button').forEach(btn => {
    btn.addEventListener('click', () => {
      dataSourceMode = btn.dataset.sourceMode;
      localStorage.setItem('vitals_source_mode', dataSourceMode);
      renderOperations();
      saveState();
      pushToast(`Data source mode set to ${dataSourceMode}.`, 'ok');
    });
  });
  const incidentList = document.getElementById('incidentList');
  incidentList.addEventListener('change', event => {
    const select = event.target.closest('[data-incident-assign]');
    if (!select) return;
    const index = Number(select.dataset.incidentAssign);
    const incident = alertsHistory[index];
    if (!incident) return;
    const before = {
      assignedTo: incident.assignedTo || '',
      assignedBy: incident.assignedBy || '',
      assignedAt: incident.assignedAt || null
    };
    const after = {
      assignedTo: select.value,
      assignedBy: authUser?.name || document.getElementById('crewName').value.trim() || 'Crew',
      assignedAt: Date.now()
    };
    if (before.assignedTo === after.assignedTo) return;
    Object.assign(incident, after);
    recordAuditEvent('incident.assigned', 'incident', incident.incidentId, before, after);
    renderIncidentManagement();
    pushToast(`Incident assigned to ${commsChannels[after.assignedTo] || 'Unassigned'}.`, 'ok');
  });
  incidentList.addEventListener('click', event => {
    const button = event.target.closest('[data-incident-action]');
    if (!button) return;
    const incident = alertsHistory[Number(button.dataset.incidentIndex)];
    if (!incident) return;
    const action = button.dataset.incidentAction;
    if (!['acknowledged', 'resolved'].includes(action) || incident.status === 'resolved' || incident.status === action) return;
    const actor = authUser?.name || document.getElementById('crewName').value.trim() || 'Crew';
    const before = {
      status: incident.status || 'open',
      acknowledgedAt: incident.acknowledgedAt || null,
      resolvedAt: incident.resolvedAt || null,
      acknowledgedBy: incident.acknowledgedBy || null,
      resolvedBy: incident.resolvedBy || null
    };
    incident.status = action;
    if (action === 'acknowledged') {
      incident.acknowledgedAt = Date.now();
      incident.acknowledgedBy = actor;
    } else {
      incident.resolvedAt = Date.now();
      incident.resolvedBy = actor;
    }
    const after = {
      status: incident.status,
      acknowledgedAt: incident.acknowledgedAt || null,
      resolvedAt: incident.resolvedAt || null,
      acknowledgedBy: incident.acknowledgedBy || null,
      resolvedBy: incident.resolvedBy || null
    };
    recordAuditEvent(`incident.${action}`, 'incident', incident.incidentId, before, after);
    renderIncidentManagement();
    pushToast(`Incident ${action}.`, 'ok');
  });

  document.getElementById('addNoteBtn')?.addEventListener('click', () => {
    const canWriteNotes = ['surgeon', 'admin'].includes(authUser?.role || appRole);
    if (!canWriteNotes) {
      pushToast('Flight surgeon or admin login required to add clinical notes.', 'watch');
      return;
    }
    const noteText = document.getElementById('noteText').value.trim();
    if (!noteText) {
      pushToast('Write a note before saving.', 'watch');
      return;
    }
    const alertIndex = Number(document.getElementById('noteAlertSelect').value);
    const status = document.getElementById('noteStatus').value;
    const severity = document.getElementById('noteSeverity').value;
    const note = {
      id: createAuditId(),
      day: state.day,
      alertIndex,
      incidentId: alertIndex >= 0 ? alertsHistory[alertIndex]?.incidentId || null : null,
      status,
      severity,
      note: noteText,
      author: authUser?.name || 'Flight Surgeon',
      createdAt: Date.now()
    };
    const incident = alertIndex >= 0 ? alertsHistory[alertIndex] : null;
    const beforeIncident = incident ? {
      reviewStatus: incident.reviewStatus || null,
      clinicalSeverity: incident.clinicalSeverity || null
    } : null;
    if (incident) {
      incident.reviewStatus = status;
      incident.clinicalSeverity = severity;
    }
    surgeonNotes.unshift(note);
    document.getElementById('noteText').value = '';
    renderAlertsFeed();
    renderSurgeonNotes();
    recordAuditEvent('surgeon_note.added', 'surgeon_note', note.id, null, note);
    if (incident) {
      recordAuditEvent('incident.reviewed', 'incident', incident.incidentId, beforeIncident, {
        reviewStatus: incident.reviewStatus,
        clinicalSeverity: incident.clinicalSeverity
      });
    }
    saveState();
    pushToast('Flight surgeon note saved.', severity === 'crit' ? 'crit' : 'ok');
  });
  document.getElementById('reportBtn')?.addEventListener('click', openMissionReport);
  const telemetryIntervalInput = document.getElementById('telemetryInterval');
  telemetryIntervalInput.value = String(telemetryIntervalMs);
  telemetryIntervalInput.addEventListener('change', () => {
    telemetryIntervalMs = Number(telemetryIntervalInput.value);
    localStorage.setItem('vitals_telemetry_interval', String(telemetryIntervalMs));
    startLiveTelemetry();
  });
  document.getElementById('telemetryPauseBtn').addEventListener('click', () => {
    telemetryPaused = !telemetryPaused;
    startLiveTelemetry();
  });
  document.getElementById('simulateDropout').addEventListener('change', (event) => {
    pendingMissingSpo2 = event.target.checked;
  });
  document.getElementById('twinDaySlider')?.addEventListener('input', (event) => {
    twinDay = Number(event.target.value);
    renderDigitalTwin();
  });
  document.getElementById('twinSystemGrid')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-twin-system]');
    if (!button) return;
    twinSystem = button.dataset.twinSystem;
    renderDigitalTwin();
  });
  document.getElementById('twinScenarioSwitch')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-twin-scenario]');
    if (!button) return;
    twinScenario = button.dataset.twinScenario;
    renderDigitalTwin();
  });
  document.getElementById('twinScenarioDays')?.addEventListener('change', renderDigitalTwin);
  document.getElementById('structuredBtn')?.addEventListener('click', checkStructuredDatabase);
  document.getElementById('importCsvBtn')?.addEventListener('click', importTelemetryCsv);
  document.getElementById('replayStartBtn')?.addEventListener('click', startReplay);
  document.getElementById('replayStopBtn')?.addEventListener('click', () => stopReplay(true));
  document.getElementById('replaySlider')?.addEventListener('input', (e) => showReplayDay(e.target.value));
  window.addEventListener('online', flushOfflineQueue);
  window.addEventListener('online', syncAuditTrailToDatabase);
  window.addEventListener('online', loadLiveTelemetryFromServer);
  window.addEventListener('offline', () => { dbOnline = false; renderOperations(); });

  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const text = btn.parentElement.dataset.cite;
      navigator.clipboard.writeText(text).then(() => {
        btn.textContent = 'COPIED'; btn.classList.add('copied');
        setTimeout(() => { btn.textContent = 'COPY'; btn.classList.remove('copied'); }, 1800);
      }).catch(() => {});
    });
  });

  // ---- Theme toggle ----
  const themeBtn = document.getElementById('themeBtn');
  const themeModes = ['dark', 'light', 'emergency', 'deep'];
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', settings.theme);
    themeBtn.textContent = settings.theme === 'dark' ? '🌙' : settings.theme === 'light' ? '☀️' : settings.theme === 'emergency' ? '!' : '◇';
    localStorage.setItem('vitals_theme', settings.theme);
    updateThemeChips();
    drawTrendChart(); drawOverviewRing(); drawGauge();
  }
  themeBtn.addEventListener('click', () => {
    const i = themeModes.indexOf(settings.theme);
    settings.theme = themeModes[(i + 1) % themeModes.length];
    applyTheme();
  });
  document.querySelectorAll('#themeModeRow .theme-chip').forEach(btn => {
    btn.addEventListener('click', () => { settings.theme = btn.dataset.themeMode; applyTheme(); playBeep('click'); });
  });
  applyTheme();

  // ---- Sound toggle ----
  const soundBtn = document.getElementById('soundBtn');
  function applySound() {
    soundBtn.textContent = settings.sound ? '🔊' : '🔇';
    soundBtn.classList.toggle('muted', !settings.sound);
    localStorage.setItem('vitals_sound', settings.sound ? '1' : '0');
  }
  soundBtn.addEventListener('click', () => { settings.sound = !settings.sound; applySound(); });
  applySound();

  // ---- Undo ----
  document.getElementById('undoBtn').addEventListener('click', undoLastDay);

  // ---- Glossary ----
  const glossaryModal = document.getElementById('glossaryModal');
  document.getElementById('glossaryBtn').addEventListener('click', () => glossaryModal.classList.add('show'));
  document.getElementById('glossaryClose').addEventListener('click', () => glossaryModal.classList.remove('show'));
  glossaryModal.addEventListener('click', (e) => { if (e.target === glossaryModal) glossaryModal.classList.remove('show'); });

  // ---- Keyboard shortcuts ----
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea')) return;
    const pages = ['dashboard','overview','vitals','trends','comms','assistant','checkin','operations','achievements'];
    if (e.key === '?' ) { glossaryModal.classList.toggle('show'); e.preventDefault(); return; }
    if (e.key === 'Escape') { glossaryModal.classList.remove('show'); document.getElementById('overlay').classList.remove('show'); return; }
    if (/^[1-9]$/.test(e.key)) { goToPage(pages[+e.key - 1]); e.preventDefault(); return; }
    if (e.shiftKey && e.key === 'ArrowRight') { els.advanceBtn.click(); e.preventDefault(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { undoLastDay(); e.preventDefault(); return; }
  });

  // ---- Hash routing ----
  function handleHash() {
    const hash = location.hash.replace('#','');
    if (hash && document.getElementById('page-' + hash)) {
      document.querySelectorAll('.navbtn').forEach(b => b.classList.toggle('active', b.dataset.page === hash));
      document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + hash));
      if (hash === 'scenarios') renderScenarioResult();
    }
  }
  window.addEventListener('hashchange', handleHash);

  // ---- Intro / disclaimer ----
  const INTRO_KEY = 'vitals_intro_seen';
  function showIntro() {
    showOverlay('Welcome to VITALS',
      'This is a training simulation of an astronaut health monitor — NOT a real medical device. Readings are modeled from NASA-funded spaceflight research. Use the sidebar (or keys 1-9) to navigate, log daily check-ins, and watch how choices compound over the mission. Press "?" for a glossary.');
    localStorage.setItem(INTRO_KEY, '1');
  }
  document.getElementById('replayIntroBtn').addEventListener('click', showIntro);

  // ---- Visual effects ----
  function initCinematicUi() {
    const canvas = document.getElementById('spaceBackdrop');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const prefersStill = settings.reduceMotion;
    let w = 0, h = 0, stars = [], rafId = null;

    function resizeBackdrop() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(150, Math.max(70, Math.floor((w * h) / 11000)));
      stars = Array.from({ length: count }, (_, i) => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.55 + 0.25,
        s: Math.random() * 0.34 + 0.08,
        hue: i % 9 === 0 ? '199,125,255' : i % 7 === 0 ? '242,193,78' : '79,211,232',
        phase: Math.random() * Math.PI * 2
      }));
    }

    function drawBackdrop(t) {
      ctx.clearRect(0, 0, w, h);
      const dark = document.documentElement.getAttribute('data-theme') !== 'light';
      const glow = ctx.createRadialGradient(w * 0.64, h * 0.2, 0, w * 0.64, h * 0.2, Math.max(w, h) * 0.62);
      glow.addColorStop(0, dark ? 'rgba(79,211,232,0.16)' : 'rgba(13,143,168,0.12)');
      glow.addColorStop(0.44, dark ? 'rgba(199,125,255,0.05)' : 'rgba(242,193,78,0.06)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      stars.forEach(star => {
        const twinkle = prefersStill ? 0.7 : 0.45 + Math.sin(t * 0.0015 + star.phase) * 0.35;
        ctx.beginPath();
        ctx.fillStyle = `rgba(${star.hue},${dark ? twinkle : twinkle * 0.55})`;
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        ctx.fill();
        if (!prefersStill) {
          star.y += star.s;
          star.x += Math.sin((t + star.phase) * 0.0006) * 0.08;
          if (star.y > h + 8) { star.y = -8; star.x = Math.random() * w; }
        }
      });

      if (!prefersStill) rafId = requestAnimationFrame(drawBackdrop);
    }

    function moveLight(e) {
      const x = Math.round((e.clientX / window.innerWidth) * 100);
      const y = Math.round((e.clientY / window.innerHeight) * 100);
      document.body.style.setProperty('--mx', x + '%');
      document.body.style.setProperty('--my', y + '%');
    }

    function wireTilt(card) {
      card.addEventListener('pointermove', (e) => {
        if (prefersStill) return;
        const rect = card.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width - 0.5;
        const py = (e.clientY - rect.top) / rect.height - 0.5;
        card.style.setProperty('--tiltX', (px * 4).toFixed(2) + 'deg');
        card.style.setProperty('--tiltY', (-py * 4).toFixed(2) + 'deg');
      });
      card.addEventListener('pointerleave', () => {
        card.style.setProperty('--tiltX', '0deg');
        card.style.setProperty('--tiltY', '0deg');
      });
    }

    function pulseTarget(target) {
      const el = target.closest('.panel, .card, .vital-mini, #statusBar, .chat-shell');
      if (!el) return;
      el.classList.remove('sensor-pulse');
      void el.offsetWidth;
      el.classList.add('sensor-pulse');
    }

    resizeBackdrop();
    drawBackdrop(0);
    window.addEventListener('resize', resizeBackdrop);
    window.addEventListener('pointermove', moveLight, { passive: true });
    const orbitScene = document.getElementById('orbitScene');
    if (orbitScene && !prefersStill) {
      orbitScene.addEventListener('pointermove', (e) => {
        const rect = orbitScene.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width - 0.5;
        const py = (e.clientY - rect.top) / rect.height - 0.5;
        orbitScene.style.setProperty('--camera-tilt-x', (px * 4).toFixed(2) + 'deg');
        orbitScene.style.setProperty('--camera-tilt-y', (-py * 4).toFixed(2) + 'deg');
      });
      orbitScene.addEventListener('pointerleave', () => {
        orbitScene.style.setProperty('--camera-tilt-x', '0deg');
        orbitScene.style.setProperty('--camera-tilt-y', '0deg');
      });
    }
    document.querySelectorAll('.card').forEach(wireTilt);
    document.getElementById('cardGrid').addEventListener('pointerover', (e) => {
      const card = e.target.closest('.card');
      if (card && !card.dataset.fxReady) {
        card.dataset.fxReady = '1';
        wireTilt(card);
      }
    });
    document.addEventListener('click', (e) => {
      if (e.target.closest('button, .card, .risk-cell')) {
        pulseTarget(e.target);
        playBeep('click');
      }
    });

    if (prefersStill && rafId) cancelAnimationFrame(rafId);
  }

  // ---- Init ----
  const loaded = loadState();
  try {
    const savedLiveTelemetry = JSON.parse(localStorage.getItem('vitals_live_telemetry') || '[]');
    const savedTelemetryAlerts = JSON.parse(localStorage.getItem('vitals_telemetry_alerts') || '[]');
    if (Array.isArray(savedLiveTelemetry)) liveTelemetryHistory = savedLiveTelemetry.slice(0, 120);
    if (Array.isArray(savedTelemetryAlerts)) telemetryAlertHistory = savedTelemetryAlerts.slice(0, 100);
    latestLiveFrame = liveTelemetryHistory[0] || latestLiveFrame;
    lastLiveTelemetryAt = latestLiveFrame ? new Date(latestLiveFrame.timestamp).getTime() : lastLiveTelemetryAt;
  } catch (error) {
    console.error('Could not restore local telemetry history.', error);
  }
  buildCards();
  updateBrowserNotificationsButton();
  renderDailyChallenge();
  initCinematicUi();
  renderAll();
  renderComms();
  renderPreview();
  renderStreaks();
  renderTelemetryTable();
  if (state.day > 0) els.advanceBtn.textContent = `LOG DAY ${state.day + 1} & ADVANCE`;
  pushTelemetryFrame(liveVitals());
  renderTelemetryAlertHistory();
  startLiveTelemetry();
  animateWave();
  setInterval(updateStatusBar, 1000);
  handleHash();
  if (!localStorage.getItem(INTRO_KEY)) setTimeout(showIntro, 500);
  checkServerSession().then(async authenticated => {
    setRole(appRole, false);
    if (!authenticated) return;
    const restored = await loadStateFromDatabase();
    if (restored) {
      refreshFromPersistedState();
      pushToast('Mission state loaded from MySQL.', 'ok');
    }
    await loadAuditTrailFromDatabase();
    connectRealtimeDatabase();
    loadLiveTelemetryFromServer();
    postPresence();
    flushOfflineQueue();
    setInterval(postPresence, 8000);
  });
})();

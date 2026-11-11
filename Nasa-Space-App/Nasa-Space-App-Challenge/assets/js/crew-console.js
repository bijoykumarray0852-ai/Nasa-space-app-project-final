(function () {
  const signalKeys = ['heart_rate', 'hrv', 'spo2', 'sleep_hours', 'core_temp', 'exercise_minutes'];
  const signalLabels = {
    heart_rate: 'Heart rate',
    hrv: 'HRV (RMSSD)',
    spo2: 'SpO₂',
    sleep_hours: 'Sleep duration',
    core_temp: 'Core temperature',
    exercise_minutes: 'Exercise duration'
  };
  const history = Object.fromEntries(signalKeys.map(key => [key, []]));
  const seenAlertIds = new Set();
  const alertElements = new Map();
  const maxPoints = 48;
  const speedInput = document.getElementById('crewReplaySpeed');
  const toggleButton = document.getElementById('crewReplayToggle');
  const restartButton = document.getElementById('crewReplayRestart');
  const status = document.getElementById('crewReplayStatus');
  const summary = document.getElementById('crewPlainSummary');
  const alertList = document.getElementById('crewRuleAlerts');
  const signalFilter = document.getElementById('crewAlertSignalFilter');
  const ruleFilter = document.getElementById('crewAlertRuleFilter');
  const timeFilter = document.getElementById('crewAlertTimeFilter');
  let socket;
  let replayStatus = 'disconnected';
  let latestTimestamp = null;
  let reconnectTimer;

  function formatTimestamp(value) {
    return `${new Date(value).toISOString().replace('T', ' ').replace('.000Z', ' UTC')}`;
  }

  function updateOverview(key, signal) {
    const card = document.querySelector(`[data-overview="${key}"]`);
    if (!card) return;
    const value = card.querySelector('strong');
    const quality = card.querySelector('small');
    value.textContent = signal.value === null ? 'Missing' : Number(signal.value).toFixed(1);
    quality.textContent = signal.baseline.status === 'ready'
      ? 'Baseline ready · deviation is statistical only'
      : signal.baseline.status === 'insufficient_history'
        ? `Building baseline · ${signal.baseline.sample_count} prior readings`
        : signal.baseline.status === 'degenerate_baseline'
          ? 'Baseline has zero variation · rule not evaluated'
          : 'Current reading unavailable · rule not evaluated';
    card.dataset.quality = signal.baseline.status;
  }

  function chartCoordinates(points, width, height) {
    const values = points.filter(point => Number.isFinite(point.value)).map(point => point.value);
    points.forEach(point => {
      if (point.baseline.lower !== null) values.push(point.baseline.lower);
      if (point.baseline.upper !== null) values.push(point.baseline.upper);
    });
    if (!values.length) return null;
    let min = Math.min(...values);
    let max = Math.max(...values);
    const padding = Math.max((max - min) * 0.18, 0.5);
    min -= padding;
    max += padding;
    const left = 44;
    const right = 10;
    const top = 10;
    const bottom = 28;
    return {
      min, max, left, right, top, bottom,
      x: index => left + (index / Math.max(points.length - 1, 1)) * (width - left - right),
      y: value => height - bottom - ((value - min) / (max - min)) * (height - top - bottom)
    };
  }

  function drawChart(key) {
    const card = document.querySelector(`[data-signal="${key}"]`);
    const canvas = card?.querySelector('canvas');
    const context = canvas?.getContext('2d');
    const points = history[key];
    if (!canvas || !context || !points.length) return;

    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(260, canvas.clientWidth);
    const height = 190;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    const coordinates = chartCoordinates(points, width, height);
    if (!coordinates) return;
    const { min, max, left, right, top, bottom, x, y } = coordinates;

    context.font = "10px 'Space Mono', monospace";
    context.fillStyle = '#889bab';
    context.strokeStyle = 'rgba(136,155,171,0.22)';
    context.lineWidth = 1;
    for (let tick = 0; tick <= 4; tick += 1) {
      const value = max - ((max - min) * tick) / 4;
      const py = y(value);
      context.beginPath();
      context.moveTo(left, py);
      context.lineTo(width - right, py);
      context.stroke();
      context.fillText(value.toFixed(1), 2, py + 3);
    }

    const band = points.map((point, index) => ({ index, upper: point.baseline.upper, lower: point.baseline.lower }))
      .filter(point => point.upper !== null && point.lower !== null);
    if (band.length > 1) {
      context.beginPath();
      band.forEach((point, index) => {
        if (index === 0) context.moveTo(x(point.index), y(point.upper));
        else context.lineTo(x(point.index), y(point.upper));
      });
      band.slice().reverse().forEach(point => context.lineTo(x(point.index), y(point.lower)));
      context.closePath();
      context.fillStyle = 'rgba(79,211,232,0.14)';
      context.fill();
    }

    context.beginPath();
    points.forEach((point, index) => {
      if (!Number.isFinite(point.value)) return;
      if (index === 0 || !Number.isFinite(points[index - 1].value)) context.moveTo(x(index), y(point.value));
      else context.lineTo(x(index), y(point.value));
    });
    context.strokeStyle = '#4fd3e8';
    context.lineWidth = 2;
    context.stroke();

    points.forEach((point, index) => {
      if (!point.alert || !Number.isFinite(point.value)) return;
      context.beginPath();
      context.arc(x(index), y(point.value), 4, 0, Math.PI * 2);
      context.fillStyle = '#ffbd4a';
      context.fill();
      context.strokeStyle = '#101b26';
      context.stroke();
    });

    const first = points[0];
    const last = points[points.length - 1];
    context.fillStyle = '#889bab';
    context.textAlign = 'left';
    context.fillText(formatTimestamp(first.timestamp).slice(0, 16), left, height - 7);
    context.textAlign = 'right';
    context.fillText(formatTimestamp(last.timestamp).slice(0, 16), width - right, height - 7);
    context.textAlign = 'left';
    context.fillStyle = '#e7eef4';
    context.fillText(`${signalLabels[key]} (${last.unit})`, left, height - 16);
  }

  function installTooltips() {
    signalKeys.forEach(key => {
      const card = document.querySelector(`[data-signal="${key}"]`);
      const canvas = card?.querySelector('canvas');
      const tooltip = card?.querySelector('.crew-chart-tooltip');
      if (!canvas || !tooltip) return;
      canvas.addEventListener('pointermove', event => {
        const points = history[key];
        if (!points.length) return;
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const fraction = Math.max(0, Math.min(1, (x - 44) / Math.max(rect.width - 54, 1)));
        const point = points[Math.round(fraction * (points.length - 1))];
        const baseline = point.baseline.mean === null
          ? 'baseline unavailable'
          : `baseline mean ${point.baseline.mean.toFixed(2)} ${point.unit}, ±2 SD band`;
        tooltip.textContent = `${formatTimestamp(point.timestamp)} · ${point.value === null ? 'missing' : `${point.value} ${point.unit}`} · ${baseline}${point.alert ? ' · deterministic rule alert' : ''}`;
      });
      canvas.addEventListener('pointerleave', () => { tooltip.textContent = ''; });
    });
  }

  function appendFilterOption(select, value, label) {
    if ([...select.options].some(option => option.value === value)) return;
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.append(option);
  }

  function applyAlertFilters() {
    const selectedSignal = signalFilter.value;
    const selectedRule = ruleFilter.value;
    const days = timeFilter.value === 'all' ? null : Number(timeFilter.value);
    const cutoff = days && latestTimestamp ? Date.parse(latestTimestamp) - days * 24 * 60 * 60 * 1000 : null;
    alertList.querySelectorAll('.crew-rule-alert').forEach(item => {
      const signals = item.dataset.signals.split(',').filter(Boolean);
      const matchesSignal = !selectedSignal || signals.includes(selectedSignal);
      const matchesRule = !selectedRule || item.dataset.rule === selectedRule;
      const matchesTime = cutoff === null || Number(item.dataset.timestamp) >= cutoff;
      item.hidden = !(matchesSignal && matchesRule && matchesTime);
    });
  }

  function renderAlerts(alerts, explanations) {
    const explanationByAlert = new Map(explanations.map(explanation => [explanation.alert_id, explanation]));
    alerts.slice().reverse().forEach(alert => {
      const alertId = alert.alert_id || alert.id;
      if (seenAlertIds.has(alertId)) return;
      seenAlertIds.add(alertId);
      const item = document.createElement('li');
      item.className = 'crew-rule-alert';
      item.dataset.alertId = alertId;
      item.dataset.rule = alert.rule_id;
      item.dataset.timestamp = String(Date.parse(alert.timestamp));
      const contributing = alert.contributing_signals || [];
      const alertSignals = alert.signal ? [alert.signal] : contributing.map(signal => signal.signal);
      item.dataset.signals = alertSignals.join(',');
      const heading = document.createElement('strong');
      heading.textContent = `${alert.rule_id} · ${alert.rule}`;
      const observedAt = document.createElement('time');
      observedAt.dateTime = alert.timestamp;
      observedAt.textContent = `${formatTimestamp(alert.timestamp)} · UTC`;
      const details = document.createElement('p');
      if (alert.signal) {
        const threshold = alert.threshold_direction === 'at_or_below_negative'
          ? `z ≤ -${Number(alert.threshold).toFixed(1)}`
          : `|z| ≥ ${Number(alert.threshold).toFixed(1)}`;
        details.textContent = `${signalLabels[alert.signal]}: ${alert.current_value} ${alert.unit}; baseline mean ${Number(alert.baseline_mean).toFixed(2)} ${alert.unit} (sample SD ${Number(alert.baseline_sd).toFixed(2)}, n=${alert.sample_count}; ${alert.baseline_window}); z=${Number(alert.z_score).toFixed(2)} (threshold ${threshold}). Data quality: ${alert.data_quality_status}.`;
      } else {
        details.textContent = `${alert.deviation_count} distinct signals deviated within ${alert.baseline_window}: ${contributing.map(signal => {
          const threshold = signal.threshold_direction === 'at_or_below_negative'
            ? `z ≤ -${Number(signal.threshold).toFixed(1)}`
            : `|z| ≥ ${Number(signal.threshold).toFixed(1)}`;
          return `${signalLabels[signal.signal]} ${signal.value} ${signal.unit} (baseline ${Number(signal.baseline_mean).toFixed(2)}, SD ${Number(signal.baseline_standard_deviation).toFixed(2)}, n=${signal.sample_count}, z=${Number(signal.z_score).toFixed(2)} vs ${threshold}; ${signal.rule_id} at ${formatTimestamp(signal.timestamp)})`;
        }).join('; ')}. Coincidence does not establish a shared cause.`;
      }
      item.append(heading, observedAt, details);

      const explanation = explanationByAlert.get(alertId);
      if (explanation) {
        const evidenceState = document.createElement('p');
        evidenceState.className = 'crew-evidence-state';
        evidenceState.textContent = explanation.evidence_status === 'verified'
          ? 'Verified source metadata · research context only'
          : 'No verified source metadata for this alert';
        const explanationSource = document.createElement('span');
        explanationSource.className = 'crew-explanation-source';
        explanationSource.textContent = 'Deterministic evidence template';
        const citation = document.createElement('p');
        citation.className = 'crew-alert-explanation';
        citation.textContent = explanation.text;
        const sources = document.createElement('div');
        sources.className = 'crew-alert-sources';
        (explanation.sources || []).forEach(reference => {
          if (reference.verification_status !== 'verified') return;
          const source = document.createElement('a');
          source.href = reference.canonical_url;
          source.target = '_blank';
          source.rel = 'noopener noreferrer';
          source.textContent = `${reference.study_id} · ${reference.title}`;
          sources.appendChild(source);
        });
        if (!sources.children.length) {
          const noSource = document.createElement('span');
          noSource.textContent = 'Research evidence unavailable';
          sources.appendChild(noSource);
        }
        item.append(evidenceState, explanationSource, citation, sources);
      }
      alertList.prepend(item);
      alertElements.set(alertId, item);
      if (explanation) requestModelExplanation(explanation);
      const ruleLabel = alert.rule_id;
      appendFilterOption(ruleFilter, alert.rule_id, ruleLabel);
      alertSignals.forEach(key => appendFilterOption(signalFilter, key, signalLabels[key] || key));
    });
    if (!seenAlertIds.size) alertList.innerHTML = '<li>No rule alerts have fired in this replay.</li>';
    while (alertList.querySelectorAll('.crew-rule-alert').length > 100) {
      const oldest = alertList.querySelector('.crew-rule-alert:last-of-type');
      if (!oldest) break;
      alertElements.delete(oldest.dataset.alertId);
      oldest.remove();
    }
    applyAlertFilters();
  }

  async function requestModelExplanation(explanation) {
    if (!window.claude?.use) return;
    const source = alertElements.get(explanation.alert_id)?.querySelector('.crew-explanation-source');
    if (source) source.textContent = 'Optional explanation check pending';
    try {
      const model = await window.claude.use('sample');
      const result = await model([
        { role: 'system', content: explanation.system_prompt },
        { role: 'user', content: JSON.stringify({ alert: explanation.alert, research_metadata: explanation.studies }) }
      ], { cache: false });
      if (typeof result?.text !== 'string' || socket?.readyState !== WebSocket.OPEN) {
        throw new Error('No checked explanation response is available.');
      }
      socket.send(JSON.stringify({
        type: 'explanation_result',
        alert_id: explanation.alert_id,
        text: result.text
      }));
    } catch (error) {
      if (source) source.textContent = 'Deterministic evidence template retained';
      console.error('Optional explanation was unavailable; deterministic text remains visible.', error);
    }
  }

  function clearReplayDisplay() {
    signalKeys.forEach(key => { history[key].length = 0; drawChart(key); });
    seenAlertIds.clear();
    alertElements.clear();
    alertList.innerHTML = '<li>No rule alerts have fired in this replay.</li>';
    [...signalFilter.options].slice(1).forEach(option => option.remove());
    [...ruleFilter.options].slice(1).forEach(option => option.remove());
  }

  function setReplayStatus(nextStatus, message) {
    replayStatus = nextStatus;
    status.textContent = message || `Replay ${nextStatus}`;
    toggleButton.textContent = nextStatus === 'paused' ? 'Resume replay' : 'Pause replay';
    toggleButton.disabled = !['playing', 'paused'].includes(nextStatus);
    restartButton.disabled = !['playing', 'paused', 'completed'].includes(nextStatus);
  }

  function handleFrame(frame) {
    if (frame.type === 'error') {
      status.textContent = `${frame.code}: ${frame.message}`;
      return;
    }
    if (frame.type === 'speed') {
      status.textContent = `Connected · replay ${frame.status} · ${frame.value}×`;
      return;
    }
    if (frame.type === 'status') {
      if (frame.replay_reset) clearReplayDisplay();
      setReplayStatus(frame.status, `Connected · replay ${frame.status}${frame.speed ? ` · ${frame.speed}×` : ''}`);
      return;
    }
    if (frame.type === 'explanation_result') {
      const item = alertElements.get(frame.alert_id);
      const source = item?.querySelector('.crew-explanation-source');
      const text = item?.querySelector('.crew-alert-explanation');
      if (frame.safe && text && typeof frame.text === 'string') {
        text.textContent = frame.text;
        if (source) source.textContent = 'Optional explanation passed deterministic checks';
      } else if (source) {
        source.textContent = 'Optional model text blocked · deterministic template retained';
      }
      return;
    }
    if (frame.type !== 'telemetry') return;
    if (frame.replay_reset) clearReplayDisplay();
    latestTimestamp = frame.reading.timestamp;
    const alertedSignals = new Set();
    (frame.alerts || []).forEach(alert => {
      if (alert.signal) alertedSignals.add(alert.signal);
      (alert.contributing_signals || []).forEach(signal => alertedSignals.add(signal.signal));
    });
    signalKeys.forEach(key => {
      const result = frame.signals[key];
      updateOverview(key, result);
      history[key].push({
        value: result.value,
        unit: result.unit,
        timestamp: frame.reading.timestamp,
        baseline: result.baseline,
        alert: alertedSignals.has(key)
      });
      if (history[key].length > maxPoints) history[key].shift();
      drawChart(key);
    });
    summary.textContent = frame.summary;
    setReplayStatus('playing', `Connected · simulated row ${frame.sequence + 1} of ${frame.reading.timestamp}`);
    renderAlerts(frame.alerts || [], frame.explanations || []);
    applyAlertFilters();
  }

  function connect() {
    clearTimeout(reconnectTimer);
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${protocol}//${location.hostname}:8000/ws/vitals`);
    socket.addEventListener('open', () => {
      setReplayStatus('playing', 'Connected · simulated replay starting');
      socket.send(JSON.stringify({ type: 'speed', value: Number(speedInput.value) }));
    });
    socket.addEventListener('message', event => {
      try {
        handleFrame(JSON.parse(event.data));
      } catch (error) {
        status.textContent = `Replay data error: ${error.message}`;
        console.error('Could not render simulated crew telemetry.', error);
      }
    });
    socket.addEventListener('close', () => {
      setReplayStatus('disconnected', 'Disconnected · reconnecting to simulated replay…');
      reconnectTimer = window.setTimeout(connect, 2000);
    });
    socket.addEventListener('error', () => {
      setReplayStatus('disconnected', 'Replay service unavailable. Start the FastAPI service on port 8000.');
    });
  }

  speedInput.addEventListener('change', () => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'speed', value: Number(speedInput.value) }));
    }
  });
  toggleButton.addEventListener('click', () => {
    if (socket?.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: replayStatus === 'paused' ? 'resume' : 'pause' }));
  });
  restartButton.addEventListener('click', () => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'restart' }));
  });
  [signalFilter, ruleFilter, timeFilter].forEach(filter => filter.addEventListener('change', applyAlertFilters));
  window.addEventListener('resize', () => signalKeys.forEach(drawChart));
  installTooltips();
  connect();
}());

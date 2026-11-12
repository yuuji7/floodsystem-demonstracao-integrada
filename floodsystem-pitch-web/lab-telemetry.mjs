async function post(path, payload) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`);
    error.retryable = response.status >= 500 || response.status === 429;
    throw error;
  }
  return response.json();
}

export async function connectLabTelemetry(report, calibration = {}) {
  const profile = await post('/demonstracao/sessoes', calibration);
  const device = profile.device_id;
  const pending = [];
  let levelCount = 0;
  let tipCount = 0;
  let sending = false;
  let retry;
  let closed = false;
  let failed = false;

  async function flush() {
    if (closed || failed || sending || retry || !pending.length) return;
    sending = true;
    try {
      while (!closed && pending.length) {
        const [route, body] = pending[0];
        await post(`/api/v1/${route}`, body);
        pending.shift();
      }
      if (!closed) report('Leituras enviadas');
    } catch (error) {
      if (closed) return;
      if (error.retryable === false) {
        failed = true;
        report(`Envio recusado (${error.message}). Reinicie o ensaio.`, 'error');
      } else {
        report('Conexão instável. Reenviando leituras…', 'retry');
        retry = setTimeout(() => {
          retry = undefined;
          void flush();
        }, 1500);
      }
    } finally {
      sending = false;
    }
  }

  return {
    profile,
    get failed() { return failed; },
    level(distanceMm, utcMs) {
      pending.push(['level-readings', {
        device_id: device,
        reading_id: `nivel-${++levelCount}`,
        measured_at: new Date(utcMs).toISOString(),
        distance_cm: Number((distanceMm / 10).toFixed(6))
      }]);
      void flush();
    },
    tip(utcMs) {
      pending.push(['rain-tips', {
        device_id: device,
        events: [{ event_id: `basc-${++tipCount}`, occurred_at: new Date(utcMs).toISOString() }]
      }]);
      void flush();
    },
    close() {
      closed = true;
      clearTimeout(retry);
      pending.length = 0;
    }
  };
}

const LEVEL_SAMPLE_SECONDS = 10;

export function createTelemetryClock(telemetry, advance, readings) {
  let segment;
  let nextLevelAt;

  return {
    pause() { segment = undefined; },
    tick(state, settings, now) {
      if (!segment) {
        segment = { performanceMs: now, utcMs: Date.now(), elapsed: state.time };
        nextLevelAt ??= state.time;
      }
      const target = segment.elapsed + Math.max(0, now - segment.performanceMs) / 1000;
      const utc = elapsed => segment.utcMs + (elapsed - segment.elapsed) * 1000;
      const onTip = elapsed => telemetry.tip(utc(elapsed));
      while (nextLevelAt <= target) {
        advance(state, settings, Math.max(0, nextLevelAt - state.time), onTip);
        telemetry.level(readings(state, settings).distance, utc(nextLevelAt));
        nextLevelAt += LEVEL_SAMPLE_SECONDS;
      }
      advance(state, settings, Math.max(0, target - state.time), onTip);
    }
  };
}

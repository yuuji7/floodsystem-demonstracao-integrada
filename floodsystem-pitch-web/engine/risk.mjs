// Experimental thresholds, shared by live station data and historical replay.
export const SIGNAL_LIMITS = Object.freeze({rainRate: 30, rainHour: 30, riseRate: 5});
export const BLOCK_MINUTES = 10;
const minute = 60_000;
const known = value => Number.isFinite(value);
const ratio = (value, limit) => Math.max(0, Math.min(1, value / limit));

export function assessFlood({rainRate, rainHour, riseRate}) {
  const rainKnown = known(rainRate) || known(rainHour);
  const riseKnown = known(riseRate);
  const intense = known(rainRate) && rainRate >= SIGNAL_LIMITS.rainRate;
  const accumulated = known(rainHour) && rainHour >= SIGNAL_LIMITS.rainHour;
  const rising = riseKnown && riseRate >= SIGNAL_LIMITS.riseRate;
  const wetSignal = intense || accumulated;
  const rainSignal = Math.max(
    known(rainRate) ? ratio(rainRate, SIGNAL_LIMITS.rainRate) : 0,
    known(rainHour) ? ratio(rainHour, SIGNAL_LIMITS.rainHour) : 0
  );
  const score = rainKnown && riseKnown
    ? Math.round(50 * (rainSignal + ratio(riseRate, SIGNAL_LIMITS.riseRate))) : null;
  let severity = 'unknown';
  if (rising && wetSignal) severity = 'warning';
  else if (rising) severity = 'watch';
  else if (wetSignal || score >= 55) severity = 'observe';
  else if (score !== null) severity = 'normal';
  return {severity, score, intense, accumulated, rising};
}

export function riseBetween(level, at, prior) {
  if (!known(level) || !known(at)) return null;
  for (let i = prior.length - 1; i >= 0; i--) {
    const point = prior[i];
    const elapsed = (at - point.at) / minute;
    if (elapsed > 30) break;
    if (elapsed >= BLOCK_MINUTES && known(point.level)) {
      return 1000 * (level - point.level) / elapsed;
    }
  }
  return null;
}

export function assessStation(station, blocks, now = Date.now()) {
  const at = station?.at + 5 * minute;
  // The feed marks the beginning of the observation block, not its end.
  const fresh = known(at) && at <= now + 2 * minute && now - at <= 20 * minute;
  const rainRate = fresh && known(station.rain5) ? station.rain5 * 12 : null;
  const rainHour = fresh ? station.rainHour ?? null : null;
  const riseRate = fresh ? riseBetween(station.level, at, blocks) : null;
  return {at, fresh, rainRate, rainHour, riseRate, ...assessFlood({rainRate, rainHour, riseRate})};
}

export function replayStation(points) {
  const blocks = [];
  for (const point of points) {
    const at = point.at + BLOCK_MINUTES * minute;
    const window = [...blocks.slice(-5), {...point, at}];
    const fullHour = window.length === 6 && window.every((p, i) =>
      p.at === at - (5 - i) * BLOCK_MINUTES * minute && known(p.rain));
    const rainHour = fullHour ? window.reduce((total, p) => total + p.rain, 0) : null;
    const rainRate = point.rainRate ?? (known(point.rain) ? point.rain * 6 : null);
    const riseRate = riseBetween(point.level, at, blocks);
    blocks.push({...point, at, rainHour, rainRate, riseRate, ...assessFlood({rainRate, rainHour, riseRate})});
  }
  return blocks;
}

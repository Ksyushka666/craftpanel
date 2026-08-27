export type MetricSource = {
  cpuPercent: number;
  ramUsedMb: number;
  ramTotalMb: number;
  playersOnline: number;
};

export type MetricPoint = {
  timestamp: number;
  cpu: number;
  ram: number;
  players: number;
};

export function createMetricPoint(
  source: MetricSource,
  timestamp = Date.now()
): MetricPoint {
  return {
    timestamp,
    cpu: Math.max(0, Math.min(100, source.cpuPercent)),
    ram: source.ramTotalMb
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round((source.ramUsedMb / source.ramTotalMb) * 100)
          )
        )
      : 0,
    players: Math.max(0, source.playersOnline),
  };
}

export function appendMetricPoint(
  history: MetricPoint[],
  point: MetricPoint,
  maxPoints = 36
): MetricPoint[] {
  return [...history, point].slice(-Math.max(1, maxPoints));
}

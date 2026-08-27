import { describe, expect, it } from "vitest";
import { appendMetricPoint, createMetricPoint } from "./metrics";

describe("metric history", () => {
  it("converts runtime telemetry into bounded chart values", () => {
    expect(
      createMetricPoint(
        {
          cpuPercent: 135,
          ramUsedMb: 2048,
          ramTotalMb: 4096,
          playersOnline: 7,
        },
        123
      )
    ).toEqual({ timestamp: 123, cpu: 100, ram: 50, players: 7 });
  });

  it("keeps only the latest points", () => {
    const points = [1, 2, 3].map(timestamp => ({
      timestamp,
      cpu: timestamp,
      ram: timestamp,
      players: timestamp,
    }));
    expect(
      appendMetricPoint(points, { ...points[0], timestamp: 4 }, 3).map(
        p => p.timestamp
      )
    ).toEqual([2, 3, 4]);
  });
});

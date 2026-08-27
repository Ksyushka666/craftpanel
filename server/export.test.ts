import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "./export";

describe("CSV export", () => {
  it("quotes commas, quotes, and line breaks using CSV escaping", () => {
    expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
  });

  it("creates a CRLF-delimited CSV document with a trailing newline", () => {
    expect(toCsv(["action", "target"], [["restart", "server-1"], ["note", "line\nbreak"]])).toBe("action,target\r\nrestart,server-1\r\nnote,\"line\nbreak\"\r\n");
  });
});

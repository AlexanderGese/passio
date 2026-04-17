import { describe, expect, test } from "bun:test";
import { parseIcs } from "./calendar.js";

describe("parseIcs", () => {
  test("parses a VEVENT with UTC datetime", () => {
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
SUMMARY:Standup
DTSTART:20260418T130000Z
DTEND:20260418T133000Z
LOCATION:Zoom
END:VEVENT
END:VCALENDAR`;
    const events = parseIcs(ics);
    expect(events).toHaveLength(1);
    expect(events[0]?.summary).toBe("Standup");
    expect(events[0]?.start.toISOString()).toBe("2026-04-18T13:00:00.000Z");
    expect(events[0]?.location).toBe("Zoom");
  });

  test("handles continuation (folded) lines", () => {
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
SUMMARY:A very long summary that would\r
 \twrap to next line
DTSTART:20260418T130000Z
END:VEVENT
END:VCALENDAR`;
    const events = parseIcs(ics);
    expect(events[0]?.summary).toContain("wrap to next line");
  });

  test("handles all-day events", () => {
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
SUMMARY:Holiday
DTSTART;VALUE=DATE:20261225
END:VEVENT
END:VCALENDAR`;
    const events = parseIcs(ics);
    expect(events[0]?.summary).toBe("Holiday");
    expect(events[0]?.start.toISOString().startsWith("2026-12-25T")).toBe(true);
  });
});

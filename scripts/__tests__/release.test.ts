import { describe, expect, test } from "bun:test";
import { bumpVersion, buildChangelogEntry } from "../release.mjs";

describe("bumpVersion", () => {
  test("patch increments the third segment", () => {
    expect(bumpVersion("1.2.3", "patch")).toBe("1.2.4");
  });

  test("minor increments the second segment and resets patch", () => {
    expect(bumpVersion("1.2.3", "minor")).toBe("1.3.0");
  });

  test("major increments the first segment and resets minor and patch", () => {
    expect(bumpVersion("1.2.3", "major")).toBe("2.0.0");
  });

  test("throws on an unknown bump kind", () => {
    expect(() => bumpVersion("1.2.3", "bogus")).toThrow("Unknown bump kind: bogus");
  });
});

describe("buildChangelogEntry", () => {
  test("formats a heading and bullet list from commit subjects", () => {
    const entry = buildChangelogEntry("1.3.0", "2026-07-14", ["feat: add X", "fix: correct Y"]);
    expect(entry).toBe("## [1.3.0] - 2026-07-14\n\n- feat: add X\n- fix: correct Y\n");
  });

  test("falls back to a placeholder line when there are no commits", () => {
    const entry = buildChangelogEntry("1.3.1", "2026-07-15", []);
    expect(entry).toBe("## [1.3.1] - 2026-07-15\n\n- No changes recorded.\n");
  });
});

import { describe, expect, test } from "bun:test";
import { extractChangelog } from "../../../scripts/extract-changelog.mjs";

const FIXTURE = `# Changelog

## [1.1.0] - 2026-07-01

### Added
- New feature

## [1.0.0] - 2026-06-02

### Initial release
- First feature
- Second feature

## [0.9.0] - 2026-05-01

### Added
- Old feature
`;

describe("extractChangelog", () => {
  test("extracts section for matching version", () => {
    const result = extractChangelog(FIXTURE, "v1.0.0");
    expect(result).toContain("### Initial release");
    expect(result).toContain("First feature");
    expect(result).not.toContain("New feature");
    expect(result).not.toContain("Old feature");
  });

  test("accepts version without v prefix", () => {
    const result = extractChangelog(FIXTURE, "1.0.0");
    expect(result).toContain("### Initial release");
  });

  test("returns empty string when version not found", () => {
    expect(extractChangelog(FIXTURE, "v9.9.9")).toBe("");
  });

  test("extracts the most recent version section", () => {
    const result = extractChangelog(FIXTURE, "v1.1.0");
    expect(result).toContain("New feature");
    expect(result).not.toContain("First feature");
  });
});

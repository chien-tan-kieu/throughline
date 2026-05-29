import { describe, expect, test } from "bun:test";
import { parseFrontmatter } from "../story.ts";

describe("parseFrontmatter", () => {
  test("parses all required fields from valid frontmatter", () => {
    const content = `---
id: US-2026-05-13-oauth-login
title: Add OAuth login
status: in-progress
created: 2026-05-13
---

## Story

As a user...`;
    const result = parseFrontmatter(content);
    expect(result).not.toBeNull();
    expect(result?.id).toBe("US-2026-05-13-oauth-login");
    expect(result?.title).toBe("Add OAuth login");
    expect(result?.status).toBe("in-progress");
    expect(result?.created).toBe("2026-05-13");
  });

  test("parses optional fields when present", () => {
    const content = `---
id: US-2026-05-13-oauth
title: OAuth
status: backlog
created: 2026-05-13
size: M
linked_spec: docs/superpowers/specs/oauth.md
linked_plan: docs/superpowers/plans/oauth.md
---
`;
    const result = parseFrontmatter(content);
    expect(result?.size).toBe("M");
    expect(result?.linked_spec).toBe("docs/superpowers/specs/oauth.md");
    expect(result?.linked_plan).toBe("docs/superpowers/plans/oauth.md");
  });

  test("returns null when required field is missing", () => {
    const content = `---
id: US-2026-05-13-oauth
title: OAuth
status: backlog
---
`;
    expect(parseFrontmatter(content)).toBeNull();
  });

  test("returns null when no frontmatter delimiters found", () => {
    expect(parseFrontmatter("No frontmatter here.")).toBeNull();
  });

  test("ignores extra unknown fields", () => {
    const content = `---
id: US-2026-05-13-test
title: Test
status: backlog
created: 2026-05-13
unknown_field: ignored
---
`;
    const result = parseFrontmatter(content);
    expect(result).not.toBeNull();
    expect(result?.id).toBe("US-2026-05-13-test");
  });

  test("parses story with empty optional fields (size: '')", () => {
    const content = `---
id: US-2026-05-26-verify-sync
title: Verify sync
status: backlog
created: 2026-05-26
size:
---
`;
    const result = parseFrontmatter(content);
    expect(result).not.toBeNull();
    expect(result?.size).toBeUndefined();
  });

  test("preserves body after second --- delimiter", () => {
    const content = `---
id: US-2026-05-13-test
title: Test
status: backlog
created: 2026-05-13
---

## Story

Some body content here.`;
    const result = parseFrontmatter(content);
    expect(result).not.toBeNull();
  });
});

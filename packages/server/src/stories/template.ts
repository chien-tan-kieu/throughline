// packages/server/src/stories/template.ts
export function scaffoldStory(
  id: string,
  title: string,
  created: string,
): string {
  return `---
id: ${id}
title: ${title}
status: backlog
created: ${created}
---

## Story

As a [...], I want [...], so that [...].

## Acceptance criteria

- [ ] ...

## Notes

(optional)
`;
}

import { describe, expect, test } from "bun:test";
import { parseMarkdown } from "./parser.js";

describe("parseMarkdown", () => {
  test("extracts frontmatter, title, tags, wikilinks", () => {
    const raw = `---
title: Project kickoff
tags: [work, startup]
priority: 2
---

# Passio kickoff

We plan to ship [[Week 3]] and integrate with [[Obsidian Vault|the vault]].
Also #planning and #milestones/week3.
`;
    const p = parseMarkdown("kickoff.md", raw);
    expect(p.title).toBe("Project kickoff");
    expect(p.frontmatter.priority).toBe(2);
    expect(p.tags.sort()).toEqual(["milestones/week3", "planning", "startup", "work"]);
    expect(p.wikiLinks.sort()).toEqual(["Obsidian Vault", "Week 3"]);
  });

  test("falls back to H1 / filename for title", () => {
    const a = parseMarkdown("note.md", "# From H1\nbody");
    expect(a.title).toBe("From H1");
    const b = parseMarkdown("2026-04-17.md", "no heading here");
    expect(b.title).toBe("2026-04-17");
  });

  test("handles multi-line list frontmatter", () => {
    const raw = `---
tags:
  - a
  - b
---
body`;
    const p = parseMarkdown("x.md", raw);
    expect(p.tags.sort()).toEqual(["a", "b"]);
  });

  test("ignores wikilink alias in target extraction", () => {
    const raw = `body [[Some Page|Display]] and [[Plain]]`;
    const p = parseMarkdown("x.md", raw);
    expect(p.wikiLinks.sort()).toEqual(["Plain", "Some Page"]);
  });
});

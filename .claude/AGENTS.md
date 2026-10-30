# Memory Compiler — Schema & Rules

> Este archivo define como el memory compiler transforma conversaciones en conocimiento estructurado.
> Inspirado en LLM Knowledge Bases de Karpathy, adaptado al Arbrain de su dueño.

## Architecture

```
Layer 1: daily/              (Source — immutable, append-only)
   └── YYYY-MM-DD.md         Session logs captured by hooks

Layer 2: knowledge/          (Compiled — LLM-owned)
   ├── index.md              Master catalog for retrieval
   ├── log.md                Build history
   ├── concepts/             Atomic knowledge pieces
   ├── connections/          Cross-cutting insights
   └── qa/                   Filed answers that compound

Layer 3: AGENTS.md           (This file — the schema)
```

## Compilation Rules

When compiling daily logs into knowledge articles:

1. Extract 0-7 durable, evidenced concepts per daily log. Zero is valid; never create filler to meet a quota.
2. For each concept, create or update an article in `knowledge/concepts/`
3. Identify non-obvious connections → `knowledge/connections/`
4. Update `knowledge/index.md` with new/changed articles
5. Append to `knowledge/log.md` with compilation entry
6. Use `[[wikilinks]]` for cross-references (Obsidian-compatible)
7. Link back to source: `[[daily/YYYY-MM-DD]]`

## Article Format: Concept

```markdown
---
title: "Concept Name"
date: YYYY-MM-DD
tags: [tag1, tag2]
sources: [[daily/YYYY-MM-DD]]
---

# Concept Name

One-sentence summary.

## Key Points

1. **Point one** — explanation with depth
2. **Point two** — explanation with depth
3. **Point three** — explanation with depth

## Detail

2+ paragraphs of explanation.

## Related

- [[other-concept]] — how they relate
- [[another-concept]] — how they relate

---
*Compiled from: [[daily/YYYY-MM-DD]]*
```

## Article Format: Connection

```markdown
---
title: "Connection: X and Y"
date: YYYY-MM-DD
tags: [tag1, tag2]
connects: [[concept-a]], [[concept-b]]
sources: [[daily/YYYY-MM-DD]]
---

# How X Relates to Y

Explanation of the non-obvious relationship.

## The Connection

Why these concepts matter together.

## Implications

What this means for decisions or strategy.

---
*Compiled from: [[daily/YYYY-MM-DD]]*
```

## Article Format: Q&A (Filed Answers)

```markdown
---
title: "Question summary"
date: YYYY-MM-DD
question: "The original question"
consulted: [[concept-a]], [[concept-b]]
---

# Question Summary

## Answer

The synthesized answer with citations.

## Sources Consulted

- [[concept-a]] — what was relevant
- [[concept-b]] — what was relevant

---
*Filed: YYYY-MM-DD*
```

## Index Format

```
| [[concepts/name]] | One-line summary | [[daily/YYYY-MM-DD]] | YYYY-MM-DD |
```

## Log Entry Format

```
## [YYYY-MM-DD] Compilation | Brief summary
- Created: [[concepts/new-one]], [[concepts/new-two]]
- Updated: [[concepts/existing]]
- Connections: [[connections/x-and-y]]
```

## Naming Conventions

- Lowercase, hyphens, no spaces: `async-patterns.md`
- Obsidian `[[wikilinks]]` without `.md` extension
- Concepts: noun-based (`market-positioning`, `rust-stack`)
- Connections: relationship-based (`energy-and-sovereignty`, `habits-and-productivity`)
- Q&A: question-based (`how-to-handle-churn`, `best-deployment-strategy`)

## Quality Standards

- YAML frontmatter required (title, date, tags, sources)
- 3-5 key points with depth
- 2+ paragraphs of explanation
- 2+ related concept links via [[wikilinks]]
- Source citations to [[daily/YYYY-MM-DD]]

## Context: Arbrain

This knowledge base serves the owner of this Arbrain installation. The domains are
whatever the owner talks about (personal, business, technical, strategic); the compiler
discovers them from the conversations instead of assuming them.

The memory/ folder contains curated knowledge. The knowledge/ folder contains
compiled insights from conversations. Both are searchable and interconnected.

## Scaling Notes

At 50-500 articles: index-guided retrieval outperforms vector similarity.
LLM reading structured markdown + index > cosine similarity search.
Beyond ~2,000 articles: consider adding hybrid RAG.

## Execution boundary

The compiler receives its schema and source explicitly. Its tools read the source/wiki and
write Markdown only under `.claude/knowledge/`; no Git, memory edits or external actions.
Use an explicit path for every tool. Forty turns is a ceiling for multi-article work, not
a target; group independent operations and finish index/log updates before returning.

Retrieval is incremental: search the source filename in index/log first to detect prior work,
then search topic terms and open matching articles. Never inject the full catalog plus title
inventory. Read index/log in windows of ≤120 lines; Grep uses head_limit ≤40. Preserve the
full catalog/history on disk, and use a unique Edit anchor rather than rewriting them.

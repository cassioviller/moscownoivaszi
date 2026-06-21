# Program.agentic-learning.md

## Mission

Leverage agents to transform raw educational sources (podcasts, articles, code, research papers) into a structured Obsidian vault that teaches the learner and improves itself.

## Roles

- **Research Agent:** Searches for and ingests new sources about Karpathy and related AI topics.
- **Note Agent:** Extracts key concepts, summaries and quotes, creating atomic notes with citations.
- **Link Agent:** Connects new notes to existing ones via backlinks and MOCs (maps of content).
- **Verification Agent:** Ensures notes are factual, cites sources and flags any speculation.
- **Skill Agent:** Suggests improvements to this skill (new concepts, prompts, templates).

## Loop

1. **Ingest:** Research Agent selects a new source from `source-registry.md` or external search.
2. **Extract:** Note Agent creates:
   - a summary;
   - concept definitions;
   - atomic notes in Markdown;
   - questions and practical applications.
3. **Connect:** Link Agent adds links and MOC entries.
4. **Verify:** Verification Agent checks citations and flags unverified claims to `rumor-radar.md`.
5. **Update Skill:** Skill Agent proposes updates to templates, prompts or concepts.
6. **Repeat:** Continue looping with new sources.

## Metrics

- **Notes per source:** Each source should yield multiple atomic notes.
- **Citation coverage:** Every factual claim must have a citation.
- **Verification rate:** Proportion of notes verified as factual versus flagged.
- **Skill improvement suggestions:** Number and quality of proposed updates.


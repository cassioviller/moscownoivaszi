---
name: karpathy-agentic-knowledge
description: >
  Curated, fact-checked knowledge base about Andrej Karpathy and the agentic-AI
  ideas he popularized. Use this skill whenever the user mentions Andrej Karpathy
  or asks about any of his concepts and coinages — Software 3.0, vibe coding,
  agentic engineering, "manifesting" code, AutoResearch, Program.md loops, token
  throughput / tokenmaxxing, the slopacolypse, jagged intelligence, the "decade
  of agents", the march-of-nines / self-driving reliability, AI psychosis, or
  Eureka Labs — even if they don't name him directly. Also use it when the user
  wants to design agentic workflows, write agent-native documentation, set up
  verification-first delegation, build an Obsidian-style knowledge vault, or
  turn articles/podcasts/papers into structured notes in the Karpathy style.
  Consult it before answering biographical or "what did Karpathy say about X"
  questions so the answer stays accurate rather than relying on memory.
version: '2.0.0'
---

# Karpathy Agentic Knowledge

A curated knowledge base about **Andrej Karpathy** — founding member of OpenAI,
former Director of AI at Tesla, founder of Eureka Labs, and (since May 2026) a
member of Anthropic's pre-training team — and the agentic-AI ideas he has
popularized. Use it to give accurate answers about him and his concepts, and to
apply his methods (verification-first delegation, agent-native docs, Program.md
loops) to the user's own work.

## When to use this skill

Trigger this skill when the user:
- Asks **who Karpathy is** or about his biography, career, or publications.
- Mentions any of **his concepts/coinages**: Software 3.0, vibe coding, agentic
  engineering, manifesting, AutoResearch, Program.md, token throughput,
  tokenmaxxing, slopacolypse, jagged intelligence, decade of agents, march of
  nines, AI psychosis, Eureka Labs, LLM101n, nanoGPT/nanochat, micrograd, llm.c.
- Wants help **designing an agentic workflow** or delegating work to agents.
- Wants to **write agent-native documentation** or set up **verification-first**
  task delegation.
- Wants to **build or maintain a knowledge vault** (Obsidian-style) or convert a
  source (article, podcast, paper, code release) into structured notes.

## How to use it

1. **Find the right resource first.** Match the user's question to a file in
   `resources/` (index below) and read it before answering. These notes are
   fact-checked; prefer them over recalling details from memory, especially for
   biography, dates, and direct claims attributed to Karpathy.
2. **Apply, don't just recite.** When the user is doing real work, pull the
   relevant template or prompt from `resources/templates/` or `resources/prompts/`
   and adapt it to their situation.
3. **Stay accurate.** State facts plainly when a resource supports them. Anything
   in `resources/rumor-radar/` is **unverified** — present it as speculation and
   say so. If the user asks about events after this vault was last updated, search
   the web rather than guessing.
4. **Keep the vault clean.** When adding notes, write atomic notes that summarize
   in your own words and link back to the original source. Never paste whole
   transcripts or articles.

## Operating philosophy (Karpathy's principles, applied)

1. **Context is code.** Under Software 3.0 the "program" is the context fed to
   the model — prompts, examples, instructions, memory, tools. Treat every note,
   template, and Program.md as part of the program the agent runs.
2. **Persistent notes are long-term memory.** Chat context is fleeting; durable
   markdown notes store concepts, decisions, prompts, and logs for reuse.
3. **Teach agents to teach.** Notes should not only store facts but show how to
   explain them at different levels and apply them in projects.
4. **Write agent-native documentation.** Structure docs for agents: objective,
   context, permissions, restrictions, success criteria, tests.
5. **Verification first.** Only delegate tasks that can be tested or verified.
   When evaluation is unclear, keep a human in the loop.
6. **Macro actions and loops.** Delegate whole features or research loops, not
   single lines. Describe them in Program.md files (plan → execute → test →
   improve).
7. **Human judgment remains essential.** Agents execute; humans set objectives,
   review outputs, ensure security, and decide what matters.
8. **Token throughput is a resource — but yield matters more.** Maximize *useful*
   tokens (inference yield), not raw consumption. Tokenmaxxing for its own sake
   rewards activity over outcomes.
9. **Avoid slop.** Karpathy warns 2026 brings a "slopacolypse" of low-quality AI
   output. Keep code and notes concise; favor simple, verifiable solutions.
10. **Never copy whole sources.** Extract summaries, concepts, prompts, and
    applications; always link back to the original.

## Resource index

**Background & facts**
- `resources/concepts/biography.md` — career timeline, education, current role.
- `resources/publications/scientific-publications-map.md` — papers and projects.
- `resources/source-registry.md` — trusted sources behind these notes.
- `resources/knowledge-map.md` — how the concepts connect.

**Concepts** (`resources/concepts/`)
- Software 3.0 & workflow shift → `ai-workflow-shift.md`
- Vibe coding vs agentic engineering, random notes → `random-notes-ai-coding.md`
- Token throughput → `token-throughput.md`; tokenmaxxing → `tokenmaxxing.md`
- Slopacolypse → `slopacolypse.md`; QA implications → `slopacolypse-qa.md`
- Decade of agents → `decade-of-agents.md`
- Self-driving / march of nines → `self-driving-unsolved.md`
- AI psychosis → `ai-psychosis.md`
- Eureka Labs / education → `eureka-labs.md`

**Doing the work**
- `resources/templates/` — macro-action, AutoResearch loop, verification-first
  checklist, agent-memory note, agent-native doc.
- `resources/prompts/` — extract knowledge from an article, generate a
  Program.md, improve this skill from a new source.
- `resources/programs/` — example Program.md (agentic learning loop).

**Currency & caution**
- `resources/research/` and `resources/recent-events/` — dated research logs;
  treat as a snapshot and verify time-sensitive claims.
- `resources/rumor-radar/` — unverified chatter; always flag as speculation.

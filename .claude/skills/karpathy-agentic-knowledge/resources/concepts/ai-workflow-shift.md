# AI Workflow Shift and Agentic Era

This note distills insights from the **AI Corner** article “The AI Workflow Shift Explained” (March 2026) and related commentary.

## Phase Shift and Manifesting

- **Phase shift:** December 2024 marked a sudden inflection where LLM coding capabilities became coherent enough to delegate entire tasks. Karpathy went from writing 80 % of code himself to delegating 80 % to agents within weeks.
- **Manifest, don’t code:** Karpathy argues that “coding” is no longer the right verb. Instead you “manifest” your intent by decomposing goals, delegating tasks to agents, reviewing outputs and iterating on instructions.

## Jagged Intelligence and Checkpoints

- LLM intelligence is **jagged**: models can act like brilliant PhD students in some domains and like 10‑year‑olds in others. Tasks with verifiable rewards (code, math) improve quickly while softer skills lag.
- Build **checkpoints** around jaggedness: design workflows that catch errors early and use tests and reviews to prevent compounding mistakes.

## AutoResearch and Superhuman Tuning

- **AutoResearch** agents can outperform decades of human intuition in hyperparameter tuning. Give agents objectives, a verifiable metric and boundaries, then remove yourself from the loop.

## Token Throughput

- Token throughput is the new resource; treat unused token budget like idle GPUs. Parallelise agents and tasks.

## API‑First Software

- Many apps should be replaced by APIs consumed by agents. Karpathy controls his entire home through an agent in WhatsApp, orchestrating lights, HVAC, pool and security.
- Build APIs first; write documentation for agents; assume your product will be consumed programmatically.

## Agent Personality

- Agent “personality” is a product decision. Claude is more calibrated and feels like a teammate, whereas Codex is dry. Calibrated feedback builds trust; flat affect reduces it.

## Documentation for Agents

- Stop writing HTML documentation for humans; instead create Markdown documents for agents with clear objectives, context, files, concepts, examples, errors and tests.

## Jevons Paradox and Open Source

- Cheaper code increases demand; more software will be built, unlocking new markets.
- Closed frontier models and open models will coexist: open models (the Linux of AI) will be months behind but widely used.

## Playbook for the Agentic Era

1. **Maximise token throughput.** Parallelise agents and tasks.
2. **Move in macro actions.** Delegate entire features, not functions.
3. **Write for agents first.** Documentation should target agents; humans can ask agents for explanations.
4. **Calibrate personality.** Agents that modulate feedback foster trust.
5. **Do only what agents cannot.** Focus on judgment, architecture and goals.


# Token Throughput

**Definition.** Token throughput refers to the rate at which an AI system consumes or processes tokens (units of text). In the agentic era, it becomes the new bottleneck and resource, analogous to GPU utilisation in deep learning. Karpathy emphasises maximising useful token throughput and feels nervous when he has unused token budget.

**Context.** With agentic tools like Claude Code, Codex and AutoResearch, engineers can run multiple agents in parallel. Each agent consumes tokens to plan, code and verify. Karpathy compares the new instinct to the old practice of keeping GPUs saturated: unused token quota implies wasted capacity.

**Guidelines.**

- **Maximise yield, not consumption.** Tokenmaxxing (maximising token usage) has become a status symbol, but articles warn that it can reward activity over outcomes and lead to waste and burnout. Focus on **inference yield**: the value delivered per token.
- **Run agents concurrently.** Parallelise independent tasks instead of serially waiting for one agent to finish.
- **Monitor budgets.** Track token usage and adjust agent behaviour to stay within budget while delivering results.
- **Switch tools smartly.** If one service’s quota is exhausted, switch to another (e.g., Codex to Claude) to maintain throughput.

**Related concepts.**

- **Macro actions** – Delegating larger tasks reduces overhead and increases token efficiency.
- **AutoResearch** – Agents can run long experiments autonomously, consuming many tokens to explore hyperparameter space.

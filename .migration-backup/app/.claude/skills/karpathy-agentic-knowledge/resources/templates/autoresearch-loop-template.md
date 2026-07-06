# AutoResearch Loop Template

Design loops for agents to improve models or processes through verifiable experiments.

- **Objective:** Define the performance metric to optimise (e.g., validation loss, bits‑per‑byte).
- **Initial setup:** Provide baseline code and configuration.
- **Modifiable parameters:** List hyperparameters or components the agent is allowed to change.
- **Constraints:** Limit training time or computational budget per iteration.
- **Metric:** Specify how to measure improvement (e.g., drop in validation loss by at least 1%).
- **Iteration loop:**
  1. Run a training job with the current configuration for a fixed duration (e.g., 5 minutes).
  2. Measure the metric and record results.
  3. Compare to previous best; if improved, commit changes.
  4. Generate a `program.md` update summarising what changed and results.
- **Stop condition:** When improvements plateau or budget is exhausted.
- **Logging:** Record experiments in a research log with graphs and notes.


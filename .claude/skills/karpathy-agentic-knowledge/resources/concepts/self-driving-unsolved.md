# Self‑Driving Is Not Yet Solved

## Karpathy’s Perspective

In an October 2025 interview with **Dwarkesh Patel**, Karpathy reflected on his five years leading Tesla’s Autopilot vision team. He pushed back against claims that self‑driving is nearly solved. Instead, he argued that progress is a **march of nines**: moving from a demo that works 90 % of the time to 99.9 % or 99.999 % reliability requires repeating cycles of improvement and handling countless edge cases. Each additional “nine” takes roughly the same amount of work as the last.

## Demo vs Product

Karpathy explained that demos are deceptive; seeing a self‑driving car successfully navigate a route does not mean the technology is ready for widespread deployment. Turning a demo into a robust product involves tackling rare corner cases, ensuring safety across different environments and dealing with regulatory and economic constraints. He noted that even companies like Waymo employ remote teleoperators, indicating that human oversight remains necessary.

## Implications for AI Agents

The march‑of‑nines paradigm applies beyond self‑driving. In software engineering, especially in safety‑critical domains, reliability demands similar diligence. **Vibe coding** and early agentic workflows can tolerate mistakes when building prototypes, but production systems—whether autonomous vehicles or mission‑critical software—require rigorous testing, verifiability and human supervision.

## Guidance for Practitioners

- Don’t be impressed by demos alone; evaluate AI systems based on real‑world performance and reliability metrics.
- Expect progress to be gradual; each improvement in reliability requires significant effort.
- Maintain human oversight and build autonomy sliders into systems, gradually increasing agent independence as reliability improves.
- Apply the **verification‑first** principle: design tasks and programs so that agent outputs can be objectively tested before deployment.

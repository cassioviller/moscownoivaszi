# Research Log – 26 May 2026

This log records the additional research performed to expand the skill beyond the initial version.

## Summary

On 26 May 2026 we gathered new information from articles, blogs and gists to enrich the skill. Key additions include:

- **Random notes from Claude coding (January 2026)** – A GitHub gist captures Karpathy’s reflections after using Claude Code extensively. He notes that he rapidly shifted from 80 % manual coding to 80 % agent coding, warns that agents often make wrong assumptions and over‑engineer solutions, celebrates agents’ relentless stamina, and predicts a “slopacolypse” of low‑quality AI output in 2026. He also observes that his manual coding skills are atrophying and poses questions about how engineering productivity will change.

- **AI Corner article “The AI Workflow Shift Explained” (March 2026)** – This Substack article analyses Karpathy’s workflow. It reports that December 2024 marked a phase shift when he delegated most coding to agents. Karpathy suggests replacing “coding” with “manifesting” because the work now involves decomposing goals, assigning tasks to agents, reviewing outputs and iterating on instructions. He emphasises the jaggedness of LLM intelligence, describes how AutoResearch outperformed his two decades of intuition in tuning nanoGPT, and advocates viewing token throughput like GPU utilisation. The article also argues that apps should become APIs consumed by agents, that agent personality is a product decision, that documentation must be written for agents, that cheaper code increases demand (Jevons paradox) and that open models will coexist with frontier models.

- **AOL/Business Insider summary of tokenmaxxing (March 2026)** – In a “No Priors” podcast, Karpathy said he feels nervous when he has unused AI token budget and switches between Codex and Claude to maximise his token throughput. The article explains that tokens are units of AI usage and that some tech companies encourage “tokenmaxxing,” leading to high token consumption and new performance metrics. The shift makes token usage a resource to manage.

- **Eureka Labs announcement (July 2024)** – A CDO Magazine article reports that Karpathy announced his AI‑native education startup, Eureka Labs, which aims to combine teacher expertise with AI guidance. The first product will be **LLM101n**, enabling students to train their own AI models. He envisions expanding education’s reach and extent through “teacher + AI symbiosis”.

- **Axios article (May 19 2026)** – Confirms that Karpathy joined Anthropic’s pre‑training team, will form a team to use Claude to accelerate research, and described himself as being in a state of “AI psychosis” since December while practicing tokenmaxxing. It reiterates his passion for education and his career timeline.

- **Built In article on tokenmaxxing (April 22 2026)** – Provides background on tokenmaxxing: it is a workplace trend where AI usage becomes a status symbol, encouraging employees to consume as many tokens as possible. The article notes that this can lead to burnout and waste.

## Integration into the Skill

- The **concept of token throughput** has been added to the `token-throughput.md` note, emphasising tokens as a new resource and summarising tokenmaxxing critiques.
- A **slopacolypse** note summarises the prediction of 2026 as a year of low‑quality AI output and encourages best practices to avoid contributing to it.
- A **random-notes-ai-coding** note captures the categories from Karpathy’s January 2026 notes (workflow shift, mistakes, tenacity, speedups, leverage, fun, atrophy, slopacolypse, questions).
- An **ai-workflow-shift.md** note summarises the key takeaways from the AI Corner article.
- A **eureka-labs.md** note summarises Karpathy’s education venture.
- A **tokenmaxxing.md** note summarises the tokenmaxxing trend and its criticisms.
- The **source registry** has been updated with these new sources.

### Additional research (second pass)

The following research was conducted to further expand the skill:

- **Slopacolypse and verification bottleneck** – A Medium article titled “The Slopacolypse Is Coming” reports that Karpathy now delegates about **80 %** of his coding to AI agents and effectively programs in English. The article warns that the bottleneck has shifted from building software to verifying it. Traditional QA scripts break when agent‑generated code changes rapidly, so testing must evolve into a cognitive core that validates intent, filters slop and heals itself. A new concept note summarises these findings.
- **AI psychosis** – Articles on Vellum.ai and Panews describe how Karpathy hasn’t written code since December 2025, spends up to **16 hours a day** orchestrating agent swarms and feels anxious when he has unused tokens. He jokingly calls this state “AI psychosis.” The research log now includes a concept note exploring symptoms, causes, concerns and recommendations for avoiding burnout.
- **Decade of agents** – In a June 2025 talk at AI Startup School, Karpathy cautioned that 2025 is not the year of agents but the **decade of agents**; building reliable agent systems will take years. He emphasised the need for agent‑friendly interfaces, an autonomy slider and long‑term infrastructure. A concept note summarises these points and their implications.
- **Self‑driving is not solved** – In an interview with Dwarkesh Patel, Karpathy explained that self‑driving progress is a **march of nines**: each additional nine (e.g., 99 % → 99.9 %) requires comparable effort. Demos can be deceptive; making self‑driving cars reliable demands extensive engineering and human oversight. A concept note outlines these insights and links them to verification and agentic workflows.
- **Biography research** – The biography page on Karpathy.ai provides details about his education (UBC, University of Toronto, Stanford), his role as a founding member of OpenAI, his tenure as Tesla’s Director of AI and Autopilot vision, his return to OpenAI in 2023, his teaching of CS231n, and his move to Anthropic in 2026. A biography note summarises these facts.
- **Scientific publications** – Abstracts of early research papers were reviewed: **Deep Visual–Semantic Alignments** introduced a CNN–RNN model for image captioning; **Visualizing and Understanding Recurrent Networks** revealed interpretable LSTM cells that track long‑range structures; **DenseCap** proposed dense captioning with a fully convolutional localization network; **PixelCNN++** improved PixelCNNs using discretised logistic mixture likelihood and whole‑pixel conditioning. The publication map has been updated with citations.


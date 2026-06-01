# Karpathy Publication Map

This map lists notable academic and technical works by Andrej Karpathy with brief summaries. It is not exhaustive but covers influential papers and projects.

| Year | Work | Summary |
|-----|------|---------|
| 2014 | **Deep Visual–Semantic Alignments for Generating Image Descriptions** | Introduced a model that learns correspondences between images and sentences by pairing a convolutional neural network over image regions with a bidirectional recurrent neural network over words. A structured objective aligns the two modalities and a multimodal RNN generates novel descriptions. This work provided a foundation for modern image‑captioning systems.
| 2015 | **Visualizing and Understanding Recurrent Networks** | Examined the internal dynamics of character‑level RNNs and LSTMs by visualising hidden‑state activations. The authors discovered interpretable cells that track long‑range structures such as line lengths, quotes, brackets and indentation, illustrating how these networks store context over hundreds of timesteps.
| 2015 | **DenseCap** | Introduced **dense captioning**, which jointly localises regions and generates descriptions. The **Fully Convolutional Localization Network (FCLN)** processes an image in a single pass to produce region proposals and corresponding natural‑language descriptions, enabling real‑time dense captioning and outperforming previous approaches on the Visual Genome dataset.
| 2016 | **World of Bits** | Created a reinforcement learning benchmark where agents interact with web browsers using raw pixels and DOM actions. Demonstrated end‑to‑end learning of web tasks.
| 2020 | **PixelCNN++** (co‑author) | Improved PixelCNN generative models by replacing the softmax likelihood with a discretised logistic mixture distribution and conditioning on entire pixels instead of channels. Additional modifications such as downsampling, shortcut connections and dropout simplify the model and improve sample quality.
| 2024 | **Micrograd** | Wrote a tiny autograd engine in ~60 lines of Python for educational purposes, illustrating reverse‑mode automatic differentiation.
| 2024 | **NanoGPT** / **NanoChat** | Released minimal training and chat harnesses for GPT‑like models that fit in a single GPU memory, enabling hobbyists to train their own language models.
| 2025 | **LLM101n** (Eureka Labs) | Developed an undergraduate‑level course that teaches students to train their own AI models; integrates teacher instruction with an AI assistant.
| 2025–2026 | **AutoResearch** | Released a 630‑line tool that combines an LLM agent with a training loop to automatically tune hyperparameters for LLMs. Researchers edit `program.md` files rather than Python code, letting agents iterate and measure improvements.

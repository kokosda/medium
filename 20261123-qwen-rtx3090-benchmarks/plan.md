# Article plan

Working title: Why the Same Qwen Quant Ran at 46 and 109 Tokens per Second

Reader promise: Explain why a quant label and a GPU count cannot predict this machine's generation speed, using measured comparisons and enough configuration detail to reproduce the questions.

1. Open with the same Flash Next Q4 model at 46.35, 108.75, then 51.29 tokens/s as clock policy changes. Establish the practical problem before defining quantization.
2. Introduce the three RTX 3090 workstation, exact C# LRU prompt, and the distinction between allocated context and occupied context. Link the complete workbook.
3. Show the clock A/B/A experiment with run counts, ranges, output caps, and mixed completion lengths. Explain the inference and its limits.
4. Show the controlled 512-token Flash Q2 GPU-scaling probes. Tie the finding to the pinned Windows llamAmpere build and its documented single-GPU fast-path assumptions.
5. Explain model verification versus MTP drafting with an original diagram. Compare shared and dedicated draft placement using the same dense Q4/context cohort.
6. Present full-answer dense results in a table that keeps context and vendor visible. Keep native AI4 with different fine-tuned weights and KV format outside the quant comparison.
7. Explain failed native Flash attempts without assigning zero throughput or claiming universal incompatibility.
8. Provide the real server-launch pattern and a minimal streaming request example. Explain what a complete benchmark must additionally record.
9. End with a practical configuration-first decision process and the boundary of a single-prompt speed study.

Visual package: One original editorial illustration; two data-driven charts exported as PNG and SVG; one explanatory MTP diagram. Charts use recorded means and observed min–max ranges, not inferred confidence intervals. Full measurements, sanitized chart data, figure source, and workbook live beside the article.

Evidence rules: Never pool different engines, output caps, context sizes, KV formats, fine-tunes, or clock conditions into a leaderboard. The latest six dense full-answer rows have two measured repetitions and natural stops. Historical exploratory rows retain their own repetition counts. Generated reasoning counts toward output. No systematic answer-quality or code-correctness evaluation was performed.

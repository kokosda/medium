# Qwen RTX 3090 benchmark article

[Read the article](article.md) · [Download the Excel workbook](https://github.com/kokosda/medium/raw/refs/heads/main/20261123-qwen-rtx3090-benchmarks/Qwen3.8%20Benchmark.xlsx)

This folder accompanies an investigation of Qwen3.8 Dense and Flash Next generation speed on a Windows workstation with three RTX 3090s. Measurements were collected in November 2026. The article is a draft for Medium; it has not been published to Medium by this workflow.

## Evidence

- **Qwen3.8 Benchmark.xlsx** is the complete 101-record experiment workbook, including legacy Strata/llama.cpp work and 70 llamAmpere configurations. Read its Methodology sheet before comparing rows.
- **llamampere-results.csv** exports the 70 later records. It includes 45 measured cases and 25 cases without a completed throughput result. Absolute local evidence paths were removed for publication. The Experiment field identifies the case. Empty throughput means no completed measurement, not zero speed.
- **publication-data.json** contains the chart inputs. Its source paths resolve beneath **evidence/**. Means retain the recorded summary precision; min/max retain source precision.
- **evidence/** contains selected summaries used in the article, with local server addresses, model paths, profile paths, and log paths omitted. The summary measurements and completion counts are retained. These compact summaries are not the full raw token streams or telemetry archive.
- **evidence/clock/gpu-telemetry.csv** preserves the clock experiment's GPU telemetry, including clock readings, power, utilization, and PCIe link generation. The lock-start and lock-end files preserve phase boundary timestamps with timezone offsets. CSV timestamps use the machine's local time; summary JSON timestamps use UTC.
- **dense-q4-2plus1.ini** is the actual dense Q4 dedicated-MTP preset from the recorded run. Model paths are machine-specific; the referenced quant must be downloaded separately. MTP depth is 3 and p-min is 0. Device CUDA0 drafts while CUDA1 and CUDA2 run the main model. **dense-q4-shared-mtp.ini** retains the same main-model devices and moves the draft to CUDA1 for the shared comparison.

The remaining full raw request/response, server-log and telemetry archive stays local. There was no systematic code-correctness or answer-quality evaluation. Generated reasoning is included in completion tokens.

## Figures

Install Python and matplotlib, then run:

```text
python render_figures.py --data publication-data.json --out assets
```

The plotting source exports PNG and SVG versions of two measured charts and a conceptual MTP placement diagram. Whiskers are observed min–max ranges, not confidence intervals. The clock-policy comparison and GPU-scaling comparison use different engines and output caps and must not be pooled.

Figure and request-example checks use Node's built-in test runner and PowerShell 7. Run `node --test 20261123-qwen-rtx3090-benchmarks/render_figures.test.mjs` from the repository root. Set QWEN_FIGURES_PYTHON to your Python interpreter if needed. The final 15 checks passed before and after integration. The request example was syntax-checked; it was not sent to a model during article preparation.

The hero illustration was generated with the built-in image-generation tool. It is editorial artwork, not a hardware wiring or PCIe diagram. The exact prompt is in **image-prompts.txt**. The scientific charts are generated from recorded data with matplotlib.

## Requests

**request-example.ps1** is a minimal streaming request example for an already-running compatible server. It uses the article's exact prompt, temperature 0, seed 42, and an 8,192-token output ceiling. It does not collect a complete benchmark result or configure GPU placement. Choose a Model alias that exists in your own loaded preset.

The study used a separate timing collector that excluded warmup, checked completion, saved raw streams, and sampled GPU telemetry. The example is provided to reproduce the workload, not as a replacement for that collector.

## Version boundary

The GPU-scaling results concern llamAmpere v0.7.2.1, Windows CUDA12 build 15466, commit 857ccba7d. They do not claim that a newer build or Linux will behave the same way. Original-weights dense F16 KV tests, native AI4 fine-tuned weights with SJ-KVaRN4, and legacy Strata clock diagnostics are separate cohorts.

# Why the Same Qwen Quant Ran at 46 and 109 Tokens per Second

Three RTX 3090s, one C# prompt, and several opportunities to blame the wrong thing.

![An engineer inspecting three graphics cards and a clock mechanism](assets/hero.png)

I started with a straightforward question: how much generation speed would I gain by moving below Q8, the eight-bit weight-quantization class?

Then the same Q4 model, using a four-bit-class weight quantization, produced **46 tokens per second in one configuration and 109 in another**. Returning to automatic clocks brought it back to 51.

The weights had not changed. The quant label had not changed. The clock policy had.

That result changed the question. Before comparing smaller quants, I needed to understand what the machine was actually doing with them. A quantization comparison had turned into a small hardware detective story.

Quantization stores model weights at reduced numerical precision. That can make a model easier to fit in memory. Labels such as Q2, Q4, and Q8 describe precision classes, not the number of model parameters. A file can mix precisions and include storage overhead, so its label is not an exact average number of bits per weight. The speed you get still depends on how the inference engine executes it, where the data lives, and what the hardware is doing.

I tested Qwen3.8-27B Dense and Flash Next under Strata and llama.cpp, then repeated selected workloads with llamAmpere. Some configurations finished comfortably. Others ran slower with more GPUs. Several never produced a completed measurement. Somewhere along the way, I also had to find out whether the third GPU was helping or just making the configuration file longer.

This article focuses on the Strata clock diagnostic and the later llamAmpere comparisons that taught me the most. The [benchmark workbook](https://github.com/kokosda/medium/raw/refs/heads/main/20261123-qwen-rtx3090-benchmarks/Qwen3.8%20Benchmark.xlsx) contains the wider record: 101 experiment records, including exploratory runs and failed attempts. It is a record of configurations, not 101 interchangeable samples.

## One machine and one deliberately ordinary prompt

The workstation has a Threadripper PRO 5955WX, 128 GB of RAM, and three RTX 3090s with 24 GB each. For the controlled tests discussed here, the GPU power limit was 300 W per card.

The prompt was always:

> Write a C# implementation of an LRU cache. Explain the time complexity of each operation.

It asks for code and an explanation, which makes it useful for observing sustained generation. It also gives this study a clear boundary: I measured one coding task, not a representative collection of workloads.

An LRU cache combines a lookup structure with an ordering structure. I did **not** systematically compile the generated C#, test its eviction behavior, or score the explanations. A faster answer in these tables is not evidence of a better implementation.

Here are the conditions readers need before looking at the numbers.

| Setting | How I used it |
|---|---|
| Requests | One at a time |
| Sampling | Temperature 0, seed 42 |
| Target context capacity | 256K tokens |
| KV cache | F16 (16-bit floating point) for the controlled comparisons |
| Warmup | One excluded request per case |
| Repetitions | Actual measured count shown for each comparison |
| Full-answer output limit | 8,192 generated tokens |
| Short scaling probes | 512 generated tokens |
| Clock diagnostic output limit | 4,096 generated tokens |

In context capacities, **K means 1,024 tokens**, so 256K means 256 × 1,024. Speeds are rounded to whole tokens/s for readability; the downloadable data keeps the original precision.

The **KV cache**, short for key-value cache, stores intermediate attention data from earlier tokens so the model can reuse it as the conversation grows. **F16** stores those values as 16-bit floating-point numbers. The cache has its own memory budget and storage format, separate from the model weights.

Context capacity and output limit are different settings. A 256K-token context does not mean that this short prompt filled 256K tokens. It sets the capacity available to the server, and that allocation can affect which configurations fit in memory.

The output limit is an artificial ceiling on generation. A 512-token probe deliberately stops early; it is not a completed LRU explanation. The generated-token count includes reasoning as well as the visible answer.

For llamAmpere, I used the server's `timings.predicted_per_second` and averaged completed measured requests after excluding warmup. The older Strata clock experiment used its engine-log aggregate. Both describe decoding, but I keep the two engines in separate comparisons. Neither number is the total end-to-end request rate including prompt processing.

**MTP means multi-token prediction.** A draft component proposes upcoming tokens, and the main model checks them. Draft depth is how many tokens it tries ahead in a round; adaptive depth changes that number while running. The controlled dense llamAmpere cases used the same external Q8 MTP file at depth 3. Flash Next used the vendor Q2 draft with adaptive depth 3–4, with expert skipping off. Both set the draft probability threshold (`p-min`) to 0.

The build's default **mode-biased MTP** also remained enabled. This changes the draft-acceptance policy and can change the output compared with exact sampling. It is another reason these are configuration-speed results, with answer quality still to be evaluated. [The pinned speculative-decoding documentation](https://github.com/JakeATX/llamAmpere/blob/v0.7.2.1/docs/speculative.md) describes these settings.

## The clock experiment that changed the investigation

The first useful surprise came from Flash Next with Unsloth's `UD-Q4_K_XL` weights under Strata. This is a four-bit-class **Unsloth Dynamic** recipe: it assigns different precisions to different parts of the model. `K` refers to the block-based K-quant family, and `XL` identifies this particular vendor recipe. The model's parameter count stays the same. [Unsloth describes its dynamic quantization approach here](https://unsloth.ai/docs/basics/dynamic-3.0-ggufs).

The model stayed loaded across three GPUs, with the same 300 W limit, F16 KV cache, and 256K-token context capacity.

I tested three phases: automatic clocks, constrained clocks, then automatic clocks again.

In the **automatic phase**, NVIDIA's normal clock management chose the GPU's operating speeds. In the **locked phase**, I explicitly constrained the GPU core-clock range and memory clocks, then measured again. A clock is the rate at which the core or memory operates. The power limit stayed at 300 W per card throughout; setting a power limit and setting clocks are separate controls.

“Locked” is shorthand here for a constrained clock policy, not a claim that every core ran at one unchanging frequency. After that middle phase, I removed the clock limits and restored automatic management. The model stayed loaded through the experiment.

![Clock policy experiment showing 46, 109, and 51 tokens per second](assets/clock-policy.png)

*Whiskers show the observed minimum and maximum, not confidence intervals. Each phase excluded one warmup. All phases used a 4,096-token output ceiling; completion lengths differed.*

| Clock policy | Mean tokens/s | Observed range | Measured runs | Runs reaching output limit |
|---|---:|---:|---:|---:|
| Automatic | 46 | 45–48 | 2 | 2 of 2 |
| Locked | 109 | 108–110 | 2 | 1 of 2 |
| Automatic again | 51 | 51 | 1 | 0 of 1 |

The locked phase was **more than twice as fast** as the first automatic phase. Returning to automatic clocks moved the rate back toward the original slower state.

That is useful evidence that clock state mattered in this configuration. It does not identify how much came from memory clocks, core clocks, power-state transitions, or their interaction. I did not independently vary each of those factors.

It is also a small experiment. The return phase has one measured request, and the generated responses were not identical lengths. Treat it as a strong diagnostic observation rather than a universal speed multiplier.

The practical lesson is easy to miss when a quant name is the largest label in a spreadsheet: check the operating state before blaming the weights. A Q4 result can include the cost of a particular clock policy, placement strategy, and execution path.

The [clock telemetry and phase markers](https://github.com/kokosda/medium/tree/main/20261123-qwen-rtx3090-benchmarks/evidence/clock) are included with the article data.

The later llamAmpere results below used automatic clocks. I did not carry the clock lock into those comparisons.

## When the third GPU made things worse

Next came a result that looks backward if you expect every additional GPU to help.

I ran the same Flash Next ISTA-DASLab `GSQ-RCO Q2_0` quant on one, two, and three GPUs. This is a two-bit-class, mixed-precision weight build. GSQ is the method used to quantize the weight arrays; RCO chooses their precision under a size budget. The publisher reports an average of **2.4 bits per transformer weight** for this variant, which shows why the “Q2” label is shorthand rather than an exact whole-file measurement. [The model card explains the recipe](https://huggingface.co/ISTA-DASLab/Qwen3.8-Flash-Next-GSQ-RCO-GGUF).

These were short, deliberately capped 512-token probes, all with F16 KV, 256K-token context capacity, and two measured requests after warmup.

![Flash Next Q2 scaling probe showing lower generation rate as GPU count increases](assets/flash-gpu-scaling.png)

*llamAmpere v0.7.2.1, Windows CUDA12 build 15466, commit 857ccba7d. Multi-GPU runs used layer splitting; the MTP draft followed the model devices. Every measured probe reached its 512-token ceiling.*

| GPUs | Mean tokens/s | Measured runs |
|---|---:|---:|
| 1 GPU with MTP shared | 76 | 2 |
| 2 GPUs with MTP following model devices | 44 | 2 |
| 3 GPUs with MTP following model devices | 14 | 2 |

The one-GPU configuration was about 5.5 times as fast as the three-GPU configuration in this probe. My three-card setup had just lost a race to one of its own cards.

That does not establish that Flash Next generally scales backward. It tells me that this quant, placement, workload, and pinned Windows build did.

There is a useful clue in the project's own [Flash Next launcher at v0.7.2.1](https://github.com/JakeATX/llamAmpere/blob/v0.7.2.1/scripts/flash-next-server.sh). It defaults to one GPU and describes the device-side expert-table path as single-GPU, with multi-GPU operation experimental. It also warns about very slow behavior when host-memory headroom is insufficient.

Those restrictions matter for a **mixture-of-experts model**: it routes each token to a selection of specialist parameter blocks called experts. A dense model uses the same core network for each token. The execution path has to make the relevant expert weights available as tokens are generated. Adding devices can change how that work is placed and moved, rather than simply dividing identical work into equal pieces.

My measurements do not isolate transfer time or prove that paging caused the three-GPU slowdown. The source explains why a simple GPU-count expectation is unsafe here; it is not a profiler trace of these requests.

A separate full-answer run of this Q2 configuration on one GPU averaged **74 tokens/s**, with two measured responses. That is reassuringly close to its short-probe rate, but it remains a separate measurement with an 8,192-token ceiling.

## A draft GPU still has to earn its place

A spare GPU suggests an obvious promotion: make it the draft specialist. I tried that too, leaving the main dense model on two GPUs and dedicating the third to MTP.

MTP supplies draft token proposals that the main model verifies. A separate draft device changes where that work happens; it does not remove verification or guarantee an overall speedup.

![Conceptual comparison of a dedicated MTP GPU and shared draft placement](assets/mtp-placement.png)

*Conceptual placement diagram. Arrows show proposals and verification, not measured transfer rates or the workstation's PCIe topology.*

The cleanest full-answer comparison here used ggml-org's dense `Q4_K_M`. The label has the charm of a Wi-Fi password. Its useful meaning is a mostly four-bit, block-based weight quantization. `K` names the K-quant family and `M` means the medium variant, which keeps selected weight arrays at higher precision. It is a mixed-precision recipe rather than a promise that every weight occupies four bits. [The quantizer's selection rules show this distinction](https://github.com/ggml-org/llama.cpp/blob/master/src/llama-quant.cpp).

Both cases used the same external Q8 MTP file, the same F16 KV format, and the same 256K-token context capacity.

| Vendor | Quant | GPU arrangement | Mean tokens/s | Measured runs |
|---|---|---|---:|---:|
| ggml-org | Q4_K_M (mixed 4-bit) | 2 GPUs with MTP shared | 48 | 2 |
| ggml-org | Q4_K_M (mixed 4-bit) | 2 model GPUs + 1 MTP GPU | 46 | 2 |

The main model stayed on CUDA1 and CUDA2. In the shared case, MTP used CUDA1; in the dedicated case, it used CUDA0.

Both configurations completed naturally, averaging 7,460 generated tokens per request. Using the unrounded measurements, sharing MTP on the two cards was about 5.4% faster in this comparison. The third card had acquired a job title without improving the department's output.

I can measure the total effect of that placement choice. I cannot assign the difference to communication overhead, draft scheduling, or verification cost without further profiling. The dedicated draft GPU was a hypothesis worth testing, and this pair did not reward it.

## Smaller dense quants changed what fit

The dense model produced a more familiar tradeoff: lower quants could fit on one card, but preserving the full context capacity was not always possible.

The table below contains six full-answer configurations from the resumed tests. Each excluded one warmup, measured two requests, and stopped naturally before the 8,192-token ceiling. Power limits were 300 W and clocks were automatic.

| Vendor | Dense quant | GPUs | Context capacity | Mean tokens/s | Measured runs |
|---|---|---|---:|---:|---:|
| Unsloth | UD-Q2_K_XL (dynamic 2-bit class) | 1 GPU, MTP shared | 128K | 83 | 2 |
| Unsloth | UD-Q3_K_XL (dynamic 3-bit class) | 1 GPU, MTP shared | 128K | 80 | 2 |
| Unsloth | UD-Q5_K_XL (dynamic 5-bit class) | 1 GPU, MTP shared | 32K | 71 | 2 |
| ggml-org | Q4_K_M (mixed 4-bit) | 1 GPU, MTP shared | 64K | 76 | 2 |
| ggml-org | Q4_K_M (mixed 4-bit) | 2 GPUs, MTP shared | 256K | 48 | 2 |
| ggml-org | Q4_K_M (mixed 4-bit) | 2 model GPUs + 1 MTP GPU | 256K | 46 | 2 |

This is where an attractive leaderboard would mislead me. A faster 64K configuration does not get to borrow a 256K badge.

The 76-token/s one-GPU Q4 run used a quarter of the context capacity of the 48-token/s two-GPU run. The one-GPU Q4 attempts at 256K and 128K failed with out-of-memory errors before I reduced the capacity to 64K.

If you need 256K tokens available, the faster 64K-token configuration does not meet your requirement. If your workload fits the smaller capacity, its speed is relevant. The useful choice depends on the constraint you actually have.

The same care applies to quant labels. `UD-Q4_K_XL`, Unsloth's dynamic four-bit-class recipe, and `Q4_K_M`, the medium mixed-precision K-quant recipe, identify different quantization variants. A shared “Q4” prefix does not make them identical weight files or interchangeable benchmark subjects.

For reference, my dense ggml-org baseline used `Q8_0`, the standard eight-bit weight quantization. At 256K context with two model GPUs plus a dedicated MTP GPU, it averaged **47 tokens/s** across two measured requests. That is close to the Q4 dedicated-draft result above. Reducing the nominal bit width did not automatically improve that particular deployment.

## The fastest dense number had different conditions

There was also a **105-token/s** full-answer result on one GPU at 256K context.

It came from jakeatx's native dense preset for the **Swift1.5 Uncensored** variant. **AI4** names its custom four-bit-class weight format. The preset also used built-in adaptive MTP and **SJ-KVaRN4** KV storage. Two measured requests completed naturally.

**SJ-KVaRN4 is a compression scheme for the attention cache.** It describes how the stored attention data is represented, independently of the AI4 weight format. The “4” refers to the four-bit representation used for the older, compressed cache entries, compared with the 16-bit values in F16.

That does not make the entire cache exactly four times smaller. The format includes metadata and uses different storage for the initial tokens and the recent-token window. The conversion is lossy, so it can also affect the model's output. [The pinned cache-format documentation](https://github.com/JakeATX/llamAmpere/blob/v0.7.2.1/docs/KV-cache-quantization.md#hybrid-sj-kvarn44-with-tq6-staging) explains the layout.

For this benchmark, the consequence is practical: cache compression changes the memory footprint and the attention computation alongside the weight format. I did not isolate its contribution, so I cannot attribute the 105-token/s result to SJ-KVaRN4 alone.

That is an interesting configuration result. It changes the fine-tuned weights, quant format, KV format, and drafting setup at once. Putting it at the top of an original-weights Q8-to-Q2 chart would conceal exactly the conditions that might explain its performance.

It belongs in the workbook and deserves its own follow-up comparison, including answer quality. It cannot settle which quant of the original dense model is best.

## Failed attempts belong in the record

The native Flash **AI3** (custom three-bit-class weights) and **AI4** (custom four-bit-class weights) paths did not give me completed controlled throughput measurements in the one-to-three-GPU probes. Several requests reached the 240-second deadline. The deadline was the one part of those attempts that performed exactly as configured.

I kept those attempts as failures or timeouts. Assigning them zero tokens/s would imply a completed measurement that never happened.

Logs showed mapped-registration failures, a 1 GiB staging cap, and missing device expert tables in relevant attempts. The pinned source gives those messages useful context: [`pin_supported()` returns false on Windows](https://github.com/JakeATX/llamAmpere/blob/v0.7.2.1/src/llama-moe-arena.cpp), and the full pinned-arena constructor also rejects Windows. A [private writable fallback remap](https://github.com/JakeATX/llamAmpere/blob/v0.7.2.1/src/llama-model-loader.cpp) is guarded for Linux.

Those are limitations of the version and path I tested. They do not prove that the model family is unusable on Windows or that a later build behaves the same way.

## The top ten configurations

I ranked the workbook's 300 W-per-card results by **context capacity first, then generation speed**, both from highest to lowest. Each entry below has two measured requests. For the repeated Flash Next Q8 baseline, I kept the later control run. All ten entries land at **256K** because capacity takes priority in this ordering. The smaller-context results remain in the dense table above.

One additional label appears here: `UD-IQ4_XS` is an Unsloth Dynamic variant using a compact, nonlinear four-bit weight encoding. “Nonlinear” means its representable values are unevenly spaced. The [quantizer's format list](https://github.com/ggml-org/llama.cpp/blob/master/tools/quantize/quantize.cpp) distinguishes it from the K-quant recipes.

| Rank | Context | Tokens/s | Model and weight format | Vendor | GPUs |
|---:|---:|---:|---|---|---|
| 1 | 256K | **121** | Flash Next · UD-Q4_K_XL (dynamic 4-bit) | Unsloth | 2 GPUs, MTP shared |
| 2 | 256K | **118** | Flash Next · UD-IQ4_XS (nonlinear 4-bit) | Unsloth | 3 GPUs, MTP shared |
| 3 | 256K | **109** | Flash Next · UD-Q4_K_XL (dynamic 4-bit) | Unsloth | 3 GPUs, MTP shared |
| 4 | 256K | **105** | Dense Swift · AI4 (custom 4-bit) | jakeatx | 1 GPU, built-in MTP |
| 5 | 256K | **99** | Dense Swift · AI4 (custom 4-bit) | jakeatx | 1 GPU, built-in MTP |
| 6 | 256K | **95** | Dense Swift · AI4 (custom 4-bit) | jakeatx | 2 GPUs, MTP shared |
| 7 | 256K | **92** | Flash Next · Q8_0 (8-bit) | Unsloth | 3 GPUs, MTP shared |
| 8 | 256K | **85** | Dense · UD-Q4_K_XL (dynamic 4-bit) | Unsloth | 2 model GPUs + 1 MTP GPU |
| 9 | 256K | **83** | Flash Next · UD-Q4_K_XL (dynamic 4-bit) | Unsloth | 1 GPU, MTP shared |
| 10 | 256K | **81** | Dense · UD-Q2_K_XL (dynamic 2-bit) | Unsloth | 2 model GPUs + 1 MTP GPU |

The settings deserve a place beside the scores. These rows mix completed answers, deliberately short probes, and clock diagnostics. “Dense Swift” is the Swift1.5 Uncensored variant with SJ-KVaRN4 cache storage; the other entries use F16 KV. The two-GPU native AI4 probe also overlapped a restricted background download, as recorded in the workbook.

| Rank | Engine | Clocks | Output cap | What finished |
|---:|---|---|---:|---|
| 1 | Strata | Automatic | 4,096 | One natural stop, one capped |
| 2 | Strata | Locked | 8,192 | Both stopped naturally |
| 3 | Strata | Locked | 4,096 | One natural stop, one capped |
| 4 | llamAmpere | Automatic | 8,192 | Both stopped naturally |
| 5 | llamAmpere | Automatic | 512 | Both short probes capped |
| 6 | llamAmpere | Automatic | 512 | Both short probes capped |
| 7 | Strata | Automatic | 8,192 | Both stopped naturally |
| 8 | llama.cpp | Automatic | 8,192 | Both stopped naturally |
| 9 | Strata | Automatic | 4,096 | Both capped |
| 10 | llama.cpp | Automatic | 8,192 | Both capped during reasoning |

That last row is a useful speed measurement with an unfinished task attached: it never reached the visible C# answer within the output budget. The table ranks recorded throughput, while usefulness still depends on getting an answer you can use. [The ranking data](https://github.com/kokosda/medium/blob/main/20261123-qwen-rtx3090-benchmarks/top-10-results.csv) preserves the original precision, workbook record IDs, and source references. The ordering uses those original values before rounding.

## Reproduce the question before comparing the answer

The full measurement archive contains request JSON, streamed output, server logs, summaries, and GPU telemetry. The [public article folder](https://github.com/kokosda/medium/tree/main/20261123-qwen-rtx3090-benchmarks) includes the workbook, the data behind the figures, and the figure-rendering source.

My launch pattern started by setting the power limit on each participating card:

```powershell
$watts = 300
$gpuIds = @(0, 1, 2)

foreach ($gpuId in $gpuIds) {
    nvidia-smi -i $gpuId -pl $watts
}

nvidia-smi --query-gpu=index,name,power.limit,power.draw --format=csv
```

My original installed llama.cpp router launch looked like this:

```powershell
llama serve --models-preset "D:\LLM\Models\models.ini" --host 127.0.0.1 --port 8080
```

The later tables use the pinned llamAmpere binary identified above. To reproduce those results, select that build explicitly and use the recorded preset; the installed `llama` command alone does not identify an engine build.

For example, these settings from the recorded dense Q4 dedicated-draft preset put the main model on CUDA1 and CUDA2 and drafting on CUDA0:

```ini
device = CUDA1,CUDA2
split-mode = tensor
tensor-split = 1,1
ctx-size = 262144
parallel = 1
cache-type-k = f16
cache-type-v = f16
fit = off
spec-type = draft-mtp
spec-draft-model = D:/LLM/Models/mtp-Qwen3.8-27B-Q8_0.gguf
spec-draft-device = CUDA0
spec-draft-n-max = 3
spec-draft-p-min = 0.0
```

The [complete recorded preset](https://github.com/kokosda/medium/blob/main/20261123-qwen-rtx3090-benchmarks/dense-q4-2plus1.ini) also specifies the main model file, full GPU offload, and Flash Attention. Its paths are specific to this workstation.

The `.gguf` extension in these paths names the model-file container. A suffix such as `Q8_0` identifies the weight encoding inside it; here it means the eight-bit variant.

The preset matters as much as the launch command. Record the actual devices, split mode, context capacity, KV format, fit behavior, MTP file, and MTP device placement. A model name in a request does not tell you those settings.

For a small request example, the repository includes [request-example.ps1](https://github.com/kokosda/medium/blob/main/20261123-qwen-rtx3090-benchmarks/request-example.ps1). It sends the same prompt with temperature 0, seed 42, and an 8,192-token output ceiling, and streams the response. It is a request example; the timing collector used for the study additionally saved telemetry and checked completion status.

Before calling a result comparable, check that it shares the workload and the conditions you are trying to hold constant. Save a warmup separately. Record whether generation stopped naturally or hit its ceiling. Keep time to first token separate from sustained decoding. Report the actual repetition count.

Most of all, decide what the machine has to support before chasing its highest number.

On this workstation, fitting the required context, choosing a supported execution path, placing MTP, and checking clock state all changed the result enough to matter. My next benchmark would start with those constraints fixed, then compare quants on several prompts and test the generated code. That would answer the question a tokens-per-second chart alone leaves open: which configuration is fast enough **and** produces work worth keeping?

# LINQ Isn't Slow. These LINQ Patterns Are.

This directory contains the complete BenchmarkDotNet source and the raw
evidence behind the corresponding article's reported numbers.

## Layout

- `benchmarks/` — compilable .NET 10 BenchmarkDotNet project
- `results/` — unedited console logs plus Markdown and CSV exports from the
  complete benchmark runs

## Recorded environment

- MacBook Air (Mac16,13), Apple M4, 10 CPU cores (4 performance and 6
  efficiency), 16 GB RAM
- arm64 macOS 15.7.4, build 24G517
- .NET SDKs 9.0.301 and 10.0.300
- `Microsoft.NETCore.App` runtimes 9.0.6 and 10.0.8
- `Microsoft.AspNetCore.App` runtimes 9.0.6 and 10.0.8
- .NET 8 SDK/runtime was not installed, so no .NET 8 comparison was run
- BenchmarkDotNet 0.15.8
- Benchmark runtime: .NET 10.0.8, Arm64 RyuJIT
- GC: concurrent workstation GC (`Server=false`, `Concurrent=true`)
- Published full-suite job: one launch, three warmup iterations, five measured
  iterations, Release mode, no debugger
- Scheduling: normal macOS priority; BenchmarkDotNet could not elevate the
  benchmark process

BenchmarkDotNet reports allocation per operation. Each multi-value
implementation returns a checksum, and setup fails if equivalent
implementations produce different results. Existence benchmarks return and
compare the same Boolean result.

## Build and run

Run from `benchmarks/`:

```bash
dotnet restore
dotnet build -c Release --no-restore
dotnet run -c Release --no-build -- --filter '*RepeatedEnumerationBenchmarks*'
dotnet run -c Release --no-build -- --filter 'LinqPatterns.Benchmarks.ExistenceBenchmarks*'
dotnet run -c Release --no-build -- --filter '*ConcreteCollectionExistenceBenchmarks*'
dotnet run -c Release --no-build -- --filter '*NestedLookupBenchmarks*'
```

The project pins SDK 10.0.300 in `global.json`. BenchmarkDotNet writes new
local artifacts to `benchmarks/BenchmarkDotNet.Artifacts/`; that directory is
ignored because the evidence from the article run is already curated under
`results/`.

## Scenarios

- Repeated enumeration uses array-backed and `yield`-backed sources with 100,
  10,000, and 100,000 items. Values not divisible by three are consumed three
  times, either by replaying `Where` or by materializing once.
- Existence checks use 10,000- and 100,000-item arrays with one match at the
  beginning, middle, or end, plus a no-match case. Concrete `List<T>` property
  checks are kept in a separate benchmark class.
- Nested lookup uses unique customer IDs and guaranteed-present order keys.
  A deterministic seed derived from 24,301 and the scenario sizes selects
  pseudo-random lookup positions. Scenarios range from 100 customers and 10
  orders to 10,000 of each.

## Article-to-result mapping

| Article finding | Source rows | Raw evidence |
| --- | --- | --- |
| Replay `Where` versus one `ToArray` over 100,000 array items | `Count=100000`, `Source=Array` | [`repeated-enumeration.md`](results/repeated-enumeration.md), [`repeated-enumeration.csv`](results/repeated-enumeration.csv), [`console`](results/repeated-enumeration.console.log) |
| `Any(predicate)` versus `Count(predicate) > 0` | `Count=100000`, `Position=Middle`, `End`, and `NoMatch` | [`existence.md`](results/existence.md), [`existence.csv`](results/existence.csv), [`console`](results/existence.console.log) |
| Nested `First` versus dictionary construction plus lookup | `Customers1000_Orders10`, `Customers1000_Orders50`, and `Customers10000_Orders10000` | [`nested-lookup.md`](results/nested-lookup.md), [`nested-lookup.csv`](results/nested-lookup.csv), [`console`](results/nested-lookup.console.log) |

The concrete collection-property run is preserved separately because its
overhead-adjusted means were too close to zero to rank responsibly:
[`concrete-collection-existence.md`](results/concrete-collection-existence.md),
[`CSV`](results/concrete-collection-existence.csv), and
[`console`](results/concrete-collection-existence.console.log).

## Default-job headline validation

Before publication, only the article's headline scenarios were rerun with
BenchmarkDotNet's unmodified `Job.Default` heuristics. The explicit launch,
warmup, iteration, and GC overrides were temporarily removed from the local
job declaration, then the source was restored before it was copied here.

That validation preserved the materialization result and the dictionary
construction boundary. It also exposed substantial scheduling variation: one
`Count(predicate)` distribution was flagged as bimodal, several existence
cases removed multiple upper outliers, and the 10,000-by-10,000 nested scan
had a 2.11 ms standard deviation. The validation did not replace or adjust the
article's recorded full-suite numbers.

The selected-run evidence is preserved as
[`headline-default-job.md`](results/headline-default-job.md),
[`CSV`](results/headline-default-job.csv), and
[`console`](results/headline-default-job.console.log).

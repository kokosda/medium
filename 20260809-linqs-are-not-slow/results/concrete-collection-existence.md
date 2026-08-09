```

BenchmarkDotNet v0.15.8, macOS Sequoia 15.7.4 (24G517) [Darwin 24.6.0]
Apple M4, 1 CPU, 10 logical and 10 physical cores
.NET SDK 10.0.300
  [Host]      : .NET 10.0.8 (10.0.8, 10.0.826.23019), Arm64 RyuJIT armv8.0-a
  .NET 10.0.8 : .NET 10.0.8 (10.0.8, 10.0.826.23019), Arm64 RyuJIT armv8.0-a

Job=.NET 10.0.8  Runtime=.NET 10.0  Concurrent=True  
Server=False  IterationCount=5  LaunchCount=1  
WarmupCount=3  

```
| Method          | Count | Mean   | Error  | Ratio | RatioSD | Allocated | Alloc Ratio |
|---------------- |------ |-------:|-------:|------:|--------:|----------:|------------:|
| **CountProperty**   | **0**     | **0.0 ns** | **0.0 ns** |     **?** |       **?** |         **-** |           **?** |
| EnumerableAny   | 0     | 0.0 ns | 0.0 ns |     ? |       ? |         - |           ? |
| EnumerableCount | 0     | 0.0 ns | 0.0 ns |     ? |       ? |         - |           ? |
|                 |       |        |        |       |         |           |             |
| **CountProperty**   | **10000** | **0.0 ns** | **0.0 ns** |     **?** |       **?** |         **-** |           **?** |
| EnumerableAny   | 10000 | 0.0 ns | 0.0 ns |     ? |       ? |         - |           ? |
| EnumerableCount | 10000 | 0.0 ns | 0.0 ns |     ? |       ? |         - |           ? |

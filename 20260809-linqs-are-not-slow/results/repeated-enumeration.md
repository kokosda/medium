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
| Method                             | Count  | Source | Mean         | Error        | StdDev       | Ratio | RatioSD | Gen0    | Gen1    | Gen2    | Allocated | Alloc Ratio |
|----------------------------------- |------- |------- |-------------:|-------------:|-------------:|------:|--------:|--------:|--------:|--------:|----------:|------------:|
| **EnumerateWhereThreeTimes**           | **100**    | **Array**  |     **374.1 ns** |     **38.27 ns** |      **9.94 ns** |  **1.00** |    **0.03** |  **0.0172** |       **-** |       **-** |     **144 B** |        **1.00** |
| MaterializeThenEnumerateThreeTimes | 100    | Array  |     226.7 ns |      3.63 ns |      0.94 ns |  0.61 |    0.01 |  0.0401 |       - |       - |     336 B |        2.33 |
|                                    |        |        |              |              |              |       |         |         |         |         |           |             |
| **EnumerateWhereThreeTimes**           | **100**    | **Yield**  |     **474.3 ns** |     **13.47 ns** |      **3.50 ns** |  **1.00** |    **0.01** |  **0.0200** |       **-** |       **-** |     **168 B** |        **1.00** |
| MaterializeThenEnumerateThreeTimes | 100    | Yield  |     310.7 ns |      3.28 ns |      0.85 ns |  0.66 |    0.00 |  0.0410 |       - |       - |     344 B |        2.05 |
|                                    |        |        |              |              |              |       |         |         |         |         |           |             |
| **EnumerateWhereThreeTimes**           | **10000**  | **Array**  |  **37,962.2 ns** |  **4,099.99 ns** |    **634.48 ns** |  **1.00** |    **0.02** |       **-** |       **-** |       **-** |     **144 B** |        **1.00** |
| MaterializeThenEnumerateThreeTimes | 10000  | Array  |  26,414.4 ns |    537.32 ns |    139.54 ns |  0.70 |    0.01 |  3.1738 |  0.2747 |       - |   26832 B |      186.33 |
|                                    |        |        |              |              |              |       |         |         |         |         |           |             |
| **EnumerateWhereThreeTimes**           | **10000**  | **Yield**  |  **45,411.9 ns** |  **1,157.91 ns** |    **300.71 ns** |  **1.00** |    **0.01** |       **-** |       **-** |       **-** |     **168 B** |        **1.00** |
| MaterializeThenEnumerateThreeTimes | 10000  | Yield  |  36,706.8 ns |    634.16 ns |    164.69 ns |  0.81 |    0.01 |  3.1738 |  0.2441 |       - |   26840 B |      159.76 |
|                                    |        |        |              |              |              |       |         |         |         |         |           |             |
| **EnumerateWhereThreeTimes**           | **100000** | **Array**  | **371,076.3 ns** | **45,728.39 ns** | **11,875.52 ns** |  **1.00** |    **0.04** |       **-** |       **-** |       **-** |     **144 B** |        **1.00** |
| MaterializeThenEnumerateThreeTimes | 100000 | Array  | 278,148.8 ns |  4,791.32 ns |  1,244.29 ns |  0.75 |    0.02 | 83.0078 | 83.0078 | 83.0078 |  266820 B |    1,852.92 |
|                                    |        |        |              |              |              |       |         |         |         |         |           |             |
| **EnumerateWhereThreeTimes**           | **100000** | **Yield**  | **471,840.9 ns** | **22,070.07 ns** |  **5,731.53 ns** |  **1.00** |    **0.02** |       **-** |       **-** |       **-** |     **168 B** |        **1.00** |
| MaterializeThenEnumerateThreeTimes | 100000 | Yield  | 392,913.6 ns |  2,299.41 ns |    597.15 ns |  0.83 |    0.01 | 83.0078 | 83.0078 | 83.0078 |  266828 B |    1,588.26 |

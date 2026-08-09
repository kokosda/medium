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
| Method                        | Count  | Position  | Mean           | Error       | StdDev     | Ratio     | RatioSD | Allocated | Alloc Ratio |
|------------------------------ |------- |---------- |---------------:|------------:|-----------:|----------:|--------:|----------:|------------:|
| **AnyPredicate**                  | **10000**  | **Beginning** |      **0.2970 ns** |   **0.0176 ns** |  **0.0027 ns** |      **1.00** |    **0.01** |         **-** |          **NA** |
| CountPredicateGreaterThanZero | 10000  | Beginning |  2,505.0549 ns |  14.2328 ns |  2.2025 ns |  8,433.65 |   69.29 |         - |          NA |
|                               |        |           |                |             |            |           |         |           |             |
| **AnyPredicate**                  | **10000**  | **Middle**    |  **1,260.2971 ns** |   **4.1889 ns** |  **1.0879 ns** |      **1.00** |    **0.00** |         **-** |          **NA** |
| CountPredicateGreaterThanZero | 10000  | Middle    |  2,532.8367 ns |  17.0391 ns |  4.4250 ns |      2.01 |    0.00 |         - |          NA |
|                               |        |           |                |             |            |           |         |           |             |
| **AnyPredicate**                  | **10000**  | **End**       |  **2,504.3079 ns** |   **8.1972 ns** |  **1.2685 ns** |      **1.00** |    **0.00** |         **-** |          **NA** |
| CountPredicateGreaterThanZero | 10000  | End       |  2,505.8961 ns |   9.8447 ns |  1.5235 ns |      1.00 |    0.00 |         - |          NA |
|                               |        |           |                |             |            |           |         |           |             |
| **AnyPredicate**                  | **10000**  | **NoMatch**   |  **2,508.4047 ns** |   **5.1791 ns** |  **1.3450 ns** |      **1.00** |    **0.00** |         **-** |          **NA** |
| CountPredicateGreaterThanZero | 10000  | NoMatch   |  2,507.0763 ns |   5.8298 ns |  0.9022 ns |      1.00 |    0.00 |         - |          NA |
|                               |        |           |                |             |            |           |         |           |             |
| **AnyPredicate**                  | **100000** | **Beginning** |      **0.2891 ns** |   **0.0020 ns** |  **0.0003 ns** |      **1.00** |    **0.00** |         **-** |          **NA** |
| CountPredicateGreaterThanZero | 100000 | Beginning | 24,964.5170 ns |  91.7978 ns | 23.8396 ns | 86,361.27 |  111.43 |         - |          NA |
|                               |        |           |                |             |            |           |         |           |             |
| **AnyPredicate**                  | **100000** | **Middle**    | **12,529.6706 ns** | **154.5489 ns** | **23.9166 ns** |      **1.00** |    **0.00** |         **-** |          **NA** |
| CountPredicateGreaterThanZero | 100000 | Middle    | 24,973.7266 ns |  66.4763 ns | 10.2873 ns |      1.99 |    0.00 |         - |          NA |
|                               |        |           |                |             |            |           |         |           |             |
| **AnyPredicate**                  | **100000** | **End**       | **24,958.9898 ns** | **149.9573 ns** | **23.2061 ns** |      **1.00** |    **0.00** |         **-** |          **NA** |
| CountPredicateGreaterThanZero | 100000 | End       | 24,971.7405 ns |  46.3477 ns | 12.0363 ns |      1.00 |    0.00 |         - |          NA |
|                               |        |           |                |             |            |           |         |           |             |
| **AnyPredicate**                  | **100000** | **NoMatch**   | **25,143.9689 ns** | **220.8886 ns** | **34.1828 ns** |      **1.00** |    **0.00** |         **-** |          **NA** |
| CountPredicateGreaterThanZero | 100000 | NoMatch   | 25,180.0524 ns | 290.7519 ns | 44.9942 ns |      1.00 |    0.00 |         - |          NA |

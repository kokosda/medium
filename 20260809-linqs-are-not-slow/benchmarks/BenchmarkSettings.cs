using BenchmarkDotNet.Attributes;
using BenchmarkDotNet.Configs;
using BenchmarkDotNet.Environments;
using BenchmarkDotNet.Jobs;

namespace LinqPatterns.Benchmarks;

[AttributeUsage(AttributeTargets.Class)]
public sealed class ArticleBenchmarkAttribute : Attribute, IConfigSource
{
    public ArticleBenchmarkAttribute()
    {
        Config = ManualConfig.CreateEmpty()
            .AddJob(Job.Default
                .WithRuntime(CoreRuntime.Core10_0)
                .WithGcServer(false)
                .WithGcConcurrent(true)
                .WithLaunchCount(1)
                .WithWarmupCount(3)
                .WithIterationCount(5)
                .WithId(".NET 10.0.8"));
    }

    public IConfig Config { get; }
}

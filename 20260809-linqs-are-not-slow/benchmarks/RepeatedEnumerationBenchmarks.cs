using BenchmarkDotNet.Attributes;

namespace LinqPatterns.Benchmarks;

public enum SequenceSource
{
    Array,
    Yield
}

[ArticleBenchmark]
[MemoryDiagnoser]
public class RepeatedEnumerationBenchmarks
{
    private const long ChecksumSeed = 1_469_598_103_934_665_603;
    private const long ChecksumPrime = 1_099_511_628_211;

    private IEnumerable<int> _source = null!;

    [Params(100, 10_000, 100_000)]
    public int Count { get; set; }

    [Params(SequenceSource.Array, SequenceSource.Yield)]
    public SequenceSource Source { get; set; }

    [GlobalSetup]
    public void Setup()
    {
        int[] values = Enumerable.Range(0, Count).ToArray();
        _source = Source == SequenceSource.Array ? values : Yield(values);

        long repeated = EnumerateWhereThreeTimes();
        long materialized = MaterializeThenEnumerateThreeTimes();

        if (repeated != materialized)
            throw new InvalidOperationException("Repeated-enumeration checksums differ.");
    }

    [Benchmark(Baseline = true)]
    public long EnumerateWhereThreeTimes()
    {
        IEnumerable<int> filtered = _source.Where(static value => value % 3 != 0);

        long first = Consume(filtered);
        long second = Consume(filtered);
        long third = Consume(filtered);

        return Combine(first, second, third);
    }

    [Benchmark]
    public long MaterializeThenEnumerateThreeTimes()
    {
        int[] filtered = _source.Where(static value => value % 3 != 0).ToArray();

        long first = Consume(filtered);
        long second = Consume(filtered);
        long third = Consume(filtered);

        return Combine(first, second, third);
    }

    private static long Consume(IEnumerable<int> values)
    {
        long checksum = ChecksumSeed;

        foreach (int value in values)
            checksum = unchecked((checksum ^ value) * ChecksumPrime);

        return checksum;
    }

    private static long Combine(long first, long second, long third) =>
        unchecked((first * 31 + second) * 31 + third);

    private static IEnumerable<int> Yield(int[] values)
    {
        foreach (int value in values)
            yield return value;
    }
}

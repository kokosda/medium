using BenchmarkDotNet.Attributes;

namespace LinqPatterns.Benchmarks;

public enum MatchPosition
{
    Beginning,
    Middle,
    End,
    NoMatch
}

[ArticleBenchmark]
[MemoryDiagnoser]
public class ExistenceBenchmarks
{
    private int[] _values = null!;
    private int _target;

    [Params(10_000, 100_000)]
    public int Count { get; set; }

    [Params(MatchPosition.Beginning, MatchPosition.Middle, MatchPosition.End, MatchPosition.NoMatch)]
    public MatchPosition Position { get; set; }

    [GlobalSetup]
    public void Setup()
    {
        _values = Enumerable.Range(0, Count).ToArray();
        _target = Position switch
        {
            MatchPosition.Beginning => _values[0],
            MatchPosition.Middle => _values[Count / 2],
            MatchPosition.End => _values[^1],
            MatchPosition.NoMatch => -1,
            _ => throw new ArgumentOutOfRangeException()
        };

        if (AnyPredicate() != CountPredicateGreaterThanZero())
            throw new InvalidOperationException("Existence-check results differ.");
    }

    [Benchmark(Baseline = true)]
    public bool AnyPredicate() =>
        _values.Any(value => value == _target);

    [Benchmark]
    public bool CountPredicateGreaterThanZero() =>
        _values.Count(value => value == _target) > 0;
}

[ArticleBenchmark]
[MemoryDiagnoser]
public class ConcreteCollectionExistenceBenchmarks
{
    private List<int> _values = null!;

    [Params(0, 10_000)]
    public int Count { get; set; }

    [GlobalSetup]
    public void Setup()
    {
        _values = Enumerable.Range(0, Count).ToList();

        bool property = CountProperty();
        bool any = EnumerableAny();
        bool count = EnumerableCount();

        if (property != any || property != count)
            throw new InvalidOperationException("Concrete collection results differ.");
    }

    [Benchmark(Baseline = true)]
    public bool CountProperty() => _values.Count > 0;

    [Benchmark]
    public bool EnumerableAny() => _values.Any();

    [Benchmark]
    public bool EnumerableCount() => _values.Count() > 0;
}

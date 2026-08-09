# LINQ Isn’t Slow. These LINQ Patterns Are.

A LINQ query can be harmless when it runs once over 100 items. The same query becomes expensive when `Count()` silently replays it, when `First()` performs a linear search inside another loop, or when a tiny pipeline is rebuilt thousands of times.

The syntax didn’t suddenly get slower. The work crossed a repeated boundary.

That distinction matters. Replacing a nested `First()` with a manual inner loop preserves the same worst-case complexity. You’ve removed LINQ and kept the real problem.

This article is about in-memory LINQ to Objects through `System.Linq.Enumerable`, with .NET 10 and C# 14 as the primary environment. It does not cover `IQueryable<T>`, EF Core translation, PLINQ, or `IAsyncEnumerable<T>`—those have different execution models and deserve different performance rules.

## An `IEnumerable<T>` query is a recipe, not a result

Consider this ordinary code:

```csharp
IEnumerable<Order> eligible =
    orders.Where(o => o.Total >= minimum);

if (eligible.Count() > 0)
{
    LogCount(eligible.Count());

    foreach (var order in eligible)
        Process(order);
}
```

It looks as though `eligible` contains the filtered orders. Usually, it doesn’t. It contains the source and the operations required to produce them.

Many LINQ operators use deferred execution. Calling `Where` constructs the pipeline; enumerating it performs the work. Enumerate the pipeline again and the work normally runs again. An `IEnumerable<T>` is not a `Lazy<T>` whose result is calculated once and cached. Microsoft’s [CA1851 rule](https://learn.microsoft.com/en-us/dotnet/fundamentals/code-analysis/quality-rules/ca1851) flags this exact multiple-enumeration risk.

In the example above, the predicate can be evaluated across the source three times: once for the first `Count()`, once for the second, and once for processing. If the source is an iterator, its `MoveNext` logic also runs again. If it reads mutable state or has side effects, repeated enumeration can change behavior as well as performance.

The right rewrite depends on how the result is consumed.

If only existence matters:

```csharp
bool hasEligible =
    orders.Any(o => o.Total >= minimum);
```

If the filtered results need a count and will be consumed multiple times:

```csharp
Order[] eligible =
    orders.Where(o => o.Total >= minimum).ToArray();

if (eligible.Length > 0)
{
    LogCount(eligible.Length);

    foreach (var order in eligible)
        Process(order);
}
```

If processing is the only consumer, skip the preliminary terminal operation and process the query in one pass.

These are three different execution shapes. There is no universal replacement because the requirements are different.

I ran the benchmarks on a MacBook Air M4 with .NET 10.0.8 and BenchmarkDotNet 0.15.8. For a 100,000-element array consumed three times, replaying the `Where` pipeline took 371 µs. Materializing once and consuming the array three times took 278 µs, but allocated 260.6 KiB. That trade is sensible when the result is bounded, reused, and hot enough to justify the snapshot; for one consumer, the allocation buys nothing. The [benchmark source](https://github.com/kokosda/medium/blob/main/20260809-linqs-are-not-slow/benchmarks/RepeatedEnumerationBenchmarks.cs) performs the same checksum work in both versions.

The [full benchmark project and results](https://github.com/kokosda/medium/tree/main/20260809-linqs-are-not-slow) include the configuration, deterministic inputs, commands, and raw reports.

## Existence does not require a census

`Count(predicate) > 0` asks LINQ to calculate an exact count and then throws almost all of that information away. `Any(predicate)` stops as soon as it finds a match. That short-circuiting behavior is part of the [`Any` contract](https://learn.microsoft.com/en-us/dotnet/api/system.linq.enumerable.any?view=net-10.0), and [CA1827](https://learn.microsoft.com/en-us/dotnet/fundamentals/code-analysis/quality-rules/ca1827) recommends the change when only existence matters.

But “always replace `Count()` with `Any()`” is another bad rule.

For an array, use `Length`. For a `List<T>`, use `Count`. For a collection with `IsEmpty`, use that. [CA1860](https://learn.microsoft.com/en-us/dotnet/fundamentals/code-analysis/quality-rules/ca1860) exists because calling `Any()` on a type that already exposes its size can be less direct and may do more work than reading the property.

[`Count()` itself has fast paths](https://learn.microsoft.com/en-us/dotnet/api/system.linq.enumerable.count?view=net-10.0). It can read the count from `ICollection<T>`, and current LINQ iterators have additional internal count specializations. This is why the source shape matters: an array, a list, a `Where` iterator, and a `yield return` iterator do not necessarily take the same path.

A useful hierarchy is simple:

1. Use `Length`, `Count`, or `IsEmpty` when the concrete collection exposes it.
2. Use `Any()` or `Any(predicate)` when only existence matters for a general sequence.
3. Use `Count()` when you need the actual count.
4. If you’ll consume the sequence afterward, remember that `Any()` plus enumeration is still two passes. Process once or materialize intentionally.

Short-circuiting also depends on the data. An early match may require one predicate call. A missing match still requires a full scan. A benchmark that tests only an early match is telling a very convenient story.

The middle and worst cases make the useful distinction. With one match halfway through 100,000 elements, `Any(predicate)` took 12.5 µs while `Count(predicate) > 0` took 25.0 µs. Put the match at the end—or remove it—and both took about 25 µs. `Any` wins by skipping work, not by making a full scan cheaper. The exact setup is in the [benchmark source](https://github.com/kokosda/medium/blob/main/20260809-linqs-are-not-slow/benchmarks/ExistenceBenchmarks.cs).

## The expensive shape: a query inside a loop

Repeated terminal operations waste passes. A linear query nested inside another enumeration can multiply them.

```csharp
foreach (var order in orders.Where(static o => o.IsBillable))
{
    var customer =
        customers.First(c => c.Id == order.CustomerId);

    total += customer.HourlyRate * order.Hours;
}
```

This code is readable. `First` expresses a one-to-one lookup, the predicate sits next to its use, and small test fixtures won’t make it look suspicious.

Here’s the catch: `First(predicate)` starts searching `customers` from the beginning for every billable order. With *M* orders and *N* customers, the worst case is O(*MN*). Match position matters, missing keys scan the entire inner sequence, and the predicate references the current `order`.

Changing `First` to a handwritten inner loop would keep O(*MN*). The meaningful change is to move the lookup work outside the repeated boundary:

```csharp
var customersById =
    customers.ToDictionary(static c => c.Id);

foreach (var order in orders)
{
    if (!order.IsBillable)
        continue;

    if (!customersById.TryGetValue(order.CustomerId, out var customer))
        throw new InvalidOperationException("Unknown customer.");

    total += customer.HourlyRate * order.Hours;
}
```

The dictionary deliberately materializes and indexes the inner sequence once. Building it takes O(*N*) expected work; each [`TryGetValue`](https://learn.microsoft.com/en-us/dotnet/api/system.collections.generic.dictionary-2.trygetvalue?view=net-10.0) lookup approaches O(1), producing roughly O(*N* + *M*) expected work with O(*N*) additional memory.

That complexity change will usually matter more than shaving a delegate or iterator allocation from the original query.

The construction cost decides where that change pays. With 1,000 customers and 10 orders, nested `First` took 1.96 µs while building a dictionary and looking up the orders took 2.45 µs. At 50 orders, the same comparison was 7.80 µs versus 2.49 µs. At 10,000 customers and 10,000 orders, nested `First` reached 13.3 ms; build-plus-lookup took 52.5 µs.

Those cases used unique customer IDs, guaranteed-present order keys, and deterministic seeded lookup positions. A dictionary created outside the measured operation was reported separately because reuse answers a different lifetime question. The crossover belongs to this workload and distribution, but the scaling direction is the part worth carrying into production. See the [benchmark source](https://github.com/kokosda/medium/blob/main/20260809-linqs-are-not-slow/benchmarks/NestedLookupBenchmarks.cs).

### Preserve the semantics, not just the checksum

The two versions are not automatically equivalent.

`First` throws when no match exists but silently chooses the first duplicate. `ToDictionary` throws while building the index if it finds duplicate keys. The rewrite is valid only when customer IDs are unique and the missing-key behavior is intentional.

Other relationships need other tools:

- `ToLookup` fits one-to-many data and preserves multiple values per key.
- [`Join`](https://learn.microsoft.com/en-us/dotnet/api/system.linq.enumerable.join?view=net-10.0) can express an inner join while indexing the inner sequence in current .NET. It drops unmatched outer items and produces multiple results for duplicate inner keys.
- A reusable dictionary changes the economics again because later operations no longer pay its construction cost.

Ordering can change too. A hash-based index is not a general promise that results will appear in the same order as the original nested search. Define which order belongs to the output before changing the traversal.

This is the unglamorous part of performance work: the faster code must still be the same program.

## Materialization is a boundary, not a reflex

`ToArray()` fixed the repeated-enumeration example by creating one bounded snapshot. It also allocated memory proportional to the result and delayed processing until filtering completed.

That trade-off is sometimes exactly what you want. It is not a reason to append `ToList()` after every query.

Materialization can also hide inside an iterator helper:

```csharp
static IEnumerable<Order> Filter(
    IEnumerable<Order> source,
    decimal minimum)
{
    foreach (var order in source.Where(o => o.Total >= minimum).ToList())
        yield return order;
}
```

Although the method returns `IEnumerable<Order>`, it must build the list before yielding the first item. Microsoft’s documentation on [intermediate materialization](https://learn.microsoft.com/en-us/dotnet/standard/linq/intermediate-materialization) shows how an internal `ToList()` changes both the memory profile and time to first result.

Some operators need buffering by design. Ordinary enumeration of `OrderBy` must consume and order its source before it can produce sorted results. But don’t turn that into “every terminal operation after `OrderBy` performs a full sort.” Modern LINQ contains specialized iterator paths. For example, `OrderBy(...).First()` can use a linear minimum search, and .NET 10 added several `Contains` paths that bypass unnecessary ordering or buffering. Those are [implementation optimizations in .NET 10](https://devblogs.microsoft.com/dotnet/performance-improvements-in-net-10/), not universal API guarantees.

Put materialization where a bounded sequence genuinely needs snapshot semantics, multiple passes, random access, or a stable count. Avoid it for a single consumer and never apply it blindly to an unbounded sequence.

## Closures amplify the pattern; they are not the pattern

The nested lookup also creates a capturing predicate in a frequently executed loop:

```csharp
c => c.Id == order.CustomerId
```

The C# compiler commonly represents [captured state](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/operators/lambda-expressions) with a generated display class and a delegate. A `static` lambda cannot capture local or instance state, which makes accidental capture visible at compile time.

Allocation counts are runtime- and context-specific, though. .NET 10 can eliminate a delegate allocation in some optimized paths while retaining the display-class allocation. That makes “every lambda allocates” obsolete advice—and it makes fixed byte claims just as unreliable. Measure the capturing and noncapturing forms on the exact runtime you deploy, ideally with allocation diagnostics and disassembly.

More importantly, a `static` lambda cannot repair O(*MN*) work. Pre-indexing removes the repeated scan and the per-iteration predicate construction together. Fix the multiplication before polishing its constant costs.

## The decision rule

Keep LINQ unless profiling identifies a relevant hot path. At that path, ask four questions:

1. How many times is this sequence enumerated?
2. Which operators must buffer it?
3. Is a linear query nested inside another loop?
4. Is the pipeline or a capturing predicate reconstructed per iteration?

Use a collection property for a known collection, `Any` for existence over a general sequence, one-pass processing for one consumer, intentional materialization for bounded results needed multiple times, and a dictionary, lookup, or join for repeated keyed correlation.

Treat dictionary construction and dictionary reuse as different designs. Reuse is cheaper, but only when the index has an owner, a lifetime, and an invalidation rule; otherwise the optimization turns current data into a stale answer. These exact timings belong to this Mac and runtime. The scaling behavior is more transferable, and a production trace still decides whether the repeated work is frequent enough to justify extra state or allocation.

Optimize the number and shape of traversals first. If fixed LINQ overhead is still visible after that, then a manual loop may be worth the less declarative code.

LINQ isn’t the expensive part in these examples. Repeating the work is.

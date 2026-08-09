using BenchmarkDotNet.Attributes;

namespace LinqPatterns.Benchmarks;

public enum LookupScenario
{
    Customers100_Orders10,
    Customers100_Orders100,
    Customers1000_Orders10,
    Customers1000_Orders50,
    Customers1000_Orders100,
    Customers1000_Orders1000,
    Customers10000_Orders10000
}

[ArticleBenchmark]
[MemoryDiagnoser]
public class NestedLookupBenchmarks
{
    private const int DistributionSeed = 24_301;
    private const long ChecksumSeed = 17;

    private Customer[] _customers = null!;
    private Order[] _orders = null!;
    private Dictionary<int, Customer> _customersById = null!;

    [Params(
        LookupScenario.Customers100_Orders10,
        LookupScenario.Customers100_Orders100,
        LookupScenario.Customers1000_Orders10,
        LookupScenario.Customers1000_Orders50,
        LookupScenario.Customers1000_Orders100,
        LookupScenario.Customers1000_Orders1000,
        LookupScenario.Customers10000_Orders10000)]
    public LookupScenario Scenario { get; set; }

    [GlobalSetup]
    public void Setup()
    {
        (int customerCount, int orderCount) = GetSizes(Scenario);

        _customers = Enumerable.Range(0, customerCount)
            .Select(static index => new Customer(
                Id: index * 2 + 1,
                HourlyRate: 50 + index % 151))
            .ToArray();

        var random = new Random(DistributionSeed + customerCount * 17 + orderCount);
        _orders = new Order[orderCount];

        for (int index = 0; index < _orders.Length; index++)
        {
            int customerPosition = random.Next(customerCount);
            _orders[index] = new Order(
                CustomerId: _customers[customerPosition].Id,
                Hours: 1 + random.Next(12));
        }

        _customersById = _customers.ToDictionary(static customer => customer.Id);

        long first = FirstInsideOrderLoop();
        long join = Join();
        long built = BuildDictionaryThenLookup();
        long reused = LookupInPrebuiltDictionary();

        if (first != join || first != built || first != reused)
            throw new InvalidOperationException("Nested-lookup checksums differ.");
    }

    [Benchmark(Baseline = true)]
    public long FirstInsideOrderLoop()
    {
        long checksum = ChecksumSeed;

        foreach (Order order in _orders)
        {
            Customer customer = _customers.First(customer => customer.Id == order.CustomerId);
            checksum = Mix(checksum, customer.HourlyRate * order.Hours);
        }

        return checksum;
    }

    [Benchmark]
    public long Join()
    {
        IEnumerable<Charge> charges = _orders.Join(
            _customers,
            static order => order.CustomerId,
            static customer => customer.Id,
            static (order, customer) => new Charge(customer.HourlyRate, order.Hours));

        long checksum = ChecksumSeed;

        foreach (Charge charge in charges)
            checksum = Mix(checksum, charge.HourlyRate * charge.Hours);

        return checksum;
    }

    [Benchmark]
    public long BuildDictionaryThenLookup()
    {
        Dictionary<int, Customer> customersById =
            _customers.ToDictionary(static customer => customer.Id);

        return ConsumeDictionary(customersById);
    }

    [Benchmark]
    public long LookupInPrebuiltDictionary() =>
        ConsumeDictionary(_customersById);

    private long ConsumeDictionary(Dictionary<int, Customer> customersById)
    {
        long checksum = ChecksumSeed;

        foreach (Order order in _orders)
        {
            if (!customersById.TryGetValue(order.CustomerId, out Customer customer))
                throw new InvalidOperationException("Unknown customer.");

            checksum = Mix(checksum, customer.HourlyRate * order.Hours);
        }

        return checksum;
    }

    private static long Mix(long checksum, int value) =>
        unchecked(checksum * 31 + value);

    private static (int CustomerCount, int OrderCount) GetSizes(LookupScenario scenario) =>
        scenario switch
        {
            LookupScenario.Customers100_Orders10 => (100, 10),
            LookupScenario.Customers100_Orders100 => (100, 100),
            LookupScenario.Customers1000_Orders10 => (1_000, 10),
            LookupScenario.Customers1000_Orders50 => (1_000, 50),
            LookupScenario.Customers1000_Orders100 => (1_000, 100),
            LookupScenario.Customers1000_Orders1000 => (1_000, 1_000),
            LookupScenario.Customers10000_Orders10000 => (10_000, 10_000),
            _ => throw new ArgumentOutOfRangeException(nameof(scenario))
        };

    private readonly record struct Customer(int Id, int HourlyRate);
    private readonly record struct Order(int CustomerId, int Hours);
    private readonly record struct Charge(int HourlyRate, int Hours);
}

// Program.cs
using System;
using System.Threading;
using System.Threading.Tasks;

namespace CtsLeaks;

class Program
{
    public static async Task<int> Main(string[] args)
    {
        var scenario = GetArg(args, "scenario") ?? "leak"; // leak | proper | linkedleak | linkedproper
        int iterations = int.Parse(GetArg(args, "iterations") ?? "20000");
        int timeoutMs = int.Parse(GetArg(args, "timeoutMs") ?? "300000"); // 5 minutes default
        int workMs = int.Parse(GetArg(args, "workMs") ?? "1");

        Console.WriteLine($"Scenario={scenario}, iterations={iterations}, timeoutMs={timeoutMs}, workMs={workMs}");
        Console.WriteLine("Attach profiler now if needed... (10s)");
        await Task.Delay(10_000);

        switch (scenario.ToLowerInvariant())
        {
            case "leak":
                await LeakCtsTimersAsync(iterations, timeoutMs, workMs);
                break;
            case "proper":
                await ProperCtsDisposeAsync(iterations, timeoutMs, workMs);
                break;
            case "linkedleak":
                await LinkedLeakAsync(iterations, timeoutMs, workMs);
                break;
            case "linkedproper":
                await LinkedProperAsync(iterations, timeoutMs, workMs);
                break;
            default:
                Console.WriteLine("Unknown scenario.");
                return 1;
        }

        Console.WriteLine("Work completed. Snapshot now before exit (10s)...");
        await Task.Delay(10_000);
        return 0;
    }

    static async Task LeakCtsTimersAsync(int iterations, int timeoutMs, int workMs)
    {
        for (int i = 0; i < iterations; i++)
        {
            // Either constructor with timeout OR CancelAfter creates a timer under the hood.
            var cts = new CancellationTokenSource(timeoutMs);
            // Simulate tiny bit of work so the loop doesn’t optimize away
            await Task.Delay(workMs);
            // Intentionally NOT disposing cts (leak pattern)
        }
    }

    static async Task ProperCtsDisposeAsync(int iterations, int timeoutMs, int workMs)
    {
        for (int i = 0; i < iterations; i++)
        {
            using var cts = new CancellationTokenSource(timeoutMs);
            await Task.Delay(workMs);
            // Disposal releases the timer immediately
        }
    }

    static async Task LinkedLeakAsync(int iterations, int timeoutMs, int workMs)
    {
        using var appShutdown = new CancellationTokenSource();
        for (int i = 0; i < iterations; i++)
        {
            var linked = CancellationTokenSource.CreateLinkedTokenSource(appShutdown.Token);
            linked.CancelAfter(timeoutMs);
            await Task.Delay(workMs);
            // Not disposing the linked source leaks the link and timer
        }
    }

    static async Task LinkedProperAsync(int iterations, int timeoutMs, int workMs)
    {
        using var appShutdown = new CancellationTokenSource();
        for (int i = 0; i < iterations; i++)
        {
            using var linked = CancellationTokenSource.CreateLinkedTokenSource(appShutdown.Token);
            linked.CancelAfter(timeoutMs);
            await Task.Delay(workMs);
            // disposed properly
        }
    }

    static string? GetArg(string[] args, string name)
    {
        foreach (var a in args)
        {
            var parts = a.Split('=', 2, StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length == 2 && parts[0].Equals(name, StringComparison.OrdinalIgnoreCase))
                return parts[1];
        }
        return null;
    }
}

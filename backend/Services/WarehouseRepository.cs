using backend.Models;
using Dapper;
using Microsoft.Data.Sqlite;

namespace backend.Services;

public class WarehouseRepository : IWarehouseRepository
{
    private readonly IConfiguration _configuration;
    private readonly WarehouseValidationService _validationService;

    public WarehouseRepository(IConfiguration configuration, WarehouseValidationService validationService)
    {
        _configuration = configuration;
        _validationService = validationService;
    }

    public string ResolveWarehouseDbPath()
    {
        var configuredPath = _configuration["Warehouse:DbPath"] ?? Environment.GetEnvironmentVariable("WAREHOUSE_DB_PATH");

        if (!string.IsNullOrWhiteSpace(configuredPath))
        {
            return Path.GetFullPath(configuredPath, Directory.GetCurrentDirectory());
        }

        var candidates = new[]
        {
            Path.Combine(Directory.GetCurrentDirectory(), "..", "warehouse.db"),
            Path.Combine(Directory.GetCurrentDirectory(), "warehouse.db"),
            Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "warehouse.db")
        };

        foreach (var candidate in candidates)
        {
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }

        return Path.Combine(Directory.GetCurrentDirectory(), "..", "warehouse.db");
    }

    public async Task<WarehouseValidationResult> ValidateWarehouseAsync()
    {
        var dbPath = ResolveWarehouseDbPath();
        return await _validationService.ValidateAsync(dbPath);
    }

    public async Task<List<string>> GetTableNamesAsync()
    {
        var dbPath = ResolveWarehouseDbPath();
        using var connection = new SqliteConnection($"Data Source={dbPath}");

        return (await connection.QueryAsync<string>(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")).ToList();
    }

    public async Task<List<string>> GetColumnNamesAsync(string tableName)
    {
        var dbPath = ResolveWarehouseDbPath();
        using var connection = new SqliteConnection($"Data Source={dbPath}");

        return (await connection.QueryAsync<string>(
            "SELECT name FROM pragma_table_info(@tableName) ORDER BY cid",
            new { tableName })).ToList();
    }

    public async Task<long> GetRowCountAsync(string tableName)
    {
        var dbPath = ResolveWarehouseDbPath();
        using var connection = new SqliteConnection($"Data Source={dbPath}");

        return await connection.ExecuteScalarAsync<long>($"SELECT COUNT(*) FROM \"{EscapeIdentifier(tableName)}\"");
    }

    public async Task<List<Dictionary<string, object?>>> GetTablePreviewAsync(string tableName, int page = 1, int pageSize = 20)
    {
        var dbPath = ResolveWarehouseDbPath();
        using var connection = new SqliteConnection($"Data Source={dbPath}");

        var offset = (page - 1) * pageSize;
        var previewRows = (await connection.QueryAsync(
            $"SELECT * FROM \"{EscapeIdentifier(tableName)}\" LIMIT @limit OFFSET @offset",
            new { limit = pageSize, offset })).ToList();

        return previewRows.Select(row =>
        {
            var dictionary = new Dictionary<string, object?>();
            if (row is IDictionary<string, object> values)
            {
                foreach (var item in values)
                {
                    dictionary[item.Key] = NormalizeJsonValue(item.Value);
                }
            }

            return dictionary;
        }).ToList();
    }

    public async Task<List<WarehouseTableSummaryDto>> GetTableSummariesAsync()
    {
        var dbPath = ResolveWarehouseDbPath();
        var tableNames = await GetTableNamesAsync();

        var summaries = new List<WarehouseTableSummaryDto>();
        foreach (var tableName in tableNames)
        {
            var columns = await GetColumnNamesAsync(tableName);
            var rowCount = await GetRowCountAsync(tableName);

            summaries.Add(new WarehouseTableSummaryDto
            {
                Name = tableName,
                RowCount = rowCount,
                ColumnCount = columns.Count,
                Columns = columns,
                LastRefreshed = new DateTimeOffset(File.GetLastWriteTimeUtc(dbPath))
            });
        }

        return summaries;
    }

    public async Task<DashboardSummaryResponse> GetSalesSummaryAsync()
    {
        var dbPath = ResolveWarehouseDbPath();
        using var connection = new SqliteConnection($"Data Source={dbPath}");

        var query = "SELECT date, total_revenue, total_orders, avg_order_value FROM fact_daily_sales ORDER BY date ASC";
        var salesData = (await connection.QueryAsync<DailySalesDto>(query)).ToList();

        return new DashboardSummaryResponse
        {
            Kpis = new KpiDto
            {
                TotalRevenue = Math.Round(salesData.Sum(x => x.Total_Revenue), 2),
                TotalOrders = salesData.Sum(x => x.Total_Orders),
                AvgOrderValue = salesData.Count > 0 ? Math.Round(salesData.Average(x => x.Avg_Order_Value), 2) : 0
            },
            ChartData = salesData
        };
    }

    public async Task<DashboardOverviewResponse> GetOverviewAsync()
    {
        var dbPath = ResolveWarehouseDbPath();
        var tableSummaries = await GetTableSummariesAsync();

        return new DashboardOverviewResponse
        {
            WarehousePath = dbPath,
            TotalTables = tableSummaries.Count,
            TotalRows = tableSummaries.Sum(x => x.RowCount),
            LastRefreshed = new DateTimeOffset(File.GetLastWriteTimeUtc(dbPath)),
            Tables = tableSummaries
        };
    }

    public async Task<WarehouseTableDetailResponse> GetTableDetailAsync(string tableName, int page = 1, int pageSize = 20)
    {
        var dbPath = ResolveWarehouseDbPath();
        var columns = await GetColumnNamesAsync(tableName);
        var rowCount = await GetRowCountAsync(tableName);
        var pageSizeSafe = pageSize <= 0 ? 20 : pageSize;
        var pageSafe = page <= 0 ? 1 : page;
        var totalPages = rowCount == 0 ? 0 : (int)Math.Ceiling((double)rowCount / pageSizeSafe);
        var preview = await GetTablePreviewAsync(tableName, pageSafe, pageSizeSafe);

        return new WarehouseTableDetailResponse
        {
            Name = tableName,
            RowCount = rowCount,
            ColumnCount = columns.Count,
            Columns = columns,
            Page = pageSafe,
            PageSize = pageSizeSafe,
            TotalPages = totalPages,
            Preview = preview,
            LastRefreshed = new DateTimeOffset(File.GetLastWriteTimeUtc(dbPath))
        };
    }

    public async Task<WarehouseTableListResponse> GetTableListAsync(int page = 1, int pageSize = 20)
    {
        var tableSummaries = await GetTableSummariesAsync();
        var totalItems = tableSummaries.Count;
        var safePageSize = pageSize <= 0 ? 20 : pageSize;
        var safePage = page <= 0 ? 1 : page;
        var totalPages = totalItems == 0 ? 0 : (int)Math.Ceiling((double)totalItems / safePageSize);

        var items = tableSummaries
            .Skip((safePage - 1) * safePageSize)
            .Take(safePageSize)
            .ToList();

        return new WarehouseTableListResponse
        {
            Page = safePage,
            PageSize = safePageSize,
            TotalItems = totalItems,
            TotalPages = totalPages,
            Items = items
        };
    }

    private static object? NormalizeJsonValue(object? value)
    {
        if (value is null) return null;
        if (value is DateTime dt) return dt.ToUniversalTime();
        if (value is DateTimeOffset dto) return dto;
        if (value is decimal dec) return Convert.ToDouble(dec);
        if (value is float f) return Convert.ToDouble(f);
        if (value is double d) return d;
        if (value is long l) return l;
        if (value is int i) return i;
        if (value is bool b) return b;
        if (value is byte[] bytes) return Convert.ToBase64String(bytes);

        return value.ToString();
    }

    private static string EscapeIdentifier(string identifier)
    {
        return identifier.Replace("\"", "\"\"");
    }
}

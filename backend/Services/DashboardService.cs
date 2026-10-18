using backend.Models;

namespace backend.Services;

public class DashboardService
{
    private readonly IWarehouseRepository _warehouseRepository;

    public DashboardService(IWarehouseRepository warehouseRepository)
    {
        _warehouseRepository = warehouseRepository;
    }

    public async Task<DashboardSummaryResponse> GetSummaryAsync()
    {
        var validation = await _warehouseRepository.ValidateWarehouseAsync();
        if (!validation.Exists)
        {
            throw new InvalidOperationException(validation.Message);
        }

        if (validation.IsEmpty)
        {
            return new DashboardSummaryResponse
            {
                Kpis = new KpiDto { TotalRevenue = 0, TotalOrders = 0, AvgOrderValue = 0 },
                ChartData = new List<DailySalesDto>()
            };
        }

        return await _warehouseRepository.GetSalesSummaryAsync();
    }

    public async Task<WarehouseTableListResponse> GetTablesAsync(int page = 1, int pageSize = 20)
    {
        var validation = await _warehouseRepository.ValidateWarehouseAsync();
        if (!validation.Exists)
        {
            throw new InvalidOperationException(validation.Message);
        }

        if (validation.IsEmpty)
        {
            return new WarehouseTableListResponse
            {
                Page = page <= 0 ? 1 : page,
                PageSize = pageSize <= 0 ? 20 : pageSize,
                TotalItems = 0,
                TotalPages = 0,
                Items = new List<WarehouseTableSummaryDto>()
            };
        }

        return await _warehouseRepository.GetTableListAsync(page, pageSize);
    }

    public async Task<WarehouseTableDetailResponse> GetTableDetailAsync(string tableName, int page = 1, int pageSize = 20)
    {
        if (string.IsNullOrWhiteSpace(tableName))
        {
            throw new ArgumentException("Table name is required.", nameof(tableName));
        }

        var validation = await _warehouseRepository.ValidateWarehouseAsync();
        if (!validation.Exists)
        {
            throw new InvalidOperationException(validation.Message);
        }

        if (validation.IsEmpty)
        {
            throw new KeyNotFoundException($"Table '{tableName}' was not found in the warehouse database.");
        }

        var tableNames = await _warehouseRepository.GetTableNamesAsync();
        if (!tableNames.Contains(tableName, StringComparer.OrdinalIgnoreCase))
        {
            throw new KeyNotFoundException($"Table '{tableName}' was not found in the warehouse database.");
        }

        return await _warehouseRepository.GetTableDetailAsync(tableName, page, pageSize);
    }

    public async Task<DashboardOverviewResponse> GetOverviewAsync()
    {
        var validation = await _warehouseRepository.ValidateWarehouseAsync();
        if (!validation.Exists)
        {
            throw new InvalidOperationException(validation.Message);
        }

        if (validation.IsEmpty)
        {
            var dbPath = _warehouseRepository.ResolveWarehouseDbPath();
            return new DashboardOverviewResponse
            {
                WarehousePath = dbPath,
                TotalTables = 0,
                TotalRows = 0,
                LastRefreshed = DateTimeOffset.UtcNow,
                Tables = new List<WarehouseTableSummaryDto>()
            };
        }

        return await _warehouseRepository.GetOverviewAsync();
    }
}

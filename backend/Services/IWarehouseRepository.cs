using backend.Models;

namespace backend.Services;

public interface IWarehouseRepository
{
    string ResolveWarehouseDbPath();
    Task<WarehouseValidationResult> ValidateWarehouseAsync();
    Task<List<string>> GetTableNamesAsync();
    Task<List<string>> GetColumnNamesAsync(string tableName);
    Task<long> GetRowCountAsync(string tableName);
    Task<List<Dictionary<string, object?>>> GetTablePreviewAsync(string tableName, int page = 1, int pageSize = 20);
    Task<List<WarehouseTableSummaryDto>> GetTableSummariesAsync();
    Task<DashboardSummaryResponse> GetSalesSummaryAsync();
    Task<DashboardOverviewResponse> GetOverviewAsync();
    Task<WarehouseTableDetailResponse> GetTableDetailAsync(string tableName, int page = 1, int pageSize = 20);
    Task<WarehouseTableListResponse> GetTableListAsync(int page = 1, int pageSize = 20);
}

namespace backend.Models
{
    public class DailySalesDto
    {
        public string Date { get; set; } = string.Empty;
        public double Total_Revenue { get; set; }
        public int Total_Orders { get; set; }
        public double Avg_Order_Value { get; set; }
    }

    public class KpiDto
    {
        public double TotalRevenue { get; set; }
        public int TotalOrders { get; set; }
        public double AvgOrderValue { get; set; }
    }

    public class DashboardSummaryResponse
    {
        public KpiDto Kpis { get; set; } = new();
        public List<DailySalesDto> ChartData { get; set; } = new();
    }

    public class WarehouseTableSummaryDto
    {
        public string Name { get; set; } = string.Empty;
        public long RowCount { get; set; }
        public int ColumnCount { get; set; }
        public List<string> Columns { get; set; } = new();
        public DateTimeOffset LastRefreshed { get; set; }
    }

    public class WarehouseTableListResponse
    {
        public int Page { get; set; }
        public int PageSize { get; set; }
        public int TotalItems { get; set; }
        public int TotalPages { get; set; }
        public List<WarehouseTableSummaryDto> Items { get; set; } = new();
    }

    public class WarehouseTableDetailResponse
    {
        public string Name { get; set; } = string.Empty;
        public long RowCount { get; set; }
        public int ColumnCount { get; set; }
        public List<string> Columns { get; set; } = new();
        public int Page { get; set; }
        public int PageSize { get; set; }
        public int TotalPages { get; set; }
        public List<Dictionary<string, object?>> Preview { get; set; } = new();
        public DateTimeOffset LastRefreshed { get; set; }
    }

    public class DashboardOverviewResponse
    {
        public string WarehousePath { get; set; } = string.Empty;
        public int TotalTables { get; set; }
        public long TotalRows { get; set; }
        public DateTimeOffset LastRefreshed { get; set; }
        public List<WarehouseTableSummaryDto> Tables { get; set; } = new();
    }
}
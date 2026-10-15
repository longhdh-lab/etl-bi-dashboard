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
}
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Dapper;
using backend.Models;

namespace backend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class DashboardController : ControllerBase
    {
        private readonly string _connectionString;

        public DashboardController(IConfiguration configuration)
        {
            // Trỏ kết nối ra file warehouse.db ở thư mục gốc
            string dbPath = Path.Combine(Directory.GetCurrentDirectory(), "..", "warehouse.db");
            _connectionString = $"Data Source={dbPath}";
        }

        [HttpGet("summary")]
        public async Task<IActionResult> GetSummary()
        {
            if (!System.IO.File.Exists(Path.Combine(Directory.GetCurrentDirectory(), "..", "warehouse.db")))
            {
                return NotFound("Database file 'warehouse.db' not found. Please run ETL script first.");
            }

            using var connection = new SqliteConnection(_connectionString);
            
            var query = "SELECT date, total_revenue, total_orders, avg_order_value FROM fact_daily_sales ORDER BY date ASC";
            var salesData = (await connection.QueryAsync<DailySalesDto>(query)).ToList();

            var response = new DashboardSummaryResponse
            {
                Kpis = new KpiDto
                {
                    TotalRevenue = Math.Round(salesData.Sum(x => x.Total_Revenue), 2),
                    TotalOrders = salesData.Sum(x => x.Total_Orders),
                    AvgOrderValue = salesData.Count > 0 ? Math.Round(salesData.Average(x => x.Avg_Order_Value), 2) : 0
                },
                ChartData = salesData
            };

            return Ok(response);
        }
    }
}
using backend.Models;
using backend.Services;
using Microsoft.AspNetCore.Mvc;

namespace backend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class DashboardController : ControllerBase
    {
        private readonly DashboardService _dashboardService;

        public DashboardController(DashboardService dashboardService)
        {
            _dashboardService = dashboardService;
        }

        [HttpGet("summary")]
        public async Task<IActionResult> GetSummary()
        {
            try
            {
                var response = await _dashboardService.GetSummaryAsync();
                return Ok(response);
            }
            catch (InvalidOperationException ex)
            {
                return NotFound(ex.Message);
            }
        }

        [HttpGet("tables")]
        public async Task<IActionResult> GetTables([FromQuery] int page = 1, [FromQuery] int pageSize = 20)
        {
            try
            {
                var response = await _dashboardService.GetTablesAsync(page, pageSize);
                return Ok(response);
            }
            catch (InvalidOperationException ex)
            {
                return NotFound(ex.Message);
            }
        }

        [HttpGet("tables/{tableName}")]
        public async Task<IActionResult> GetTableDetail(string tableName, [FromQuery] int page = 1, [FromQuery] int pageSize = 20)
        {
            try
            {
                var response = await _dashboardService.GetTableDetailAsync(tableName, page, pageSize);
                return Ok(response);
            }
            catch (ArgumentException ex)
            {
                return BadRequest(ex.Message);
            }
            catch (KeyNotFoundException ex)
            {
                return NotFound(ex.Message);
            }
            catch (InvalidOperationException ex)
            {
                return NotFound(ex.Message);
            }
        }

        [HttpGet("overview")]
        public async Task<IActionResult> GetOverview()
        {
            try
            {
                var response = await _dashboardService.GetOverviewAsync();
                return Ok(response);
            }
            catch (InvalidOperationException ex)
            {
                return NotFound(ex.Message);
            }
        }
    }
}
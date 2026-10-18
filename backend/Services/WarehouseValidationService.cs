using Microsoft.Data.Sqlite;
using Dapper;

namespace backend.Services;

public sealed class WarehouseValidationResult
{
    public bool Exists { get; init; }
    public bool IsEmpty { get; init; }
    public List<string> Tables { get; init; } = new();
    public string Message { get; init; } = string.Empty;
}

public class WarehouseValidationService
{
    public async Task<WarehouseValidationResult> ValidateAsync(string dbPath)
    {
        if (string.IsNullOrWhiteSpace(dbPath) || !File.Exists(dbPath))
        {
            return new WarehouseValidationResult
            {
                Exists = false,
                IsEmpty = false,
                Message = "Warehouse database file was not found. Please run the ETL pipeline first."
            };
        }

        using var connection = new SqliteConnection($"Data Source={dbPath}");
        var tables = (await connection.QueryAsync<string>(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")).ToList();

        return new WarehouseValidationResult
        {
            Exists = true,
            IsEmpty = tables.Count == 0,
            Tables = tables,
            Message = tables.Count == 0
                ? "Warehouse database exists but contains no tables yet."
                : "Warehouse database is ready."
        };
    }

    public async Task<bool> HasTableAsync(string dbPath, string tableName)
    {
        if (string.IsNullOrWhiteSpace(tableName))
        {
            return false;
        }

        var validation = await ValidateAsync(dbPath);
        return validation.Exists && !validation.IsEmpty && validation.Tables.Contains(tableName, StringComparer.OrdinalIgnoreCase);
    }
}

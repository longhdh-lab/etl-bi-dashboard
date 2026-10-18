using backend.Services;

namespace backend.Tests;

public class WarehouseValidationServiceTests
{
    [Fact]
    public async Task ValidateAsync_WhenDatabaseDoesNotExist_ReturnsNotExists()
    {
        var service = new WarehouseValidationService();
        var dbPath = Path.Combine(Path.GetTempPath(), $"missing-{Guid.NewGuid():N}.db");

        var result = await service.ValidateAsync(dbPath);

        Assert.False(result.Exists);
        Assert.False(result.IsEmpty);
        Assert.Contains("not found", result.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task ValidateAsync_WhenDatabaseExistsButHasNoTables_ReturnsEmptyWarehouse()
    {
        var service = new WarehouseValidationService();
        var dbPath = Path.Combine(Path.GetTempPath(), $"empty-warehouse-{Guid.NewGuid():N}.db");

        var connection = new Microsoft.Data.Sqlite.SqliteConnection($"Data Source={dbPath}");
        await connection.OpenAsync();
        await connection.CloseAsync();

        try
        {
            var result = await service.ValidateAsync(dbPath);

            Assert.True(result.Exists);
            Assert.True(result.IsEmpty);
            Assert.Empty(result.Tables);
        }
        finally
        {
            if (File.Exists(dbPath))
            {
                File.Delete(dbPath);
            }
        }
    }
}

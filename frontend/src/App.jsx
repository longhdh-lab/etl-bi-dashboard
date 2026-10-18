import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid
} from 'recharts';
import './App.css';

const API_BASE = 'http://localhost:5000';

const formatNumber = (value) => Number(value || 0).toLocaleString();

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
};

const formatCellValue = (value) => {
  if (value === null || value === undefined) return 'NULL';

  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value) || typeof value === 'object') return JSON.stringify(value);

  return String(value);
};

const getRowValue = (row, column) => {
  if (Object.hasOwn(row ?? {}, column)) return row[column];
  const matchingKey = Object.keys(row ?? {}).find((key) => key.toLowerCase() === column.toLowerCase());
  return matchingKey ? row[matchingKey] : undefined;
};

const toDateKey = (value) => {
  if (!value) return '';
  const stringValue = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(stringValue)) return stringValue.slice(0, 10);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
};

function App() {
  const [overview, setOverview] = useState(null);
  const [summary, setSummary] = useState(null);
  const [tableData, setTableData] = useState([]);
  const [selectedTableName, setSelectedTableName] = useState('');
  const [selectedTable, setSelectedTable] = useState(null);
  const [selectedTablePage, setSelectedTablePage] = useState(1);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchTableDetail = async (tableName, page = 1) => {
    if (!tableName) return;

    if (selectedTableName !== tableName) {
      setDateFrom('');
      setDateTo('');
    }
    setSelectedTableName(tableName);
    setSelectedTablePage(page);
    setDetailLoading(true);
    setDetailError(null);

    try {
      const response = await axios.get(
        `${API_BASE}/api/dashboard/tables/${encodeURIComponent(tableName)}?page=${page}&pageSize=20`
      );

      setSelectedTable(response.data || null);
    } catch (err) {
      console.error('Lỗi tải chi tiết bảng:', err);
      setSelectedTable(null);
      setDetailError('Không thể tải chi tiết bảng này.');
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    const fetchDashboard = async () => {
      setLoading(true);
      setError(null);

      try {
        const [overviewRes, tablesRes, summaryRes] = await Promise.all([
          axios.get(`${API_BASE}/api/dashboard/overview`),
          axios.get(`${API_BASE}/api/dashboard/tables?page=1&pageSize=50`),
          axios.get(`${API_BASE}/api/dashboard/summary`)
        ]);

        setOverview(overviewRes.data || null);
        setTableData(Array.isArray(tablesRes.data?.items) ? tablesRes.data.items : []);
        setSummary(summaryRes.data || null);
      } catch (err) {
        console.error('Lỗi kết nối API C#:', err);
        setError('Không thể tải dữ liệu warehouse. Hãy đảm bảo backend đang chạy và warehouse.db đã được tạo.');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
  }, []);

  const overviewKpis = useMemo(() => {
    if (!overview) return [];

    return [
      {
        title: 'Số bảng',
        value: formatNumber(overview.totalTables ?? 0),
        subtitle: 'warehouse tables'
      },
      {
        title: 'Tổng dòng',
        value: formatNumber(overview.totalRows ?? 0),
        subtitle: 'rows across all tables'
      },
      {
        title: 'Thời gian refresh',
        value: formatDate(overview.lastRefreshed),
        subtitle: 'latest warehouse update'
      }
    ];
  }, [overview]);

  const revenueKpis = useMemo(() => {
    const kpis = summary?.kpis ?? {};

    return [
      {
        title: 'Total Revenue',
        value: `$${formatNumber(kpis.totalRevenue ?? 0)}`,
        subtitle: 'gross revenue'
      },
      {
        title: 'Total Orders',
        value: formatNumber(kpis.totalOrders ?? 0),
        subtitle: 'order count'
      },
      {
        title: 'Avg Order Value',
        value: `$${Number(kpis.avgOrderValue ?? 0).toFixed(2)}`,
        subtitle: 'per order'
      }
    ];
  }, [summary]);

  const tableRowChart = useMemo(
    () => [...tableData]
      .sort((left, right) => right.rowCount - left.rowCount)
      .slice(0, 12),
    [tableData]
  );

  const largestTableName = tableRowChart[0]?.rowCount > 0 ? tableRowChart[0].name : '';

  const dateColumn = useMemo(() => {
    const columns = selectedTable?.columns ?? [];
    return columns.find((column) => /(date|time|timestamp|created|updated)/i.test(column)
      && (selectedTable?.preview ?? []).some((row) => toDateKey(getRowValue(row, column)))) ?? '';
  }, [selectedTable]);

  const filteredPreview = useMemo(() => {
    const rows = selectedTable?.preview ?? [];
    if (!dateColumn) return rows;

    return rows.filter((row) => {
      const dateKey = toDateKey(getRowValue(row, dateColumn));
      return dateKey && (!dateFrom || dateKey >= dateFrom) && (!dateTo || dateKey <= dateTo);
    });
  }, [dateColumn, dateFrom, dateTo, selectedTable]);

  const categoryAnalytics = useMemo(() => {
    const columns = selectedTable?.columns ?? [];
    const categoryColumn = columns.find((column) => /(category|type|status|country|region|city)/i.test(column));
    if (!categoryColumn) return null;

    const counts = new Map();
    filteredPreview.forEach((row) => {
      const value = getRowValue(row, categoryColumn);
      if (value !== null && value !== undefined && String(value).trim()) {
        const label = String(value);
        counts.set(label, (counts.get(label) ?? 0) + 1);
      }
    });

    return {
      column: categoryColumn,
      data: [...counts].map(([name, rows]) => ({ name, rows })).sort((left, right) => right.rows - left.rows)
    };
  }, [filteredPreview, selectedTable]);

  const dateAnalytics = useMemo(() => {
    if (!dateColumn) return [];

    const counts = new Map();
    filteredPreview.forEach((row) => {
      const date = toDateKey(getRowValue(row, dateColumn));
      if (date) counts.set(date, (counts.get(date) ?? 0) + 1);
    });

    return [...counts].map(([date, rows]) => ({ date, rows })).sort((left, right) => left.date.localeCompare(right.date));
  }, [dateColumn, filteredPreview]);

  if (loading) {
    return (
      <div className="dashboard-page dashboard-centered">
        <div className="spinner" aria-label="Loading dashboard" />
        <p className="dashboard-muted">Đang tải warehouse overview...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-page">
        <div className="alert error">{error}</div>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Warehouse BI</p>
          <h1 className="dashboard-title">ETL Dashboard Overview</h1>
        </div>
        <div className="tab-switcher" aria-label="Dashboard tabs">
          <button
            type="button"
            className={activeTab === 'overview' ? 'tab active' : 'tab'}
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </button>
          <button
            type="button"
            className={activeTab === 'revenue' ? 'tab active' : 'tab'}
            onClick={() => setActiveTab('revenue')}
          >
            Revenue
          </button>
        </div>
      </header>

      {activeTab === 'overview' ? (
        <>
          <section className="kpi-grid">
            {overviewKpis.map((item) => (
              <article key={item.title} className="kpi-card">
                <div className="card-header">
                  <span className="kpi-title">{item.title}</span>
                </div>
                <div className="kpi-value">{item.value}</div>
                <div className="kpi-subtitle">{item.subtitle}</div>
              </article>
            ))}
          </section>

          <section className="panel analytics-panel">
            <div className="panel-header">
              <h2>Row counts by table</h2>
              <span className="muted">Largest: {largestTableName || 'No rows'}</span>
            </div>
            {tableRowChart.length ? (
              <div className="analytics-chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={tableRowChart} layout="vertical" margin={{ left: 12, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#dfe7f1" />
                    <XAxis type="number" stroke="#64748b" />
                    <YAxis type="category" dataKey="name" width={130} stroke="#64748b" />
                    <Tooltip formatter={(value) => [formatNumber(value), 'Rows']} />
                    <Bar dataKey="rowCount" name="Rows" fill="#0f766e" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="empty-state">No table row counts are available.</div>
            )}
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2>Warehouse tables</h2>
              <span className="muted">{tableData.length} tables</span>
            </div>

            <div className="table-list">
              {tableData.length === 0 ? (
                <div className="empty-state">No tables found in the warehouse yet.</div>
              ) : (
                tableData.map((table) => (
                  <button
                    type="button"
                    key={table.name}
                    className={selectedTableName === table.name ? 'table-row table-row-selected' : 'table-row'}
                    onClick={() => fetchTableDetail(table.name, 1)}
                  >
                    <div className="table-name-block">
                      <div className="table-name">{table.name}</div>
                      <div className="table-meta">
                        {table.columns?.length ?? 0} columns
                        {table.name === largestTableName && <span className="largest-badge">Largest</span>}
                      </div>
                    </div>
                    <div className="table-stat">
                      <span className="label">Rows</span>
                      <strong>{formatNumber(table.rowCount ?? 0)}</strong>
                    </div>
                    <div className="table-stat">
                      <span className="label">Updated</span>
                      <strong>{formatDate(table.lastRefreshed)}</strong>
                    </div>
                  </button>
                ))
              )}
            </div>

            {selectedTableName && (
              <div className="detail-panel panel">
                <div className="panel-header">
                  <h2>{selectedTable?.name ?? selectedTableName}</h2>
                  {selectedTable && (
                    <span className="muted">
                      {formatNumber(selectedTable.rowCount ?? 0)} rows • {selectedTable.columnCount ?? 0} columns
                    </span>
                  )}
                </div>

                {detailError && <div className="alert error">{detailError}</div>}

                {detailLoading ? (
                  <div className="empty-state">Đang tải preview bảng...</div>
                ) : selectedTable ? (
                  <>
                    <div className="column-chips">
                      {selectedTable.columns?.map((column) => (
                        <span key={column} className="column-chip">
                          {column}
                        </span>
                      ))}
                    </div>

                    {(dateColumn || categoryAnalytics) && (
                      <section className="insight-section" aria-label="Selected table analytics">
                        <div className="insight-heading">
                          <div>
                            <h3>Quick analysis</h3>
                            <p>Based on the currently loaded preview page ({selectedTable.pageSize} rows max)</p>
                          </div>
                          {dateColumn && (
                            <div className="date-filters">
                              <label>
                                From
                                <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
                              </label>
                              <label>
                                To
                                <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
                              </label>
                            </div>
                          )}
                        </div>

                        <div className="insight-grid">
                          {categoryAnalytics?.data.length > 0 && (
                            <div className="insight-chart">
                              <h4>Rows by {categoryAnalytics.column}</h4>
                              <ResponsiveContainer width="100%" height={260}>
                                <BarChart data={categoryAnalytics.data.slice(0, 10)}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#dfe7f1" />
                                  <XAxis dataKey="name" interval={0} angle={-20} textAnchor="end" height={65} />
                                  <YAxis allowDecimals={false} />
                                  <Tooltip formatter={(value) => [value, 'Rows in preview']} />
                                  <Bar dataKey="rows" fill="#c2410c" radius={[4, 4, 0, 0]} />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          )}
                          {dateColumn && dateAnalytics.length > 0 && (
                            <div className="insight-chart">
                              <h4>Rows by {dateColumn}</h4>
                              <ResponsiveContainer width="100%" height={260}>
                                <LineChart data={dateAnalytics}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#dfe7f1" />
                                  <XAxis dataKey="date" />
                                  <YAxis allowDecimals={false} />
                                  <Tooltip formatter={(value) => [value, 'Rows in preview']} />
                                  <Line type="monotone" dataKey="rows" stroke="#2563eb" strokeWidth={2} />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          )}
                        </div>
                        {dateColumn && filteredPreview.length === 0 && (
                          <div className="empty-state">No preview rows match this date range.</div>
                        )}
                      </section>
                    )}

                    {filteredPreview.length > 0 ? (
                      <div className="preview-wrap">
                        <table className="preview-table">
                          <thead>
                            <tr>
                              {selectedTable.columns?.map((column) => (
                                <th key={column}>{column}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {filteredPreview.map((row, rowIndex) => (
                              <tr key={`${selectedTable.name}-row-${rowIndex}`}>
                                {selectedTable.columns?.map((column) => (
                                  <td key={`${selectedTable.name}-${column}-${rowIndex}`}>
                                    {formatCellValue(getRowValue(row, column))}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="empty-state">
                        {dateColumn && (dateFrom || dateTo)
                          ? 'Không có dòng preview nào khớp khoảng ngày đã chọn.'
                          : 'Bảng này chưa có dữ liệu preview.'}
                      </div>
                    )}

                    {selectedTable.totalPages > 1 && (
                      <div className="pagination-row">
                        <button
                          type="button"
                          className="page-button"
                          disabled={selectedTablePage <= 1}
                          onClick={() => fetchTableDetail(selectedTable.name, selectedTablePage - 1)}
                        >
                          Trước
                        </button>
                        <span className="page-indicator">
                          Trang {selectedTablePage} / {selectedTable.totalPages}
                        </span>
                        <button
                          type="button"
                          className="page-button"
                          disabled={selectedTablePage >= selectedTable.totalPages}
                          onClick={() => fetchTableDetail(selectedTable.name, selectedTablePage + 1)}
                        >
                          Sau
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="empty-state">Không có dữ liệu chi tiết cho bảng {selectedTableName}.</div>
                )}
              </div>
            )}
          </section>
        </>
      ) : (
        <>
          <section className="kpi-grid">
            {revenueKpis.map((item) => (
              <article key={item.title} className="kpi-card">
                <div className="card-header">
                  <span className="kpi-title">{item.title}</span>
                </div>
                <div className="kpi-value">{item.value}</div>
                <div className="kpi-subtitle">{item.subtitle}</div>
              </article>
            ))}
          </section>

          <section className="panel chart-panel">
            <div className="panel-header">
              <h2>Daily revenue</h2>
              <span className="muted">fact_daily_sales</span>
            </div>

            {summary?.chartData?.length ? (
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={summary.chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#dfe7f1" />
                    <XAxis dataKey="date" stroke="#64748b" />
                    <YAxis stroke="#64748b" />
                    <Tooltip
                      formatter={(value) => [`$${Number(value).toLocaleString()}`, 'Revenue']}
                      labelFormatter={(label) => `Date: ${label}`}
                    />
                    <Line
                      type="monotone"
                      dataKey="total_Revenue"
                      stroke="#2563eb"
                      strokeWidth={3}
                      dot={{ r: 3 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="empty-state">No daily sales data is available yet.</div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default App;

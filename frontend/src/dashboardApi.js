import axios from 'axios';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5136')
  .replace(/\/+$/, '');

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000
});

const normalizeFieldName = (name) => name.toLowerCase().replace(/[_\s-]/g, '');

const readField = (value, fieldName, fallback) => {
  if (!value || typeof value !== 'object') return fallback;
  const expectedName = normalizeFieldName(fieldName);
  const matchingKey = Object.keys(value).find(
    (key) => normalizeFieldName(key) === expectedName
  );
  return matchingKey === undefined ? fallback : value[matchingKey];
};

const mapTableSummary = (table) => ({
  name: readField(table, 'name', ''),
  rowCount: Number(readField(table, 'rowCount', 0)),
  columnCount: Number(readField(table, 'columnCount', 0)),
  columns: readField(table, 'columns', []),
  lastRefreshed: readField(table, 'lastRefreshed', null)
});

const mapOverview = (overview) => ({
  warehousePath: readField(overview, 'warehousePath', ''),
  totalTables: Number(readField(overview, 'totalTables', 0)),
  totalRows: Number(readField(overview, 'totalRows', 0)),
  lastRefreshed: readField(overview, 'lastRefreshed', null),
  tables: readField(overview, 'tables', []).map(mapTableSummary)
});

const mapTableList = (response) => ({
  page: Number(readField(response, 'page', 1)),
  pageSize: Number(readField(response, 'pageSize', 20)),
  totalItems: Number(readField(response, 'totalItems', 0)),
  totalPages: Number(readField(response, 'totalPages', 0)),
  items: readField(response, 'items', []).map(mapTableSummary)
});

const mapTableDetail = (detail) => ({
  ...mapTableSummary(detail),
  page: Number(readField(detail, 'page', 1)),
  pageSize: Number(readField(detail, 'pageSize', 20)),
  totalPages: Number(readField(detail, 'totalPages', 0)),
  preview: readField(detail, 'preview', [])
});

const mapSalesSummary = (summary) => {
  const kpis = readField(summary, 'kpis', {});
  const chartData = readField(summary, 'chartData', []);

  return {
    kpis: {
      totalRevenue: Number(readField(kpis, 'totalRevenue', 0)),
      totalOrders: Number(readField(kpis, 'totalOrders', 0)),
      avgOrderValue: Number(readField(kpis, 'avgOrderValue', 0))
    },
    chartData: chartData.map((row) => ({
      date: readField(row, 'date', ''),
      total_Revenue: Number(readField(row, 'totalRevenue', 0)),
      total_Orders: Number(readField(row, 'totalOrders', 0)),
      avg_Order_Value: Number(readField(row, 'avgOrderValue', 0))
    }))
  };
};

export const getOverview = async () => mapOverview((await api.get('/api/dashboard/overview')).data);

export const getAllTables = async (pageSize = 50) => {
  const firstPage = mapTableList(
    (await api.get('/api/dashboard/tables', { params: { page: 1, pageSize } })).data
  );

  if (firstPage.totalPages <= 1) return firstPage.items;

  const remainingPages = await Promise.all(
    Array.from({ length: firstPage.totalPages - 1 }, (_, index) => index + 2)
      .map(async (page) => mapTableList(
        (await api.get('/api/dashboard/tables', { params: { page, pageSize } })).data
      ).items)
  );

  return [...firstPage.items, ...remainingPages.flat()];
};

export const getTableDetail = async (tableName, page = 1, pageSize = 20) => mapTableDetail(
  (await api.get(`/api/dashboard/tables/${encodeURIComponent(tableName)}`, {
    params: { page, pageSize }
  })).data
);

export const getSalesSummary = async () => mapSalesSummary(
  (await api.get('/api/dashboard/summary')).data
);

export const getApiErrorMessage = (error, fallback) => {
  const responseMessage = error?.response?.data;
  if (typeof responseMessage === 'string' && responseMessage.trim()) return responseMessage;
  if (typeof responseMessage?.message === 'string' && responseMessage.message.trim()) {
    return responseMessage.message;
  }
  return fallback;
};

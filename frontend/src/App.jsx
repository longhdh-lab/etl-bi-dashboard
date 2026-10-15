import { useEffect, useState } from 'react';
import axios from 'axios';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid
} from 'recharts';

function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Gọi đến API .NET đang chạy ở port 5000 (hoặc port của C# Backend)
    axios.get('http://localhost:5000/api/dashboard/summary')
      .then(res => {
        setData(res.data);
        setLoading(false);
      })
      .catch(err => {
        console.error("Lỗi kết nối API C#:", err);
        setError("Không thể tải dữ liệu. Hãy đảm bảo C# Backend đang chạy và ETL đã tạo file warehouse.db.");
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div style={{ padding: 30, fontFamily: 'Arial, sans-serif' }}>
        ⏳ Đang tải dữ liệu từ C# API...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 30, fontFamily: 'Arial, sans-serif', color: 'red' }}>
        ⚠️ {error}
      </div>
    );
  }

  return (
    <div style={{ padding: 30, fontFamily: 'Arial, sans-serif', backgroundColor: '#f9fafb', minHeight: '100vh' }}>
      <h2 style={{ color: '#111827', marginBottom: 20 }}>📊 Executive Sales BI Dashboard (.NET & Vite React)</h2>
      
      {/* 1. Các thẻ KPI */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 30 }}>
        <div style={cardStyle}>
          <h4 style={cardTitleStyle}>Total Revenue</h4>
          <p style={cardValueStyle}>${data.kpis?.totalRevenue?.toLocaleString()}</p>
        </div>
        <div style={cardStyle}>
          <h4 style={cardTitleStyle}>Total Orders</h4>
          <p style={cardValueStyle}>{data.kpis?.totalOrders}</p>
        </div>
        <div style={cardStyle}>
          <h4 style={cardTitleStyle}>Avg Order Value</h4>
          <p style={cardValueStyle}>${data.kpis?.avgOrderValue?.toFixed(2)}</p>
        </div>
      </div>

      {/* 2. Biểu đồ Doanh thu (Recharts) */}
      <div style={chartContainerStyle}>
        <h3 style={{ marginTop: 0, marginBottom: 20, color: '#374151' }}>Revenue Trend (Last 30 Days)</h3>
        <div style={{ width: '100%', height: 350 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" stroke="#6b7280" />
              <YAxis stroke="#6b7280" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb' }}
                formatter={(value) => [`$${value}`, 'Revenue']}
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
      </div>
    </div>
  );
}

// Inline Styles giúp giao diện đẹp mắt mà không cần CSS phức tạp
const cardStyle = {
  flex: 1,
  border: '1px solid #e5e7eb',
  padding: '20px',
  borderRadius: '10px',
  backgroundColor: '#ffffff',
  boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
};

const cardTitleStyle = {
  margin: '0 0 10px 0',
  color: '#6b7280',
  fontSize: '14px',
  fontWeight: '500'
};

const cardValueStyle = {
  fontSize: '28px',
  fontWeight: 'bold',
  margin: 0,
  color: '#1f2937'
};

const chartContainerStyle = {
  backgroundColor: '#ffffff',
  padding: '20px',
  borderRadius: '10px',
  border: '1px solid #e5e7eb',
  boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
};

export default App;
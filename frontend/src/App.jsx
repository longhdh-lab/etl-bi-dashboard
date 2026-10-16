import { useEffect, useState } from 'react';
import axios from 'axios';
import { Card } from 'primereact/card';
import { Panel } from 'primereact/panel';
import { Message } from 'primereact/message';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Tag } from 'primereact/tag';
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
    axios.get('http://localhost:5000/api/dashboard/summary')
      .then(res => {
        setData(res.data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Lỗi kết nối API C#:', err);
        setError('Không thể tải dữ liệu. Hãy đảm bảo C# Backend đang chạy và ETL đã tạo file warehouse.db.');
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="dashboard-page dashboard-centered">
        <ProgressSpinner.Root style={{ width: '50px', height: '50px' }}>
          <ProgressSpinner.Track />
          <ProgressSpinner.Range />
        </ProgressSpinner.Root>
        <p className="dashboard-muted">Đang tải dữ liệu từ C# API...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-page">
        <Message.Root severity="error">
          <Message.Content>
            <Message.Icon />
            <Message.Text>{error}</Message.Text>
          </Message.Content>
        </Message.Root>
      </div>
    );
  }

  const kpis = [
    {
      title: 'Total Revenue',
      value: `$${data.kpis?.totalRevenue?.toLocaleString() ?? 0}`,
      icon: 'pi pi-dollar',
      severity: 'success'
    },
    {
      title: 'Total Orders',
      value: data.kpis?.totalOrders ?? 0,
      icon: 'pi pi-shopping-cart',
      severity: 'info'
    },
    {
      title: 'Avg Order Value',
      value: `$${data.kpis?.avgOrderValue?.toFixed(2) ?? '0.00'}`,
      icon: 'pi pi-chart-line',
      severity: 'warn'
    }
  ];

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Executive Sales BI Dashboard</h1>
          <p className="dashboard-muted">.NET API · Vite React · PrimeReact</p>
        </div>
        <Tag severity="info" rounded>
          <i className="pi pi-check-circle" style={{ marginRight: 6 }} />
          Live
        </Tag>
      </header>

      <div className="kpi-grid">
        {kpis.map((kpi) => (
          <Card.Root key={kpi.title} className="kpi-card">
            <Card.Body>
              <Card.Caption>
                <div className="kpi-caption">
                  <Card.Title>{kpi.title}</Card.Title>
                  <Tag severity={kpi.severity} rounded>
                    <i className={kpi.icon} />
                  </Tag>
                </div>
              </Card.Caption>
              <Card.Content>
                <p className="kpi-value">{kpi.value}</p>
              </Card.Content>
            </Card.Body>
          </Card.Root>
        ))}
      </div>

      <Panel.Root>
        <Panel.Header>
          <Panel.Title>Revenue Trend (Last 30 Days)</Panel.Title>
        </Panel.Header>
        <Panel.Content>
          <div className="chart-wrap">
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
        </Panel.Content>
      </Panel.Root>
    </div>
  );
}

export default App;

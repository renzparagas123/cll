import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Calendar, Download, RefreshCw, Info } from 'lucide-react';
import { AccountManager } from '../utils/AccountManager';

export default function DataInsights({ apiUrl }) {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState([]);
  const [metricsData, setMetricsData] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showRawData, setShowRawData] = useState(false);
  const [rawResponses, setRawResponses] = useState({});
  
  const getDefaultDates = () => {
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);
    
    return {
      startDate: sevenDaysAgo.toISOString().split('T')[0],
      endDate: today.toISOString().split('T')[0]
    };
  };

  const [dateRange, setDateRange] = useState(getDefaultDates());
  const [selectedAccount, setSelectedAccount] = useState('all');

  useEffect(() => {
    const allAccounts = AccountManager.getAccounts();
    
    if (allAccounts.length === 0) {
      navigate('/', { replace: true });
      return;
    }
    
    setAccounts(allAccounts);
    
    const arlaAccount = allAccounts.find(acc => 
      acc.account?.toLowerCase().includes('arla') || 
      acc.id?.toLowerCase().includes('arla')
    );
    
    if (arlaAccount) {
      setSelectedAccount(arlaAccount.id);
    }
    
    fetchAllAccountsReports(allAccounts);
  }, [navigate]);

  useEffect(() => {
    if (accounts.length > 0) {
      fetchAllAccountsReports(accounts);
    }
  }, [dateRange]);

  const fetchAllAccountsReports = async (accountsList) => {
    setLoading(true);
    setError(null);
    setMetricsData([]);
    setChartData([]);
    setRawResponses({});
    
    const promises = accountsList.map(account => 
      fetchAccountReports(account)
    );
    
    try {
      const results = await Promise.allSettled(promises);
      
      const allMetrics = [];
      const allRawResponses = {};
      
      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          const account = accountsList[index];
          
          if (result.value.parsed) {
            allMetrics.push({
              account_id: account.id,
              account_name: account.account,
              account_country: account.country,
              timeline: result.value.timeline,
              ...result.value.parsed
            });
          }
          
          if (result.value.rawResponse) {
            allRawResponses[account.id] = result.value.rawResponse;
          }
        }
      });
      
      setMetricsData(allMetrics);
      setRawResponses(allRawResponses);
      
      updateChartData(allMetrics, selectedAccount);
    } catch (err) {
      setError('Failed to fetch report data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const updateChartData = (metrics, accountFilter) => {
    const filteredMetrics = accountFilter === 'all' 
      ? metrics 
      : metrics.filter(m => m.account_id === accountFilter);

    if (filteredMetrics.length === 0) {
      setChartData([]);
      return;
    }

    const timelineDataByDate = {};
    
    filteredMetrics.forEach(metric => {
      if (metric.timeline) {
        metric.timeline.forEach(item => {
          if (!timelineDataByDate[item.date]) {
            timelineDataByDate[item.date] = { 
              date: item.date, 
              spend: 0, 
              roi: 0,
              count: 0 
            };
          }
          timelineDataByDate[item.date].spend += item.spend || 0;
          timelineDataByDate[item.date].roi += item.roi || 0;
          timelineDataByDate[item.date].count += 1;
        });
      }
    });
    
    const chartTimeline = Object.values(timelineDataByDate).map(item => ({
      date: item.date,
      Spend: item.spend,
      ROAS: item.count > 0 ? item.roi / item.count : 0
    })).sort((a, b) => new Date(a.date) - new Date(b.date));
    
    setChartData(chartTimeline);
  };

  useEffect(() => {
    if (metricsData.length > 0) {
      updateChartData(metricsData, selectedAccount);
    }
  }, [selectedAccount]);

  const fetchAccountReports = async (account) => {
    try {
      const params = new URLSearchParams({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate
      });

      const response = await fetch(
        `${apiUrl}/lazada/sponsor/solutions/report/getReportOverview?${params}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${account.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const data = await response.json();

      if (response.ok && (data.code === '0' || data.code === 0)) {
        const current = data.result?.reportOverviewDetailDTO || {};
        const previous = data.result?.lastReportOverviewDetailDTO || {};

        const calculateChange = (current, previous) => {
          if (previous === 0) return 0;
          return ((current - previous) / previous) * 100;
        };

        const metrics = {
          spend: parseFloat(current.spend || 0),
          revenue: parseFloat(current.revenue || 0),
          orders: parseInt(current.orders || 0),
          unitsSold: parseInt(current.unitsSold || 0),
          roi: parseFloat(current.roi || 0),
          impressions: parseInt(current.impressions || 0),
          clicks: parseInt(current.clicks || 0),
          ctr: parseFloat(current.ctr || 0),
          cpc: parseFloat(current.cpc || 0),
          spendChange: calculateChange(current.spend, previous.spend),
          revenueChange: calculateChange(current.revenue, previous.revenue),
          ordersChange: calculateChange(current.orders, previous.orders),
          unitsSoldChange: calculateChange(current.unitsSold, previous.unitsSold),
          roiChange: calculateChange(current.roi, previous.roi)
        };

        const startDate = new Date(dateRange.startDate);
        const endDate = new Date(dateRange.endDate);
        const midDate = new Date((startDate.getTime() + endDate.getTime()) / 2);
        
        const timeline = [
          {
            date: startDate.toISOString().split('T')[0],
            spend: previous.spend || 0,
            roi: previous.roi || 0,
          },
          {
            date: midDate.toISOString().split('T')[0],
            spend: (previous.spend + current.spend) / 2 || 0,
            roi: (previous.roi + current.roi) / 2 || 0,
          },
          {
            date: endDate.toISOString().split('T')[0],
            spend: current.spend || 0,
            roi: current.roi || 0,
          }
        ];
        
        return { 
          parsed: metrics,
          timeline: timeline,
          rawResponse: {
            account_name: account.account,
            account_country: account.country,
            status: response.status,
            statusText: response.statusText,
            headers: {
              'content-type': response.headers.get('content-type'),
              'date': response.headers.get('date')
            },
            fullResponse: data
          }
        };
      } else {
        return { 
          parsed: null,
          timeline: [],
          rawResponse: {
            account_name: account.account,
            account_country: account.country,
            status: response.status,
            statusText: response.statusText,
            headers: {},
            fullResponse: data,
            error: data.message || data.error || 'Unknown error'
          }
        };
      }
    } catch (err) {
      return { 
        parsed: null,
        timeline: [],
        rawResponse: {
          account_name: account.account,
          account_country: account.country,
          status: 'error',
          statusText: err.message,
          headers: {},
          fullResponse: { error: err.message }
        }
      };
    }
  };

  const handleDownloadCSV = () => {
    const filteredData = selectedAccount === 'all' 
      ? metricsData 
      : metricsData.filter(m => m.account_id === selectedAccount);

    if (filteredData.length === 0) {
      alert('No data available to download');
      return;
    }

    // CSV Headers matching your expected format
    const headers = [
      'Date',
      'Spend',
      'Revenue',
      'Orders',
      'ROAS',
      'Impressions',
      'Clicks',
      'Units Sold',
      'Add To Cart',
      'CVR',
      'Direct Orders',
      'Direct Quick Orders',
      'Direct Unit Sold',
      'Direct Add To Cart',
      'CTR',
      'CPC',
      'Cost Per Order',
      'Direct CVR',
      'Cost per Direct Order',
      'Direct Conversion'
    ];

    // Generate CSV rows
    const rows = filteredData.map(metric => {
      const cvr = metric.orders > 0 ? ((metric.orders / metric.clicks) * 100).toFixed(2) : '0.00';
      const costPerOrder = metric.orders > 0 ? (metric.spend / metric.orders).toFixed(2) : '0.00';
      const directCvr = '0.00'; // Default values for unavailable metrics
      const costPerDirectOrder = '0.00';
      const directConversion = '0.00';
      
      return [
        dateRange.endDate, // Using end date as the report date
        metric.spend.toFixed(2),
        metric.revenue.toFixed(2),
        metric.orders,
        metric.roi.toFixed(2),
        metric.impressions,
        metric.clicks,
        metric.unitsSold,
        0, // Add To Cart - not available in current data
        cvr + '%',
        0, // Direct Orders - not available
        0, // Direct Quick Orders - not available
        0, // Direct Unit Sold - not available
        0, // Direct Add To Cart - not available
        (metric.ctr * 100).toFixed(2) + '%',
        metric.cpc.toFixed(2),
        costPerOrder,
        directCvr + '%',
        costPerDirectOrder,
        directConversion
      ];
    });

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    const fileName = selectedAccount === 'all' 
      ? `all_accounts_report_${dateRange.startDate}_to_${dateRange.endDate}.csv`
      : `${selectedAccount}_report_${dateRange.startDate}_to_${dateRange.endDate}.csv`;
    
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleRefresh = () => {
    fetchAllAccountsReports(accounts);
  };

  const handleDateChange = (field, value) => {
    setDateRange(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const calculateTotals = () => {
    const filteredData = selectedAccount === 'all' 
      ? metricsData 
      : metricsData.filter(m => m.account_id === selectedAccount);

    if (filteredData.length === 0) {
      return {
        totalSpend: 0,
        totalRevenue: 0,
        totalOrders: 0,
        totalUnitsSold: 0,
        totalImpressions: 0,
        totalClicks: 0,
        avgROI: 0,
        avgCTR: 0,
        avgCPC: 0,
        avgSpendChange: 0,
        avgRevenueChange: 0,
        avgOrdersChange: 0,
        avgUnitsSoldChange: 0,
        avgROIChange: 0,
        avgClicksChange: 0,
        avgImpressionsChange: 0,
        avgCTRChange: 0,
        avgCPCChange: 0
      };
    }

    const totals = filteredData.reduce((acc, curr) => ({
      totalSpend: acc.totalSpend + curr.spend,
      totalRevenue: acc.totalRevenue + curr.revenue,
      totalOrders: acc.totalOrders + curr.orders,
      totalUnitsSold: acc.totalUnitsSold + curr.unitsSold,
      totalImpressions: acc.totalImpressions + (curr.impressions || 0),
      totalClicks: acc.totalClicks + (curr.clicks || 0),
      avgROI: acc.avgROI + curr.roi,
      avgCTR: acc.avgCTR + (curr.ctr || 0),
      avgCPC: acc.avgCPC + (curr.cpc || 0),
      avgSpendChange: acc.avgSpendChange + curr.spendChange,
      avgRevenueChange: acc.avgRevenueChange + curr.revenueChange,
      avgOrdersChange: acc.avgOrdersChange + curr.ordersChange,
      avgUnitsSoldChange: acc.avgUnitsSoldChange + curr.unitsSoldChange,
      avgROIChange: acc.avgROIChange + curr.roiChange
    }), {
      totalSpend: 0,
      totalRevenue: 0,
      totalOrders: 0,
      totalUnitsSold: 0,
      totalImpressions: 0,
      totalClicks: 0,
      avgROI: 0,
      avgCTR: 0,
      avgCPC: 0,
      avgSpendChange: 0,
      avgRevenueChange: 0,
      avgOrdersChange: 0,
      avgUnitsSoldChange: 0,
      avgROIChange: 0
    });

    const count = filteredData.length;
    return {
      ...totals,
      avgROI: totals.avgROI / count,
      avgCTR: totals.avgCTR / count,
      avgCPC: totals.avgCPC / count,
      avgSpendChange: totals.avgSpendChange / count,
      avgRevenueChange: totals.avgRevenueChange / count,
      avgOrdersChange: totals.avgOrdersChange / count,
      avgUnitsSoldChange: totals.avgUnitsSoldChange / count,
      avgROIChange: totals.avgROIChange / count
    };
  };

  const totals = calculateTotals();

  const MetricBox = ({ label, value, change, color = 'blue', isCurrency = false }) => {
    const isPositive = change >= 0;
    const changeColor = isPositive ? 'text-green-600' : 'text-red-600';
    
    return (
      <div className="flex flex-col border-r border-gray-200 last:border-r-0 px-6 py-2">
        <div className="flex items-center gap-1 mb-1">
          <span className={`text-xs font-medium text-${color}-600`}>{label}</span>
          <Info size={12} className="text-gray-400" />
        </div>
        <div className={`text-2xl font-bold text-${color}-600 mb-1`}>
          {isCurrency && 'PHP '}
          {value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-500">vs Previous Period</span>
          <span className={`${changeColor} font-medium`}>
            {isPositive ? '+' : ''}{change.toFixed(2)}%{isPositive ? '▲' : '▼'}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto bg-white min-h-screen">
      {/* Header */}
      <div className="border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-semibold text-gray-900">Overview</h1>
          
          <div className="flex gap-3 items-center">
            {/* Date Range */}
            <div className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded">
              <Calendar size={16} className="text-gray-500" />
              <input
                type="date"
                value={dateRange.startDate}
                onChange={(e) => handleDateChange('startDate', e.target.value)}
                className="text-sm border-none focus:ring-0 p-0"
              />
              <span className="text-gray-500">-</span>
              <input
                type="date"
                value={dateRange.endDate}
                onChange={(e) => handleDateChange('endDate', e.target.value)}
                className="text-sm border-none focus:ring-0 p-0"
              />
            </div>

            <button
              onClick={handleRefresh}
              disabled={loading}
              className="px-3 py-2 text-gray-700 hover:bg-gray-100 rounded transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <button 
              onClick={handleDownloadCSV}
              disabled={metricsData.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download size={16} />
              Download
            </button>

            <button
              onClick={() => setShowRawData(!showRawData)}
              className="px-4 py-2 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
            >
              {showRawData ? 'Hide' : 'Show'} Raw
            </button>
          </div>
        </div>
        
        {/* Account Filter Row */}
        <div className="flex items-center gap-3 pt-3 border-t border-gray-100">
          <label className="text-sm font-medium text-gray-700">Account:</label>
          <select
            value={selectedAccount}
            onChange={(e) => setSelectedAccount(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white min-w-[300px]"
          >
            <option value="all">All Accounts</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.account} ({account.country})
              </option>
            ))}
          </select>
          {selectedAccount !== 'all' && (
            <button
              onClick={() => setSelectedAccount('all')}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Clear filter
            </button>
          )}
          <span className="text-sm text-gray-500 ml-auto">
            {accounts.length} account{accounts.length !== 1 ? 's' : ''} connected
          </span>
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {showRawData && Object.keys(rawResponses).length > 0 && (
        <div className="mx-6 mt-4 bg-gray-900 text-green-400 rounded p-4 overflow-auto max-h-96">
          {Object.entries(rawResponses).map(([accountId, data]) => (
            <div key={accountId} className="mb-4">
              <div className="text-yellow-400 font-semibold mb-2">
                {data.account_name} ({data.account_country})
              </div>
              <pre className="text-xs">{JSON.stringify(data.fullResponse, null, 2)}</pre>
            </div>
          ))}
        </div>
      )}

      {loading && metricsData.length === 0 ? (
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : metricsData.length === 0 ? (
        <div className="mx-6 mt-8 text-center text-gray-500">
          No data available for the selected period
        </div>
      ) : (
        <>
          {/* Metrics Row */}
          <div className="border-b border-gray-200">
            <div className="flex divide-x divide-gray-200">
              <MetricBox 
                label="Spend" 
                value={totals.totalSpend} 
                change={totals.avgSpendChange}
                color="blue"
                isCurrency={true}
              />
              <MetricBox 
                label="ROAS" 
                value={totals.avgROI} 
                change={totals.avgROIChange}
                color="gray"
              />
              <MetricBox 
                label="Clicks" 
                value={totals.totalClicks} 
                change={0}
                color="gray"
              />
              <MetricBox 
                label="Impressions" 
                value={totals.totalImpressions} 
                change={0}
                color="gray"
              />
              <MetricBox 
                label="CTR" 
                value={totals.avgCTR} 
                change={0}
                color="gray"
              />
              <MetricBox 
                label="CPC" 
                value={totals.avgCPC} 
                change={0}
                color="gray"
                isCurrency={true}
              />
              <MetricBox 
                label="Revenue" 
                value={totals.totalRevenue} 
                change={totals.avgRevenueChange}
                color="gray"
                isCurrency={true}
              />
              <MetricBox 
                label="Units Sold" 
                value={totals.totalUnitsSold} 
                change={totals.avgUnitsSoldChange}
                color="gray"
              />
            </div>
          </div>

          {/* Chart */}
          {chartData.length > 0 && (
            <div className="px-6 py-6">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData} margin={{ top: 20, right: 60, left: 20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#9ca3af', fontSize: 12 }}
                    tickFormatter={(value) => {
                      const d = new Date(value);
                      return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
                    }}
                  />
                  <YAxis 
                    yAxisId="left"
                    orientation="left"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#9ca3af', fontSize: 12 }}
                    label={{ value: 'Spend', angle: -90, position: 'insideLeft', style: { fill: '#6b7280', fontSize: 12 } }}
                    domain={[0, 'auto']}
                  />
                  <YAxis 
                    yAxisId="right"
                    orientation="right"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#9ca3af', fontSize: 12 }}
                    label={{ value: 'ROAS', angle: 90, position: 'insideRight', style: { fill: '#6b7280', fontSize: 12 } }}
                    domain={[0, 'auto']}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'rgba(255, 255, 255, 0.95)',
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px',
                      fontSize: '12px',
                      padding: '8px 12px'
                    }}
                    labelFormatter={(label) => {
                      const d = new Date(label);
                      return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
                    }}
                    formatter={(value, name) => {
                      if (name === 'Spend') {
                        return [
                          parseFloat(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                          'Spend'
                        ];
                      }
                      if (name === 'ROAS') {
                        return [
                          parseFloat(value).toFixed(2),
                          'ROAS'
                        ];
                      }
                      return [value, name];
                    }}
                  />
                  <Legend 
                    verticalAlign="bottom"
                    height={36}
                    iconType="line"
                    wrapperStyle={{ fontSize: '12px', paddingTop: '20px' }}
                  />
                  <Line 
                    yAxisId="left"
                    type="monotone" 
                    dataKey="Spend" 
                    stroke="#60a5fa" 
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: '#60a5fa' }}
                  />
                  <Line 
                    yAxisId="right"
                    type="monotone" 
                    dataKey="ROAS" 
                    stroke="#c084fc" 
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: '#c084fc' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}
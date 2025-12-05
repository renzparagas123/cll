import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Calendar, Download, RefreshCw, TrendingUp, TrendingDown } from 'lucide-react';
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
  
  // Date range state - default to last 7 days
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

  useEffect(() => {
    const allAccounts = AccountManager.getAccounts();
    
    if (allAccounts.length === 0) {
      navigate('/', { replace: true });
      return;
    }
    
    setAccounts(allAccounts);
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
      const timelineData = {};
      
      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          const account = accountsList[index];
          
          if (result.value.parsed) {
            allMetrics.push({
              account_id: account.id,
              account_name: account.account,
              account_country: account.country,
              ...result.value.parsed
            });

            // Aggregate timeline data
            if (result.value.timeline) {
              result.value.timeline.forEach(item => {
                if (!timelineData[item.date]) {
                  timelineData[item.date] = { date: item.date, value: 0 };
                }
                timelineData[item.date].value += item.value;
              });
            }
          }
          
          if (result.value.rawResponse) {
            allRawResponses[account.id] = result.value.rawResponse;
          }
        }
      });
      
      setMetricsData(allMetrics);
      setChartData(Object.values(timelineData).sort((a, b) => new Date(a.date) - new Date(b.date)));
      setRawResponses(allRawResponses);
    } catch (err) {
      setError('Failed to fetch report data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAccountReports = async (account) => {
    try {
      const params = new URLSearchParams({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate
      });

      // FIXED: Updated API path to match backend endpoint
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

      console.log(`Response for ${account.account}:`, {
        status: response.status,
        code: data.code,
        message: data.message,
        hasData: !!data.data
      });

      if (response.ok && (data.code === '0' || data.code === 0)) {
        // Parse metrics from the response
        const metrics = {
          spend: parseFloat(data.data?.spend || 0),
          revenue: parseFloat(data.data?.revenue || 0),
          orders: parseInt(data.data?.orders || 0),
          unitsSold: parseInt(data.data?.unitsSold || 0),
          roi: parseFloat(data.data?.roi || 0),
          spendChange: parseFloat(data.data?.spendChange || 0),
          revenueChange: parseFloat(data.data?.revenueChange || 0),
          ordersChange: parseFloat(data.data?.ordersChange || 0),
          unitsSoldChange: parseFloat(data.data?.unitsSoldChange || 0),
          roiChange: parseFloat(data.data?.roiChange || 0)
        };

        // Parse timeline data for chart
        const timeline = data.data?.timeline || [];
        
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
        console.error(`API Error for ${account.account}:`, data);
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
      console.error(`Error fetching reports for ${account.account}:`, err);
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

  const handleRefresh = () => {
    fetchAllAccountsReports(accounts);
  };

  const handleDateChange = (field, value) => {
    setDateRange(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Calculate totals across all accounts
  const calculateTotals = () => {
    if (metricsData.length === 0) {
      return {
        totalSpend: 0,
        totalRevenue: 0,
        totalOrders: 0,
        totalUnitsSold: 0,
        avgROI: 0,
        avgSpendChange: 0,
        avgRevenueChange: 0,
        avgOrdersChange: 0,
        avgUnitsSoldChange: 0,
        avgROIChange: 0
      };
    }

    const totals = metricsData.reduce((acc, curr) => ({
      totalSpend: acc.totalSpend + curr.spend,
      totalRevenue: acc.totalRevenue + curr.revenue,
      totalOrders: acc.totalOrders + curr.orders,
      totalUnitsSold: acc.totalUnitsSold + curr.unitsSold,
      avgROI: acc.avgROI + curr.roi,
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
      avgROI: 0,
      avgSpendChange: 0,
      avgRevenueChange: 0,
      avgOrdersChange: 0,
      avgUnitsSoldChange: 0,
      avgROIChange: 0
    });

    // Calculate averages
    const count = metricsData.length;
    return {
      ...totals,
      avgROI: totals.avgROI / count,
      avgSpendChange: totals.avgSpendChange / count,
      avgRevenueChange: totals.avgRevenueChange / count,
      avgOrdersChange: totals.avgOrdersChange / count,
      avgUnitsSoldChange: totals.avgUnitsSoldChange / count,
      avgROIChange: totals.avgROIChange / count
    };
  };

  const totals = calculateTotals();

  const MetricCard = ({ title, value, change, isPercentage, isCurrency, color }) => {
    const isPositive = change >= 0;
    const changeColor = title === 'ROI' ? (isPositive ? 'text-red-600' : 'text-green-600') : (isPositive ? 'text-green-600' : 'text-red-600');
    
    return (
      <div className="bg-white p-6 rounded-lg shadow-sm">
        <div className="mb-4">
          <div className={`text-sm font-medium ${color}`}>{title}</div>
          <div className="text-3xl font-bold mt-2">
            {isCurrency && 'PHP '}
            {value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500">vs Previous Period</span>
          <div className="flex items-center gap-1">
            {isPositive ? <TrendingUp size={16} className={changeColor} /> : <TrendingDown size={16} className={changeColor} />}
            <span className={changeColor}>
              {Math.abs(change).toFixed(2)}%{isPositive ? '▲' : '▼'}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto bg-gray-50 min-h-screen p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Data Insights</h1>
            <p className="text-sm text-gray-600 mt-1">
              Sponsored Affiliate · SA Data insights
            </p>
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={() => setShowRawData(!showRawData)}
              className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors text-sm"
            >
              {showRawData ? 'Hide' : 'Show'} Raw Data
            </button>
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2 text-sm"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Date Range Picker */}
        <div className="bg-white p-4 rounded-lg shadow-sm flex items-center gap-4">
          <Calendar size={20} className="text-gray-600" />
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(e) => handleDateChange('startDate', e.target.value)}
              max={dateRange.endDate}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <span className="text-gray-500">to</span>
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) => handleDateChange('endDate', e.target.value)}
              min={dateRange.startDate}
              max={new Date().toISOString().split('T')[0]}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="ml-auto text-sm text-gray-600">
            {accounts.length} account{accounts.length !== 1 ? 's' : ''} connected
          </div>
          <button className="flex items-center gap-2 px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors text-sm">
            <Download size={16} />
            Download
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Raw API Response Display */}
      {showRawData && Object.keys(rawResponses).length > 0 && (
        <div className="mb-6 bg-gray-900 text-green-400 rounded-lg p-6 overflow-auto max-h-[600px]">
          <h2 className="text-xl font-bold mb-4 text-white">Complete API Responses</h2>
          {Object.entries(rawResponses).map(([accountId, data]) => (
            <div key={accountId} className="mb-8">
              <div className="bg-gray-800 p-3 rounded mb-2">
                <h3 className="text-lg font-semibold text-yellow-400">
                  Account: {data.account_name} ({data.account_country})
                </h3>
                <p className="text-sm text-gray-400 mt-1">
                  HTTP Status: {data.status} {data.statusText}
                </p>
                {data.error && (
                  <p className="text-sm text-red-400 mt-1">
                    Error: {data.error}
                  </p>
                )}
              </div>
              <div className="bg-black p-4 rounded">
                <pre className="text-xs overflow-auto">
                  {JSON.stringify(data.fullResponse, null, 2)}
                </pre>
              </div>
              <div className="border-t border-gray-700 my-6"></div>
            </div>
          ))}
        </div>
      )}

      {loading && metricsData.length === 0 ? (
        <div className="flex items-center justify-center h-96 bg-white rounded-lg shadow">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <p className="text-gray-600">Loading report data from {accounts.length} account{accounts.length !== 1 ? 's' : ''}...</p>
          </div>
        </div>
      ) : metricsData.length === 0 && !loading ? (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-6 py-8 rounded-lg text-center">
          <p className="text-lg font-semibold mb-2">No Data Available</p>
          <p className="text-sm">
            No report data could be retrieved for the selected date range. 
            Please check if your accounts have Sponsor Solutions enabled and try again.
          </p>
          <button
            onClick={handleRefresh}
            className="mt-4 bg-yellow-600 text-white px-6 py-2 rounded-lg hover:bg-yellow-700 transition-colors"
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          {/* Key Metrics Section */}
          <div className="mb-6">
            <h2 className="text-xl font-bold mb-4">Key Metrics</h2>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <MetricCard 
                title="Spend" 
                value={totals.totalSpend} 
                change={totals.avgSpendChange}
                isCurrency={true}
                color="text-blue-600"
              />
              <MetricCard 
                title="Revenue" 
                value={totals.totalRevenue} 
                change={totals.avgRevenueChange}
                isCurrency={true}
                color="text-green-600"
              />
              <MetricCard 
                title="Orders" 
                value={totals.totalOrders} 
                change={totals.avgOrdersChange}
                color="text-purple-600"
              />
              <MetricCard 
                title="Units Sold" 
                value={totals.totalUnitsSold} 
                change={totals.avgUnitsSoldChange}
                color="text-orange-600"
              />
              <MetricCard 
                title="ROI" 
                value={totals.avgROI} 
                change={totals.avgROIChange}
                color="text-gray-900"
              />
            </div>
          </div>

          {/* Chart Section */}
          {chartData.length > 0 && (
            <div className="bg-white p-6 rounded-lg shadow-sm mb-6">
              <h2 className="text-xl font-bold mb-4">Performance Trend</h2>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis 
                    dataKey="date" 
                    stroke="#6b7280"
                    style={{ fontSize: '12px' }}
                  />
                  <YAxis 
                    stroke="#6b7280"
                    style={{ fontSize: '12px' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'white', 
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px'
                    }}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="value" 
                    stroke="#3b82f6" 
                    strokeWidth={2}
                    dot={{ fill: '#3b82f6', r: 4 }}
                    activeDot={{ r: 6 }}
                    name="Performance"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Account Breakdown Table */}
          {metricsData.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-xl font-bold">Account Breakdown</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Account</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Country</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Spend</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Revenue</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Orders</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">ROI</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {metricsData.map((metric) => (
                      <tr key={metric.account_id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{metric.account_name}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{metric.account_country}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                          PHP {metric.spend.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                          PHP {metric.revenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                          {metric.orders.toLocaleString('en-US')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                          {metric.roi.toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
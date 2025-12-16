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
  const [campaigns, setCampaigns] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState('overview');
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  
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
    if (accounts.length > 0 && selectedCampaign === 'overview') {
      fetchAllAccountsReports(accounts);
    }
  }, [dateRange]);

  useEffect(() => {
    if (selectedAccount && selectedAccount !== 'all') {
      fetchCampaigns(selectedAccount);
    } else {
      setCampaigns([]);
      setSelectedCampaign('overview');
    }
  }, [selectedAccount]);

  useEffect(() => {
    if (selectedCampaign && selectedCampaign !== 'overview' && accounts.length > 0) {
      fetchCampaignPrePlacementData();
    }
  }, [selectedCampaign, dateRange]);

  const fetchCampaigns = async (accountId) => {
    setLoadingCampaigns(true);
    try {
      const account = accounts.find(acc => acc.id === accountId);
      if (!account) return;

      const response = await fetch(
        `${apiUrl}/lazada/sponsor/solutions/campaign/getCampaignList?pageNo=1&pageSize=100`,
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
        setCampaigns(data.result?.campaigns || []);
      } else {
        console.error('Failed to fetch campaigns:', data);
        setCampaigns([]);
      }
    } catch (error) {
      console.error('Error fetching campaigns:', error);
      setCampaigns([]);
    } finally {
      setLoadingCampaigns(false);
    }
  };

  const fetchCampaignPrePlacementData = async () => {
    if (!selectedCampaign || selectedCampaign === 'overview') return;

    setLoading(true);
    setError(null);

    try {
      const account = accounts.find(acc => acc.id === selectedAccount);
      if (!account) return;

      const selectedCampaignData = campaigns.find(c => c.campaignId === selectedCampaign);

      const params = new URLSearchParams({
        campaignId: selectedCampaign,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        productType: 'ALL',
        sort: 'impressions',
        order: 'DESC',
        pageNo: '1',
        pageSize: '100',
        useRtTable: 'true'
      });

      if (selectedCampaignData?.campaignName) {
        params.append('campaignName', selectedCampaignData.campaignName);
      }

      const response = await fetch(
        `${apiUrl}/lazada/sponsor/solutions/report/getReportCampaignOnPrePlacement?${params}`,
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
        const campaigns = data.result?.result || [];
        
        const processedMetrics = campaigns.map(campaign => ({
          account_id: account.id,
          account_name: account.account,
          account_country: account.country,
          campaignName: campaign.campaignName || 'Unknown',
          campaignId: campaign.campaignId,
          productType: campaign.productType,
          campaignType: campaign.campaignType,
          campaignObjective: campaign.campaignObjective,
          spend: parseFloat(campaign.spend || 0),
          revenue: parseFloat(campaign.storeRevenue || campaign.productRevenue || 0),
          storeRevenue: parseFloat(campaign.storeRevenue || 0),
          productRevenue: parseFloat(campaign.productRevenue || 0),
          orders: parseInt(campaign.storeOrders || campaign.productOrders || 0),
          storeOrders: parseInt(campaign.storeOrders || 0),
          productOrders: parseInt(campaign.productOrders || 0),
          unitsSold: parseInt(campaign.storeUnitSold || campaign.productUnitSold || 0),
          storeUnitSold: parseInt(campaign.storeUnitSold || 0),
          productUnitSold: parseInt(campaign.productUnitSold || 0),
          roi: parseFloat(campaign.storeRoi || 0),
          impressions: parseInt(campaign.impressions || 0),
          clicks: parseInt(campaign.clicks || 0),
          ctr: parseFloat(campaign.ctr || 0),
          cpc: parseFloat(campaign.cpc || 0),
          cvr: parseFloat(campaign.storeCvr || campaign.productCvr || 0),
          storeCvr: parseFloat(campaign.storeCvr || 0),
          productCvr: parseFloat(campaign.productCvr || 0),
          a2c: parseInt(campaign.storeA2c || campaign.productA2c || 0),
          storeA2c: parseInt(campaign.storeA2c || 0),
          productA2c: parseInt(campaign.productA2c || 0),
          dayBudget: parseFloat(campaign.dayBudget || 0),
          firstImpShare: campaign.firstImpShare,
          timeline: []
        }));

        setMetricsData(processedMetrics);
        setRawResponses({ [account.id]: data });
        
        const chartTimeline = processedMetrics.map(campaign => ({
          date: `${campaign.campaignName} (${campaign.productType})`,
          Spend: campaign.spend,
          ROAS: campaign.roi
        }));
        
        setChartData(chartTimeline);
      } else {
        setError(`Failed to fetch campaign data: ${data.message}`);
      }
    } catch (err) {
      setError('Failed to fetch campaign pre-placement data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllAccountsReports = async (accountsList) => {
    if (selectedCampaign !== 'overview') return;

    setLoading(true);
    setError(null);
    setMetricsData([]);
    setChartData([]);
    setRawResponses({});
    
    try {
      const allMetrics = [];
      const allRawResponses = {};
      
      for (const account of accountsList) {
        const result = await fetchAccountReports(account);
        
        if (result && result.parsed) {
          allMetrics.push({
            account_id: account.id,
            account_name: account.account,
            account_country: account.country,
            timeline: result.timeline,
            ...result.parsed
          });
        }
        
        if (result && result.rawResponse) {
          allRawResponses[account.id] = result.rawResponse;
        }
      }
      
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
    if (metricsData.length > 0 && selectedCampaign === 'overview') {
      updateChartData(metricsData, selectedAccount);
    }
  }, [selectedAccount]);

  const fetchAccountReports = async (account) => {
    try {
      const start = new Date(dateRange.startDate);
      const end = new Date(dateRange.endDate);
      const dateList = [];
      
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        dateList.push(new Date(d).toISOString().split('T')[0]);
      }

      const dailyDataPromises = dateList.map(async (date) => {
        const params = new URLSearchParams({
          startDate: date,
          endDate: date
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
          
          return {
            date: date,
            spend: parseFloat(current.spend || 0),
            revenue: parseFloat(current.revenue || 0),
            orders: parseInt(current.orders || 0),
            unitsSold: parseInt(current.unitsSold || 0),
            roi: parseFloat(current.roi || 0),
            impressions: parseInt(current.impressions || 0),
            clicks: parseInt(current.clicks || 0),
            ctr: parseFloat(current.ctr || 0),
            cpc: parseFloat(current.cpc || 0)
          };
        }
        
        return null;
      });

      const dailyResults = await Promise.all(dailyDataPromises);
      const timeline = dailyResults.filter(d => d !== null);

      const totalMetrics = timeline.reduce((acc, day) => ({
        spend: acc.spend + day.spend,
        revenue: acc.revenue + day.revenue,
        orders: acc.orders + day.orders,
        unitsSold: acc.unitsSold + day.unitsSold,
        roi: acc.roi + day.roi,
        impressions: acc.impressions + day.impressions,
        clicks: acc.clicks + day.clicks,
        ctr: acc.ctr + day.ctr,
        cpc: acc.cpc + day.cpc
      }), {
        spend: 0,
        revenue: 0,
        orders: 0,
        unitsSold: 0,
        roi: 0,
        impressions: 0,
        clicks: 0,
        ctr: 0,
        cpc: 0
      });

      const avgMetrics = {
        ...totalMetrics,
        roi: timeline.length > 0 ? totalMetrics.roi / timeline.length : 0,
        ctr: timeline.length > 0 ? totalMetrics.ctr / timeline.length : 0,
        cpc: timeline.length > 0 ? totalMetrics.cpc / timeline.length : 0,
        spendChange: 0,
        revenueChange: 0,
        ordersChange: 0,
        unitsSoldChange: 0,
        roiChange: 0
      };

      return { 
        parsed: avgMetrics,
        timeline: timeline,
        rawResponse: {
          account_name: account.account,
          account_country: account.country,
          status: 200,
          statusText: 'OK',
          headers: {},
          fullResponse: { message: `Fetched ${timeline.length} days of data` }
        }
      };
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

    let headers = [];
    let rows = [];

    if (selectedCampaign === 'overview') {
      headers = ['Date', 'Spend', 'Revenue', 'Orders', 'ROAS', 'Impressions', 'Clicks', 'Units Sold', 'CTR', 'CPC'];

      const dateMap = {};
      
      filteredData.forEach(metric => {
        if (metric.timeline && Array.isArray(metric.timeline)) {
          metric.timeline.forEach(timelineItem => {
            const date = timelineItem.date;
            
            if (!dateMap[date]) {
              dateMap[date] = { spend: 0, revenue: 0, orders: 0, roi: 0, impressions: 0, clicks: 0, unitsSold: 0, ctr: 0, cpc: 0, count: 0 };
            }
            
            dateMap[date].spend += timelineItem.spend || 0;
            dateMap[date].revenue += timelineItem.revenue || 0;
            dateMap[date].orders += timelineItem.orders || 0;
            dateMap[date].roi += timelineItem.roi || 0;
            dateMap[date].impressions += timelineItem.impressions || 0;
            dateMap[date].clicks += timelineItem.clicks || 0;
            dateMap[date].unitsSold += timelineItem.unitsSold || 0;
            dateMap[date].ctr += timelineItem.ctr || 0;
            dateMap[date].cpc += timelineItem.cpc || 0;
            dateMap[date].count += 1;
          });
        }
      });

      rows = Object.keys(dateMap).sort((a, b) => new Date(a) - new Date(b)).map(date => {
        const data = dateMap[date];
        const count = data.count;
        const avgRoi = count > 0 ? data.roi / count : 0;
        const avgCtr = count > 0 ? data.ctr / count : 0;
        const avgCpc = count > 0 ? data.cpc / count : 0;
        
        return [date, data.spend.toFixed(2), data.revenue.toFixed(2), data.orders, avgRoi.toFixed(2), data.impressions, data.clicks, data.unitsSold, (avgCtr).toFixed(2) + '%', avgCpc.toFixed(2)];
      });
    } else {
      headers = ['Campaign Name', 'Product Type', 'Campaign Type', 'Spend', 'Store Revenue', 'Product Revenue', 'Store ROAS', 'Store Orders', 'Product Orders', 'Store Units', 'Product Units', 'Impressions', 'Clicks', 'CTR', 'CPC', 'Store CVR', 'Product CVR', 'Store A2C', 'Product A2C', 'Day Budget'];

      rows = filteredData.map(metric => [
        metric.campaignName || '', metric.productType || '', metric.campaignType || '', metric.spend.toFixed(2), metric.storeRevenue.toFixed(2), metric.productRevenue.toFixed(2), metric.roi.toFixed(2), metric.storeOrders, metric.productOrders, metric.storeUnitSold, metric.productUnitSold, metric.impressions, metric.clicks, metric.ctr.toFixed(2) + '%', metric.cpc.toFixed(2), (metric.storeCvr * 100).toFixed(2) + '%', (metric.productCvr * 100).toFixed(2) + '%', metric.storeA2c, metric.productA2c, metric.dayBudget.toFixed(2)
      ]);
    }

    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    const campaignName = selectedCampaign !== 'overview' ? campaigns.find(c => c.campaignId === selectedCampaign)?.campaignName || selectedCampaign : 'overview';
    const fileName = selectedAccount === 'all' ? `all_accounts_${campaignName}_${dateRange.startDate}_to_${dateRange.endDate}.csv` : `${selectedAccount}_${campaignName}_${dateRange.startDate}_to_${dateRange.endDate}.csv`;
    
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleRefresh = () => {
    if (selectedCampaign === 'overview') {
      fetchAllAccountsReports(accounts);
    } else {
      fetchCampaignPrePlacementData();
    }
  };

  const handleDateChange = (field, value) => {
    setDateRange(prev => ({ ...prev, [field]: value }));
  };

  const calculateTotals = () => {
    const filteredData = selectedAccount === 'all' ? metricsData : metricsData.filter(m => m.account_id === selectedAccount);

    if (filteredData.length === 0) {
      return { totalSpend: 0, totalRevenue: 0, totalOrders: 0, totalUnitsSold: 0, totalImpressions: 0, totalClicks: 0, avgROI: 0, avgCTR: 0, avgCPC: 0, avgSpendChange: 0, avgRevenueChange: 0, avgOrdersChange: 0, avgUnitsSoldChange: 0, avgROIChange: 0 };
    }

    const totals = filteredData.reduce((acc, curr) => ({
      totalSpend: acc.totalSpend + (curr.spend || 0),
      totalRevenue: acc.totalRevenue + (curr.revenue || curr.storeRevenue || 0),
      totalOrders: acc.totalOrders + (curr.orders || curr.storeOrders || 0),
      totalUnitsSold: acc.totalUnitsSold + (curr.unitsSold || curr.storeUnitSold || 0),
      totalImpressions: acc.totalImpressions + (curr.impressions || 0),
      totalClicks: acc.totalClicks + (curr.clicks || 0),
      avgROI: acc.avgROI + (curr.roi || 0),
      avgCTR: acc.avgCTR + (curr.ctr || 0),
      avgCPC: acc.avgCPC + (curr.cpc || 0),
      avgSpendChange: acc.avgSpendChange + (curr.spendChange || 0),
      avgRevenueChange: acc.avgRevenueChange + (curr.revenueChange || 0),
      avgOrdersChange: acc.avgOrdersChange + (curr.ordersChange || 0),
      avgUnitsSoldChange: acc.avgUnitsSoldChange + (curr.unitsSoldChange || 0),
      avgROIChange: acc.avgROIChange + (curr.roiChange || 0)
    }), { totalSpend: 0, totalRevenue: 0, totalOrders: 0, totalUnitsSold: 0, totalImpressions: 0, totalClicks: 0, avgROI: 0, avgCTR: 0, avgCPC: 0, avgSpendChange: 0, avgRevenueChange: 0, avgOrdersChange: 0, avgUnitsSoldChange: 0, avgROIChange: 0 });

    const count = filteredData.length;
    return { ...totals, avgROI: totals.avgROI / count, avgCTR: totals.avgCTR / count, avgCPC: totals.avgCPC / count, avgSpendChange: totals.avgSpendChange / count, avgRevenueChange: totals.avgRevenueChange / count, avgOrdersChange: totals.avgOrdersChange / count, avgUnitsSoldChange: totals.avgUnitsSoldChange / count, avgROIChange: totals.avgROIChange / count };
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
      <div className="border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-semibold text-gray-900">
            {selectedCampaign === 'overview' ? 'Overview' : 'Campaign Performance Report'}
          </h1>
          
          <div className="flex gap-3 items-center">
            <div className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded">
              <Calendar size={16} className="text-gray-500" />
              <input type="date" value={dateRange.startDate} onChange={(e) => handleDateChange('startDate', e.target.value)} className="text-sm border-none focus:ring-0 p-0" />
              <span className="text-gray-500">-</span>
              <input type="date" value={dateRange.endDate} onChange={(e) => handleDateChange('endDate', e.target.value)} className="text-sm border-none focus:ring-0 p-0" />
            </div>

            <button onClick={handleRefresh} disabled={loading} className="px-3 py-2 text-gray-700 hover:bg-gray-100 rounded transition-colors">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <button onClick={handleDownloadCSV} disabled={metricsData.length === 0} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
              <Download size={16} />Download
            </button>

            <button onClick={() => setShowRawData(!showRawData)} className="px-4 py-2 bg-gray-600 text-white rounded text-sm hover:bg-gray-700">
              {showRawData ? 'Hide' : 'Show'} Raw
            </button>
          </div>
        </div>
        
        <div className="flex items-center gap-3 pt-3 border-t border-gray-100">
          <label className="text-sm font-medium text-gray-700">Account:</label>
          <select value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)} className="px-3 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white min-w-[200px]">
            <option value="all">All Accounts</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>{account.account} ({account.country})</option>
            ))}
          </select>

          {selectedAccount !== 'all' && (
            <>
              <label className="text-sm font-medium text-gray-700 ml-4">Campaign:</label>
              <select value={selectedCampaign} onChange={(e) => setSelectedCampaign(e.target.value)} disabled={loadingCampaigns || campaigns.length === 0} className="px-3 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white min-w-[200px] disabled:opacity-50">
                <option value="overview">Overview (All Campaigns)</option>
                {campaigns.map((campaign) => (
                  <option key={campaign.campaignId} value={campaign.campaignId}>{campaign.campaignName || campaign.campaignId}</option>
                ))}
              </select>
              {loadingCampaigns && <span className="text-xs text-gray-500">Loading campaigns...</span>}
            </>
          )}

          <span className="text-sm text-gray-500 ml-auto">
            {accounts.length} account{accounts.length !== 1 ? 's' : ''} connected
            {campaigns.length > 0 && ` • ${campaigns.length} campaign${campaigns.length !== 1 ? 's' : ''}`}
          </span>
        </div>
      </div>

      {error && <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">{error}</div>}

      {showRawData && Object.keys(rawResponses).length > 0 && (
        <div className="mx-6 mt-4 bg-gray-900 text-green-400 rounded p-4 overflow-auto max-h-96">
          {Object.entries(rawResponses).map(([accountId, data]) => (
            <div key={accountId} className="mb-4">
              <div className="text-yellow-400 font-semibold mb-2">{data.account_name || accountId} ({data.account_country || 'N/A'})</div>
              <pre className="text-xs">{JSON.stringify(data.fullResponse || data, null, 2)}</pre>
            </div>
          ))}
        </div>
      )}

      {loading && metricsData.length === 0 ? (
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : metricsData.length === 0 ? (
        <div className="mx-6 mt-8 text-center text-gray-500">No data available for the selected period</div>
      ) : (
        <>
          <div className="border-b border-gray-200">
            <div className="flex divide-x divide-gray-200">
              <MetricBox label="Spend" value={totals.totalSpend} change={totals.avgSpendChange} color="blue" isCurrency={true} />
              <MetricBox label="ROAS" value={totals.avgROI} change={totals.avgROIChange} color="gray" />
              <MetricBox label="Clicks" value={totals.totalClicks} change={0} color="gray" />
              <MetricBox label="Impressions" value={totals.totalImpressions} change={0} color="gray" />
              <MetricBox label="CTR" value={totals.avgCTR} change={0} color="gray" />
              <MetricBox label="CPC" value={totals.avgCPC} change={0} color="gray" isCurrency={true} />
              <MetricBox label="Revenue" value={totals.totalRevenue} change={totals.avgRevenueChange} color="gray" isCurrency={true} />
              <MetricBox label="Units Sold" value={totals.totalUnitsSold} change={totals.avgUnitsSoldChange} color="gray" />
            </div>
          </div>

          {chartData.length > 0 && (
            <div className="px-6 py-6">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData} margin={{ top: 20, right: 60, left: 20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} angle={selectedCampaign !== 'overview' ? -45 : 0} textAnchor={selectedCampaign !== 'overview' ? 'end' : 'middle'} height={selectedCampaign !== 'overview' ? 100 : 30} tickFormatter={(value) => {
                    if (selectedCampaign !== 'overview') {
                      return value.length > 30 ? value.substring(0, 27) + '...' : value;
                    }
                    const d = new Date(value);
                    return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
                  }} />
                  <YAxis yAxisId="left" orientation="left" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} label={{ value: 'Spend', angle: -90, position: 'insideLeft', style: { fill: '#6b7280', fontSize: 12 } }} domain={[0, 'auto']} />
                  <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} label={{ value: 'ROAS', angle: 90, position: 'insideRight', style: { fill: '#6b7280', fontSize: 12 } }} domain={[0, 'auto']} />
                  <Tooltip contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '12px', padding: '8px 12px' }} formatter={(value, name) => {
                    if (name === 'Spend') {
                      return ['PHP ' + parseFloat(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 'Spend'];
                    }
                    if (name === 'ROAS') {
                      return [parseFloat(value).toFixed(2), 'ROAS'];
                    }
                    return [value, name];
                  }} />
                  <Legend verticalAlign="bottom" height={36} iconType="line" wrapperStyle={{ fontSize: '12px', paddingTop: '20px' }} />
                  <Line yAxisId="left" type="monotone" dataKey="Spend" stroke="#60a5fa" strokeWidth={2} dot={selectedCampaign !== 'overview'} activeDot={{ r: 4, fill: '#60a5fa' }} />
                  <Line yAxisId="right" type="monotone" dataKey="ROAS" stroke="#c084fc" strokeWidth={2} dot={selectedCampaign !== 'overview'} activeDot={{ r: 4, fill: '#c084fc' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {selectedCampaign !== 'overview' && metricsData.length > 0 && (
            <div className="px-6 py-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Campaign Performance Details</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Campaign</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Spend</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Store Rev</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Product Rev</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">ROAS</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Impr</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Clicks</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">CTR</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">CPC</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Store CVR</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Budget</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {metricsData.map((metric, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900 max-w-xs truncate">{metric.campaignName}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{metric.productType}</td>
                        <td className="px-4 py-3 text-sm text-right text-gray-900 font-semibold">{metric.spend.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                        <td className="px-4 py-3 text-sm text-right text-gray-900">{metric.storeRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                        <td className="px-4 py-3 text-sm text-right text-gray-900">{metric.productRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                        <td className="px-4 py-3 text-sm text-right text-blue-600 font-bold">{metric.roi.toFixed(2)}</td>
                        <td className="px-4 py-3 text-sm text-right text-gray-600">{metric.impressions.toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm text-right text-gray-600">{metric.clicks.toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm text-right text-gray-600">{metric.ctr.toFixed(2)}%</td>
                        <td className="px-4 py-3 text-sm text-right text-gray-600">{metric.cpc.toFixed(2)}</td>
                        <td className="px-4 py-3 text-sm text-right text-gray-600">{(metric.storeCvr * 100).toFixed(2)}%</td>
                        <td className="px-4 py-3 text-sm text-right text-gray-600">{metric.dayBudget.toFixed(0)}</td>
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
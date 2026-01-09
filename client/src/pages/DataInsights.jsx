import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Calendar, Download, RefreshCw, Info, Database } from 'lucide-react';
import { useAccounts } from '../utils/AccountManager';
import { auth } from '../lib/supabase';
import { SyncService, CachedDataService } from '../utils/CachedDataService';
import DataCharts from '../components/DataCharts';

export default function DataInsights({ apiUrl }) {
  const navigate = useNavigate();
  const { accounts, loading: accountsLoading, refresh: refreshAccounts } = useAccounts();
  
  const [activeTab, setActiveTab] = useState('overview');
  const [metricsData, setMetricsData] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showRawData, setShowRawData] = useState(false);
  const [rawResponses, setRawResponses] = useState({});
  const [campaigns, setCampaigns] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState('overview');
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);

  // Sync state
  const [syncing, setSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);

  // Prevent multiple fetches
  const initialFetchDone = useRef(false);
  const currentFetchController = useRef(null);
  
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

  // Fetch sync status on mount
  useEffect(() => {
    fetchSyncStatus();
  }, []);

  const fetchSyncStatus = async () => {
    try {
      const result = await SyncService.getStatus();
      if (result.success && result.data?.settings?.last_sync_at) {
        setLastSyncTime(new Date(result.data.settings.last_sync_at));
      }
    } catch (err) {
      console.error('Failed to fetch sync status:', err);
    }
  };

  // Sync campaign metrics
  const handleSyncMetrics = async () => {
    setSyncing(true);
    setError(null);

    try {
      const daysBack = Math.ceil(
        (new Date(dateRange.endDate) - new Date(dateRange.startDate)) / (1000 * 60 * 60 * 24)
      ) + 1;

      const result = await SyncService.syncCampaignMetrics(
        selectedAccount !== 'all' ? selectedAccount : null,
        daysBack
      );

      if (result.success) {
        setLastSyncTime(new Date());
        alert(`Sync completed! ${result.data.total_synced} metric records synced.`);
        // Refresh data after sync
        fetchCachedMetrics();
      } else {
        throw new Error(result.error || 'Sync failed');
      }
    } catch (err) {
      setError('Sync failed: ' + err.message);
      alert('Sync failed: ' + err.message);
    } finally {
      setSyncing(false);
    }
  };

  // Fetch cached metrics from Supabase
  const fetchCachedMetrics = async () => {
    // Cancel any ongoing fetch
    if (currentFetchController.current) {
      currentFetchController.current.abort();
    }
    currentFetchController.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const result = await CachedDataService.getCampaignMetrics({
        accountId: selectedAccount !== 'all' ? selectedAccount : undefined,
        dateFrom: dateRange.startDate,
        dateTo: dateRange.endDate
      });

      if (result.success) {
        const formattedMetrics = result.data.map(metric => ({
          date: metric.metric_date,
          account_id: metric.account_id,
          account_name: metric.lazada_accounts?.account_name || metric.lazada_accounts?.seller_id,
          account_country: metric.lazada_accounts?.country,
          campaignName: metric.campaign_name || 'Unknown',
          campaignId: metric.campaign_id,
          campaignType: metric.raw_data?.campaignType,
          campaignObjective: metric.raw_data?.campaignObjective,
          dayBudget: metric.day_budget || 0,
          spend: metric.spend || 0,
          revenue: metric.store_revenue || 0,
          storeRevenue: metric.store_revenue || 0,
          productRevenue: metric.product_revenue || 0,
          orders: metric.store_orders || 0,
          storeOrders: metric.store_orders || 0,
          productOrders: metric.product_orders || 0,
          unitsSold: metric.store_unit_sold || 0,
          storeUnitSold: metric.store_unit_sold || 0,
          productUnitSold: metric.product_unit_sold || 0,
          roi: metric.store_roi || 0,
          impressions: metric.impressions || 0,
          clicks: metric.clicks || 0,
          ctr: metric.ctr || 0,
          cpc: metric.cpc || 0,
          storeCvr: metric.store_cvr || 0,
          productCvr: metric.product_cvr || 0,
          storeA2c: metric.store_a2c || 0,
          productA2c: metric.product_a2c || 0,
          _synced_at: metric.synced_at
        }));

        formattedMetrics.sort((a, b) => {
          const dateCompare = new Date(b.date) - new Date(a.date);
          if (dateCompare !== 0) return dateCompare;
          return (a.campaignName || '').localeCompare(b.campaignName || '');
        });

        setMetricsData(formattedMetrics);
        setChartData([]);
      } else {
        throw new Error(result.error || 'Failed to fetch cached metrics');
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError('Failed to fetch data: ' + err.message);
        console.error(err);
      }
    } finally {
      setLoading(false);
    }
  };

  // Fetch cached campaigns
  const fetchCachedCampaigns = async (accountId) => {
    if (!accountId || accountId === 'all') {
      setCampaigns([]);
      return;
    }

    setLoadingCampaigns(true);
    try {
      const result = await CachedDataService.getCampaigns(accountId);
      if (result.success) {
        setCampaigns(result.data || []);
      } else {
        setCampaigns([]);
      }
    } catch (error) {
      console.error('Error fetching cached campaigns:', error);
      setCampaigns([]);
    } finally {
      setLoadingCampaigns(false);
    }
  };

  // Initialize - only run once when accounts load
  useEffect(() => {
    if (accountsLoading) return;
    
    if (accounts.length === 0) {
      navigate('/lazada-auth', { replace: true });
      return;
    }

    // Only fetch once on initial load
    if (!initialFetchDone.current) {
      initialFetchDone.current = true;
      
      // Find arla account if exists
      const arlaAccount = accounts.find(acc => 
        (acc.account_name || acc.seller_id)?.toLowerCase().includes('arla') || 
        acc.id?.toLowerCase().includes('arla')
      );
      
      if (arlaAccount) {
        setSelectedAccount(arlaAccount.id);
      }
      
      fetchCachedMetrics();
    }
  }, [accountsLoading]); // Removed unnecessary dependencies

  // Fetch campaigns when account changes (but not on initial mount)
  const campaignsFetchedFor = useRef(null);
  
  useEffect(() => {
    // Skip if same account or initial load hasn't happened
    if (!initialFetchDone.current) return;
    if (campaignsFetchedFor.current === selectedAccount) return;
    
    campaignsFetchedFor.current = selectedAccount;
    fetchCachedCampaigns(selectedAccount);
  }, [selectedAccount]);

  // Handle date range apply
  const handleApplyDateRange = () => {
    fetchCachedMetrics();
  };

  const handleDownloadCSV = () => {
    const filteredData = selectedAccount === 'all' 
      ? metricsData 
      : metricsData.filter(m => m.account_id === selectedAccount);

    if (filteredData.length === 0) {
      alert('No data available to download');
      return;
    }

    const headers = ['Date', 'Campaign Name', 'Budget', 'Spend', 'Revenue', 'Orders', 'ROI', 'Impressions', 'Clicks', 'CTR', 'CPC', 'Units Sold'];
    
    const rows = filteredData.map(campaign => [
      campaign.date,
      campaign.campaignName || '',
      campaign.dayBudget.toFixed(0),
      campaign.spend.toFixed(2),
      campaign.storeRevenue.toFixed(2),
      campaign.storeOrders,
      campaign.roi.toFixed(2),
      campaign.impressions,
      campaign.clicks,
      campaign.ctr.toFixed(2) + '%',
      campaign.cpc.toFixed(2),
      campaign.storeUnitSold
    ]);

    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    const fileName = `campaign_metrics_${dateRange.startDate}_to_${dateRange.endDate}.csv`;
    
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleRefresh = () => {
    fetchCachedMetrics();
  };

  const handleDateChange = (field, value) => {
    setDateRange(prev => ({ ...prev, [field]: value }));
  };

  const calculateTotals = () => {
    const filteredData = selectedAccount === 'all' ? metricsData : metricsData.filter(m => m.account_id === selectedAccount);

    if (filteredData.length === 0) {
      return { totalSpend: 0, totalRevenue: 0, totalOrders: 0, totalUnitsSold: 0, totalImpressions: 0, totalClicks: 0, avgROI: 0, avgCTR: 0, avgCPC: 0, avgSpendChange: 0, avgRevenueChange: 0, avgOrdersChange: 0, avgUnitsSoldChange: 0, avgROIChange: 0 };
    }

    const dailyTotals = {};
    
    filteredData.forEach(campaign => {
      const date = campaign.date;
      if (!dailyTotals[date]) {
        dailyTotals[date] = {
          spend: 0,
          revenue: 0,
          orders: 0,
          unitsSold: 0,
          impressions: 0,
          clicks: 0,
          a2c: 0,
          campaigns: []
        };
      }
      
      dailyTotals[date].spend += campaign.spend || 0;
      dailyTotals[date].revenue += campaign.storeRevenue || 0;
      dailyTotals[date].orders += campaign.storeOrders || 0;
      dailyTotals[date].unitsSold += campaign.storeUnitSold || 0;
      dailyTotals[date].impressions += campaign.impressions || 0;
      dailyTotals[date].clicks += campaign.clicks || 0;
      dailyTotals[date].a2c += campaign.storeA2c || 0;
      dailyTotals[date].campaigns.push(campaign.campaignName);
    });

    const totals = Object.values(dailyTotals).reduce((acc, day) => ({
      totalSpend: acc.totalSpend + day.spend,
      totalRevenue: acc.totalRevenue + day.revenue,
      totalOrders: acc.totalOrders + day.orders,
      totalUnitsSold: acc.totalUnitsSold + day.unitsSold,
      totalImpressions: acc.totalImpressions + day.impressions,
      totalClicks: acc.totalClicks + day.clicks,
      totalA2c: acc.totalA2c + day.a2c
    }), {
      totalSpend: 0,
      totalRevenue: 0,
      totalOrders: 0,
      totalUnitsSold: 0,
      totalImpressions: 0,
      totalClicks: 0,
      totalA2c: 0
    });

    const avgCTR = totals.totalImpressions > 0 ? (totals.totalClicks / totals.totalImpressions) * 100 : 0;
    const avgCPC = totals.totalClicks > 0 ? totals.totalSpend / totals.totalClicks : 0;
    const avgROI = totals.totalSpend > 0 ? totals.totalRevenue / totals.totalSpend : 0;

    return { 
      totalSpend: totals.totalSpend,
      totalRevenue: totals.totalRevenue,
      totalOrders: totals.totalOrders,
      totalUnitsSold: totals.totalUnitsSold,
      totalImpressions: totals.totalImpressions,
      totalClicks: totals.totalClicks,
      totalA2c: totals.totalA2c,
      avgROI: avgROI,
      avgCTR: avgCTR,
      avgCPC: avgCPC,
      avgSpendChange: 0,
      avgRevenueChange: 0,
      avgOrdersChange: 0,
      avgUnitsSoldChange: 0,
      avgROIChange: 0
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

  // Only show full-page loading on initial load when we have no data
  if (accountsLoading && !initialFetchDone.current && metricsData.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading accounts...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto bg-white min-h-screen">
      {/* Current Data Header */}
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 p-4 border-b border-purple-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Database size={20} className="text-purple-600" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Current Data</h2>
              <p className="text-xs text-gray-500">
                {lastSyncTime ? `Last synced: ${lastSyncTime.toLocaleString()}` : 'Not synced yet'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSyncMetrics}
              disabled={syncing}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-50 transition"
            >
              {syncing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Sync Now
                </>
              )}
            </button>
            <button
              onClick={() => navigate('/sync')}
              className="text-sm text-purple-600 hover:text-purple-700 underline"
            >
              Sync Dashboard →
            </button>
          </div>
        </div>
      </div>

      <div className="border-b border-gray-200 px-6 py-4">
        {/* Tab Navigation */}
        <div className="flex gap-1 mb-4 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-6 py-2 text-sm font-medium transition-colors relative ${
              activeTab === 'overview'
                ? 'text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Overview
            {activeTab === 'overview' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600"></div>
            )}
          </button>
          <button
            onClick={() => setActiveTab('data-charts')}
            className={`px-6 py-2 text-sm font-medium transition-colors relative ${
              activeTab === 'data-charts'
                ? 'text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Data Charts
            {activeTab === 'data-charts' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600"></div>
            )}
          </button>
        </div>

        {/* Controls - Only show on Overview tab */}
        {activeTab === 'overview' && (
          <>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-medium text-gray-900">Overview</h2>
              
              <div className="flex gap-3 items-center">
                <div className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded">
                  <Calendar size={16} className="text-gray-500" />
                  <input type="date" value={dateRange.startDate} onChange={(e) => handleDateChange('startDate', e.target.value)} className="text-sm border-none focus:ring-0 p-0" />
                  <span className="text-gray-500">-</span>
                  <input type="date" value={dateRange.endDate} onChange={(e) => handleDateChange('endDate', e.target.value)} className="text-sm border-none focus:ring-0 p-0" />
                </div>

                <button 
                  onClick={handleApplyDateRange} 
                  disabled={loading}
                  className="px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  Apply
                </button>

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
                  <option key={account.id} value={account.id}>{account.account_name || account.seller_id} ({account.country})</option>
                ))}
              </select>

              {selectedAccount !== 'all' && campaigns.length > 0 && (
                <>
                  <label className="text-sm font-medium text-gray-700 ml-4">Campaign:</label>
                  <select 
                    value={selectedCampaign} 
                    onChange={(e) => setSelectedCampaign(e.target.value)} 
                    disabled={loadingCampaigns} 
                    className="px-3 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white min-w-[200px] disabled:opacity-50"
                  >
                    <option value="overview">All Campaigns</option>
                    {campaigns.map((campaign) => (
                      <option key={campaign.campaign_id} value={campaign.campaign_id}>
                        {campaign.campaign_name || campaign.campaign_id}
                      </option>
                    ))}
                  </select>
                  {loadingCampaigns && <span className="text-xs text-gray-500">Loading...</span>}
                </>
              )}

              <span className="text-sm text-gray-500 ml-auto">
                {accounts.length} account{accounts.length !== 1 ? 's' : ''} connected
              </span>
            </div>
          </>
        )}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <>
          {error && <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">{error}</div>}

          {showRawData && metricsData.length > 0 && (
            <div className="mx-6 mt-4 bg-gray-900 text-green-400 rounded p-4 overflow-auto max-h-96">
              <pre className="text-xs">{JSON.stringify(metricsData.slice(0, 10), null, 2)}</pre>
              {metricsData.length > 10 && <p className="text-yellow-400 mt-2">... and {metricsData.length - 10} more records</p>}
            </div>
          )}

          {loading && metricsData.length === 0 ? (
            <div className="flex items-center justify-center h-96">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading data...</p>
              </div>
            </div>
          ) : !loading && metricsData.length === 0 ? (
            <div className="mx-6 mt-8 text-center text-gray-500">
              <div className="py-12">
                <Database size={48} className="mx-auto text-gray-300 mb-4" />
                <p className="text-lg font-medium text-gray-600 mb-2">No data available</p>
                <p className="text-sm text-gray-500 mb-4">Sync your campaign metrics to see data here.</p>
                <button 
                  onClick={handleSyncMetrics}
                  disabled={syncing}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                >
                  {syncing ? 'Syncing...' : 'Sync Now'}
                </button>
              </div>
            </div>
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
                  <MetricBox label="Orders" value={totals.totalOrders} change={totals.avgOrdersChange} color="gray" />
                </div>
              </div>

              {metricsData.length > 0 && (
                <div className="px-6 py-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">All Campaigns by Date</h2>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Campaign Name</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Budget</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Spend</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Revenue</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Orders</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">ROI</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Impressions</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Clicks</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">CTR</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">CPC</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Units</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {(selectedAccount === 'all' 
                          ? metricsData 
                          : metricsData.filter(m => m.account_id === selectedAccount)
                        ).filter(m => selectedCampaign === 'overview' || m.campaignId === selectedCampaign)
                        .map((campaign, index) => (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">{campaign.date}</td>
                            <td className="px-4 py-3 text-sm text-gray-900 max-w-xs">
                              <div className="font-medium">{campaign.campaignName}</div>
                              {selectedAccount === 'all' && <div className="text-xs text-gray-500">{campaign.account_name}</div>}
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-gray-600">{campaign.dayBudget.toLocaleString('en-US', { minimumFractionDigits: 0 })}</td>
                            <td className="px-4 py-3 text-sm text-right text-gray-900 font-semibold">{campaign.spend.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                            <td className="px-4 py-3 text-sm text-right text-gray-900">{campaign.storeRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                            <td className="px-4 py-3 text-sm text-right text-gray-900 font-medium">{campaign.storeOrders.toLocaleString()}</td>
                            <td className="px-4 py-3 text-sm text-right text-blue-600 font-bold">{campaign.roi.toFixed(2)}</td>
                            <td className="px-4 py-3 text-sm text-right text-gray-600">{campaign.impressions.toLocaleString()}</td>
                            <td className="px-4 py-3 text-sm text-right text-gray-600">{campaign.clicks.toLocaleString()}</td>
                            <td className="px-4 py-3 text-sm text-right text-gray-600">{campaign.ctr.toFixed(2)}%</td>
                            <td className="px-4 py-3 text-sm text-right text-gray-600">{campaign.cpc.toFixed(2)}</td>
                            <td className="px-4 py-3 text-sm text-right text-gray-600">{campaign.storeUnitSold.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {activeTab === 'data-charts' && (
        <div className="px-6 py-12 text-center">
         <DataCharts />
        </div>
      )}
    </div>
  );
}
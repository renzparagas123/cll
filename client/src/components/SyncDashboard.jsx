// ============================================
// SYNC DASHBOARD COMPONENT
// File: src/components/SyncDashboard.jsx
// Manual sync only
// ============================================

import { useState } from 'react';
import { useSyncStatus } from '../hooks/useCachedData';
import { RefreshCw, Database, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

export default function SyncDashboard() {
  const { 
    status, 
    loading, 
    syncing, 
    error, 
    refresh, 
    syncAll, 
    syncOrders, 
    syncCampaignMetrics 
  } = useSyncStatus();

  const [syncOptions, setSyncOptions] = useState({
    ordersDaysBack: 30,
    metricsDaysBack: 7
  });

  const handleSyncAll = async () => {
    try {
      await syncAll(syncOptions);
      alert('Sync completed successfully!');
    } catch (err) {
      alert('Sync failed: ' + err.message);
    }
  };

  const handleSyncOrders = async () => {
    try {
      await syncOrders(null, syncOptions.ordersDaysBack);
      alert('Orders sync completed!');
    } catch (err) {
      alert('Orders sync failed: ' + err.message);
    }
  };

  const handleSyncMetrics = async () => {
    try {
      await syncCampaignMetrics(null, syncOptions.metricsDaysBack);
      alert('Campaign metrics sync completed!');
    } catch (err) {
      alert('Campaign metrics sync failed: ' + err.message);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString('en-PH', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusIcon = (logStatus) => {
    switch (logStatus) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'started':
      case 'in_progress':
        return <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-500" />;
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
          <span className="ml-2 text-gray-600">Loading sync status...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sync Status Header */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Database className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900">Data Sync Dashboard</h2>
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg">
            {error}
          </div>
        )}

        {/* Data Counts */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="text-2xl font-bold text-blue-600">
              {status?.data_counts?.orders || 0}
            </div>
            <div className="text-sm text-gray-600">Cached Orders</div>
          </div>
          <div className="bg-green-50 rounded-lg p-4">
            <div className="text-2xl font-bold text-green-600">
              {status?.data_counts?.campaigns || 0}
            </div>
            <div className="text-sm text-gray-600">Cached Campaigns</div>
          </div>
          <div className="bg-purple-50 rounded-lg p-4">
            <div className="text-2xl font-bold text-purple-600">
              {status?.data_counts?.campaign_metrics || 0}
            </div>
            <div className="text-sm text-gray-600">Metric Records</div>
          </div>
        </div>

        {/* Last Sync Info */}
        <div className="flex items-center gap-6 p-4 bg-gray-50 rounded-lg mb-6">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-gray-500" />
            <span className="text-sm text-gray-600">Last Sync:</span>
            <span className="text-sm font-medium text-gray-900">
              {formatDate(status?.settings?.last_sync_at)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Status:</span>
            <span className={`text-sm font-medium ${
              status?.settings?.last_sync_status === 'completed' ? 'text-green-600' : 
              status?.settings?.last_sync_status === 'failed' ? 'text-red-600' : 'text-gray-600'
            }`}>
              {status?.settings?.last_sync_status || 'Never synced'}
            </span>
          </div>
        </div>

        {/* Sync Options */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Orders - Days Back
            </label>
            <select
              value={syncOptions.ordersDaysBack}
              onChange={(e) => setSyncOptions(prev => ({ ...prev, ordersDaysBack: parseInt(e.target.value) }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
              <option value={90}>90 days</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Metrics - Days Back
            </label>
            <select
              value={syncOptions.metricsDaysBack}
              onChange={(e) => setSyncOptions(prev => ({ ...prev, metricsDaysBack: parseInt(e.target.value) }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
            </select>
          </div>
        </div>

        {/* Sync Buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleSyncAll}
            disabled={syncing}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {syncing ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : (
              <RefreshCw className="w-5 h-5" />
            )}
            {syncing ? 'Syncing...' : 'Sync All Data'}
          </button>
          <button
            onClick={handleSyncOrders}
            disabled={syncing}
            className="px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition"
          >
            Sync Orders
          </button>
          <button
            onClick={handleSyncMetrics}
            disabled={syncing}
            className="px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition"
          >
            Sync Metrics
          </button>
        </div>
      </div>

      {/* Recent Sync Logs */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Sync History</h3>
        
        {status?.recent_logs?.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Started</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Completed</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Records</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {status.recent_logs.map((log, index) => (
                  <tr key={log.id || index} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(log.status)}
                        <span className="text-sm capitalize">{log.status}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 capitalize">
                      {log.sync_type?.replace('_', ' ')}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {formatDate(log.started_at)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {log.completed_at ? formatDate(log.completed_at) : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {log.records_synced || 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            No sync history yet. Click "Sync All Data" to start.
          </div>
        )}
      </div>
    </div>
  );
}
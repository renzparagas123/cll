import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccounts } from '../utils/AccountManager';
import { SyncService } from '../utils/CachedDataService';
import { useAuth } from '../App';

export default function Settings({ apiUrl }) {
  const navigate = useNavigate();
  const { accounts, loading: accountsLoading, refresh: refreshAccounts, removeAccount } = useAccounts();
  const { isAdmin, role, userProfile, hasPageAccess } = useAuth();
  
  const [syncStatus, setSyncStatus] = useState(null);
  const [loadingSyncStatus, setLoadingSyncStatus] = useState(true);
  const [removingAccount, setRemovingAccount] = useState(null);

  // Redirect if no access
  useEffect(() => {
    if (!hasPageAccess('settings')) {
      navigate('/orders', { replace: true });
    }
  }, [hasPageAccess, navigate]);

  // Fetch sync status on mount
  useEffect(() => {
    fetchSyncStatus();
  }, []);

  const fetchSyncStatus = async () => {
    setLoadingSyncStatus(true);
    try {
      const result = await SyncService.getStatus();
      if (result.success) {
        setSyncStatus(result.data);
      }
    } catch (err) {
      console.error('Failed to fetch sync status:', err);
    } finally {
      setLoadingSyncStatus(false);
    }
  };

  const handleAddStore = () => {
    navigate('/lazada-auth');
  };

  const handleRemoveAccount = async (accountId, accountName) => {
    if (!window.confirm(`Are you sure you want to remove "${accountName}"? This will also delete all cached data for this account.`)) {
      return;
    }

    setRemovingAccount(accountId);
    try {
      await removeAccount(accountId);
      alert('Account removed successfully');
    } catch (err) {
      alert('Failed to remove account: ' + err.message);
    } finally {
      setRemovingAccount(null);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTimeSince = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      {/* Connected Stores Section */}
      <div className="bg-white rounded-lg shadow-md mb-6">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Connected Stores</h2>
              <p className="text-sm text-gray-500 mt-1">
                {isAdmin ? 'Manage your Lazada seller accounts' : 'View connected Lazada seller accounts'}
              </p>
            </div>
            {isAdmin && (
              <button
                onClick={handleAddStore}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Add Store
              </button>
            )}
          </div>
          {!isAdmin && (
            <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-700">
              Only administrators can add or remove stores.
            </div>
          )}
        </div>

        <div className="p-6">
          {accountsLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : accounts.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <p className="text-gray-600 mb-4">No stores connected yet</p>
              <button
                onClick={handleAddStore}
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                Connect your first Lazada store →
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-lg">
                      {(account.account_name || account.seller_id)?.charAt(0)?.toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        {account.account_name || account.seller_id}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full uppercase font-medium">
                          {account.country}
                        </span>
                        <span className="text-xs text-gray-500">
                          Added {formatDate(account.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => handleRemoveAccount(account.id, account.account_name || account.seller_id)}
                      disabled={removingAccount === account.id}
                      className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
                    >
                      {removingAccount === account.id ? 'Removing...' : 'Remove'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sync Status Section */}
      <div className="bg-white rounded-lg shadow-md mb-6">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Sync Status</h2>
              <p className="text-sm text-gray-500 mt-1">Data synchronization information</p>
            </div>
            <button
              onClick={() => navigate('/sync')}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Open Sync Dashboard →
            </button>
          </div>
        </div>

        <div className="p-6">
          {loadingSyncStatus ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Last Sync Info */}
              <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-4 border border-purple-200">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Last Sync</p>
                    <p className="text-sm text-gray-600">
                      {syncStatus?.settings?.last_sync_at 
                        ? formatDate(syncStatus.settings.last_sync_at)
                        : 'Never synced'}
                    </p>
                  </div>
                </div>
                {syncStatus?.settings?.last_sync_at && (
                  <p className="text-sm text-purple-600 font-medium">
                    {getTimeSince(syncStatus.settings.last_sync_at)}
                  </p>
                )}
              </div>

              {/* Sync Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-blue-600">
                    {syncStatus?.counts?.orders || 0}
                  </p>
                  <p className="text-sm text-gray-600">Cached Orders</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-green-600">
                    {syncStatus?.counts?.campaigns || 0}
                  </p>
                  <p className="text-sm text-gray-600">Campaigns</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-purple-600">
                    {syncStatus?.counts?.campaign_metrics || 0}
                  </p>
                  <p className="text-sm text-gray-600">Metric Records</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-orange-600">
                    {syncStatus?.counts?.sync_logs || 0}
                  </p>
                  <p className="text-sm text-gray-600">Sync Logs</p>
                </div>
              </div>

              {/* Recent Sync Logs */}
              {syncStatus?.recent_logs && syncStatus.recent_logs.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Recent Sync Activity</h3>
                  <div className="space-y-2">
                    {syncStatus.recent_logs.slice(0, 5).map((log, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${
                            log.status === 'completed' ? 'bg-green-500' :
                            log.status === 'failed' ? 'bg-red-500' : 'bg-yellow-500'
                          }`}></span>
                          <span className="text-gray-900 capitalize">{log.sync_type?.replace('_', ' ')}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          {log.records_synced > 0 && (
                            <span className="text-gray-500">{log.records_synced} records</span>
                          )}
                          <span className="text-gray-400">{getTimeSince(log.completed_at || log.started_at)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* About Section */}
      <div className="bg-white rounded-lg shadow-md mb-6">
        <div className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">About</h2>
          <div className="space-y-3 text-sm text-gray-600">
            <p><strong>CLL Sellercenter</strong> - Lazada Seller Management Dashboard</p>
            <p>Version 2.0 with Data Caching System</p>
            <div className="pt-3 border-t border-gray-200">
              <p className="text-xs text-gray-400">
                Data is cached locally for faster performance. Use the Sync button to fetch fresh data from Lazada.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Your Profile Section */}
      <div className="bg-white rounded-lg shadow-md">
        <div className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Profile</h2>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-2xl">
              {userProfile?.full_name?.charAt(0)?.toUpperCase() || userProfile?.email?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <div>
              <p className="text-lg font-medium text-gray-900">{userProfile?.full_name || 'User'}</p>
              <p className="text-sm text-gray-500">{userProfile?.email}</p>
              <span className={`mt-2 inline-block px-2 py-1 text-xs font-medium rounded-full ${
                role === 'admin' ? 'bg-red-100 text-red-700' :
                role === 'warehouse' ? 'bg-blue-100 text-blue-700' :
                role === 'marketing' ? 'bg-green-100 text-green-700' :
                'bg-gray-100 text-gray-700'
              }`}>
                {role?.charAt(0).toUpperCase() + role?.slice(1)}
              </span>
            </div>
          </div>
          
          <div className="mt-4 pt-4 border-t border-gray-200">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Your Access</h3>
            <div className="text-sm text-gray-600">
              {role === 'admin' && (
                <p>Full access to all features including user management and store settings.</p>
              )}
              {role === 'warehouse' && (
                <p>Access to Orders and Fast Fulfilment pages. Cannot add stores or manage users.</p>
              )}
              {role === 'marketing' && (
                <p>Access to Data Insights page. Cannot add stores or manage users.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
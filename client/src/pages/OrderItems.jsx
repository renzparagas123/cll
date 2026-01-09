import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { useAccounts } from '../utils/AccountManager.jsx';
import { auth } from '../lib/supabase';
import { SyncService, CachedDataService } from '../utils/CachedDataService';

function OrderItems({ apiUrl }) {
  const navigate = useNavigate();
  const { accounts, activeAccount, loading: accountsLoading, refresh: refreshAccounts } = useAccounts();
  
  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [orderItems, setOrderItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [openDropdown, setOpenDropdown] = useState(null);
  const dropdownRef = useRef(null);

  // Sync state
  const [syncing, setSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);

  // Prevent multiple fetches
  const initialFetchDone = useRef(false);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [accountFilter, setAccountFilter] = useState('all');

  // Set default date filters to yesterday and today
  const getYesterday = () => {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    return date.toISOString().split('T')[0];
  };

  const getToday = () => {
    return new Date().toISOString().split('T')[0];
  };

  const [dateFrom, setDateFrom] = useState(getYesterday());
  const [dateTo, setDateTo] = useState(getToday());
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);

  // Statistics
  const [totalOrders, setTotalOrders] = useState(0);

  // Helper function to make authenticated API calls
  const authenticatedFetch = async (url, options = {}) => {
    const token = await auth.getAccessToken();
    
    if (!token) {
      throw new Error('Not authenticated');
    }

    return fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers,
      },
    });
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpenDropdown(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
      fetchCachedOrders();
    }
  }, [accountsLoading]); // Removed unnecessary dependencies

  useEffect(() => {
    filterOrders();
  }, [orders, searchQuery, statusFilter, accountFilter, dateTo]);

  // Sync orders to cache
  const handleSyncOrders = async () => {
    setSyncing(true);
    setError(null);

    try {
      const daysBack = dateFrom 
        ? Math.ceil((new Date() - new Date(dateFrom)) / (1000 * 60 * 60 * 24))
        : 30;

      const result = await SyncService.syncOrders(null, daysBack);
      
      if (result.success) {
        setLastSyncTime(new Date());
        alert(`Sync completed! ${result.data.total_synced} orders synced.`);
        // Refresh data after sync
        fetchCachedOrders();
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

  // Fetch cached orders from Supabase
  const fetchCachedOrders = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await CachedDataService.getOrders({
        accountId: accountFilter !== 'all' ? accountFilter : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        dateFrom,
        dateTo,
        limit: 1000
      });

      if (result.success) {
        const formattedOrders = result.data.map(order => ({
          ...order.raw_data,
          order_id: order.order_id,
          order_number: order.order_number,
          statuses: [order.status],
          price: order.price,
          currency: order.currency,
          created_at: order.order_created_at,
          _account_id: order.account_id,
          _account_name: order.lazada_accounts?.account_name || order.lazada_accounts?.seller_id,
          _account_country: order.lazada_accounts?.country,
          _synced_at: order.synced_at
        }));

        formattedOrders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        setOrders(formattedOrders);
        setTotalOrders(formattedOrders.length);
      } else {
        throw new Error(result.error || 'Failed to fetch cached orders');
      }
    } catch (err) {
      setError('Failed to fetch orders: ' + err.message);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filterOrders = () => {
    let filtered = [...orders];

    if (searchQuery) {
      filtered = filtered.filter(order =>
        order.order_number?.toString().toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.order_id?.toString().includes(searchQuery) ||
        order._account_name?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(order =>
        order.statuses?.[0]?.toLowerCase() === statusFilter.toLowerCase()
      );
    }

    if (accountFilter !== 'all') {
      filtered = filtered.filter(order => order._account_id === accountFilter);
    }

    if (dateTo) {
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter(order =>
        new Date(order.created_at) <= toDate
      );
    }

    setFilteredOrders(filtered);
    setCurrentPage(1);
  };

  const fetchOrderItems = async (orderId, accountId) => {
    setLoading(true);
    setError(null);

    try {
      const response = await authenticatedFetch(`${apiUrl}/lazada/order/${orderId}/items`, {
        headers: {
          'X-Account-Id': accountId,
        }
      });

      const data = await response.json();

      if (response.ok && (data.code === '0' || data.code === 0)) {
        setOrderItems(data.data || []);
      } else {
        setError(data.details || data.message || 'Failed to fetch order items');
      }
    } catch (err) {
      setError('Network error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectOrder = (orderId) => {
    setSelectedOrders(prev =>
      prev.includes(orderId)
        ? prev.filter(id => id !== orderId)
        : [...prev, orderId]
    );
  };

  const handleSelectAll = () => {
    if (selectedOrders.length === paginatedOrders.length) {
      setSelectedOrders([]);
    } else {
      setSelectedOrders(paginatedOrders.map(order => order.order_id));
    }
  };

  const handleRefresh = () => {
    setOrders([]);
    setSelectedOrders([]);
    setOrderItems([]);
    fetchCachedOrders();
  };

  const handleDateFilterApply = () => {
    if (!dateFrom) {
      alert('Please select a "Date From" to fetch orders');
      return;
    }
    fetchCachedOrders();
  };

  const clearDateFilters = () => {
    setDateFrom(getYesterday());
    setDateTo(getToday());
  };

  const handleActionClick = (orderId) => {
    setOpenDropdown(openDropdown === orderId ? null : orderId);
  };

  const handleArrangeShipment = async (order) => {
    console.log('Arrange shipment for:', order.order_id);
    setOpenDropdown(null);
  };

  const handleCancelOrder = async (order) => {
    if (window.confirm('Are you sure you want to cancel this order?')) {
      console.log('Cancel order:', order.order_id);
      setOpenDropdown(null);
    }
  };

  const exportCurrentPageToExcel = () => {
    if (paginatedOrders.length === 0) {
      alert('No orders to export on current page');
      return;
    }

    const exportData = paginatedOrders.map(order => ({
      'Account': order._account_name,
      'Country': order._account_country,
      'Order Number': order.order_number,
      'Order ID': order.order_id,
      'Status': order.statuses?.[0] || 'N/A',
      'Price': order.price,
      'Currency': order.currency || 'PHP',
      'Created Date': new Date(order.created_at).toLocaleDateString(),
      'Created Time': new Date(order.created_at).toLocaleTimeString(),
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);

    const colWidths = [
      { wch: 25 }, { wch: 10 }, { wch: 15 }, { wch: 12 },
      { wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 12 }
    ];
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, 'Orders');
    const filename = `Lazada_Orders_Page${currentPage}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  const exportAllFilteredToExcel = () => {
    if (filteredOrders.length === 0) {
      alert('No orders to export');
      return;
    }

    const exportData = filteredOrders.map(order => ({
      'Account': order._account_name,
      'Country': order._account_country,
      'Order Number': order.order_number,
      'Order ID': order.order_id,
      'Status': order.statuses?.[0] || 'N/A',
      'Price': order.price,
      'Currency': order.currency || 'PHP',
      'Created Date': new Date(order.created_at).toLocaleDateString(),
      'Created Time': new Date(order.created_at).toLocaleTimeString(),
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);

    const colWidths = [
      { wch: 25 }, { wch: 10 }, { wch: 15 }, { wch: 12 },
      { wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 12 }
    ];
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, 'All Orders');

    let dateRangeLabel = '';
    if (dateFrom && dateTo) {
      dateRangeLabel = `_${dateFrom}_to_${dateTo}`;
    } else if (dateFrom) {
      dateRangeLabel = `_from_${dateFrom}`;
    } else if (dateTo) {
      dateRangeLabel = `_until_${dateTo}`;
    }

    const filename = `Lazada_All_Accounts_Orders${dateRangeLabel}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  const exportOrderItemsToExcel = () => {
    if (orderItems.length === 0) {
      alert('No order items to export');
      return;
    }

    const exportData = orderItems.map(item => ({
      'Order Item ID': item.order_item_id,
      'Product Name': item.name,
      'SKU': item.sku,
      'Variation': item.variation || 'N/A',
      'Quantity': item.quantity || 1,
      'Unit Price': item.paid_price,
      'Currency': item.currency || 'PHP',
      'Status': item.status || 'N/A',
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);

    const colWidths = [
      { wch: 15 }, { wch: 30 }, { wch: 15 }, { wch: 20 },
      { wch: 10 }, { wch: 12 }, { wch: 8 }, { wch: 12 }
    ];
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, 'Order Items');
    const filename = `Lazada_Order_Items_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  // Pagination
  const indexOfLastOrder = currentPage * itemsPerPage;
  const indexOfFirstOrder = indexOfLastOrder - itemsPerPage;
  const paginatedOrders = filteredOrders.slice(indexOfFirstOrder, indexOfLastOrder);
  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);

  const uniqueStatuses = [...new Set(orders.flatMap(order => order.statuses || []))];

  // Only show full-page loading on initial load when we have no data
  if (accountsLoading && !initialFetchDone.current && orders.length === 0) {
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
    <div>
      {/* Current Data Header */}
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-4 mb-4 border border-purple-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
            </svg>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Current Data</h2>
              <p className="text-xs text-gray-500">
                {lastSyncTime ? `Last synced: ${lastSyncTime.toLocaleString()}` : 'Not synced yet'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSyncOrders}
              disabled={syncing}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-50 transition"
            >
              {syncing ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Syncing...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
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

      {/* Account Status Banner */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 mb-6 border border-blue-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Connected Accounts</h3>
            <div className="flex flex-wrap gap-3">
              {accounts.map(account => (
                <div key={account.id} className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg shadow-sm">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold text-sm">
                    {(account.account_name || account.seller_id)?.charAt(0)?.toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{account.account_name || account.seller_id}</p>
                    <p className="text-xs text-gray-500 uppercase">{account.country}</p>
                  </div>
                </div>
              ))}
            </div>
            {accounts.length === 0 && (
              <button
                onClick={() => navigate('/lazada-auth')}
                className="mt-2 text-blue-600 hover:text-blue-700 text-sm font-medium"
              >
                + Connect Lazada Account
              </button>
            )}
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-blue-600">{orders.length}</p>
            <p className="text-sm text-gray-600">Total Orders</p>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All Orders</h1>
          <p className="text-gray-600 mt-1">
            {loading ? 'Loading...' : `${filteredOrders.length} orders from ${accounts.length} account(s)`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => navigate('/lazada-auth')}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Add Account
          </button>
          <button
            onClick={exportCurrentPageToExcel}
            disabled={paginatedOrders.length === 0}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export Page
          </button>
          <button
            onClick={exportAllFilteredToExcel}
            disabled={filteredOrders.length === 0}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export All ({filteredOrders.length})
          </button>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="bg-white text-gray-700 px-4 py-2 rounded-lg border hover:bg-gray-50 disabled:opacity-50 transition"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
          <strong>Error: </strong>{error}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Filters</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
            <input
              type="text"
              placeholder="Order number, ID, or account..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Account Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Account</label>
            <select
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Accounts</option>
              {accounts.map(account => (
                <option key={account.id} value={account.id}>
                  {account.account_name || account.seller_id} ({account.country})
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Statuses</option>
              {uniqueStatuses.map(status => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>

          {/* Date From */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Date From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Date To */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Date To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Apply Date Filter */}
          <div className="flex items-end">
            <button
              onClick={handleDateFilterApply}
              disabled={loading}
              className="w-full px-3 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-md transition disabled:opacity-50"
            >
              Apply Date Filter
            </button>
          </div>
        </div>

        {/* Reset to Yesterday-Today Button */}
        <div className="mt-4">
          <button
            onClick={clearDateFilters}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50 transition"
          >
            Reset to Yesterday-Today
          </button>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden mb-6">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedOrders.length === paginatedOrders.length && paginatedOrders.length > 0}
                    onChange={handleSelectAll}
                    className="rounded"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Account
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Order Number
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Price
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created At
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading && orders.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-12 text-center text-gray-500">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    Loading orders...
                  </td>
                </tr>
              ) : paginatedOrders.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-12 text-center text-gray-500">
                    <div>
                      <p>No orders found.</p>
                      <button 
                        onClick={handleSyncOrders}
                        disabled={syncing}
                        className="mt-2 text-purple-600 hover:text-purple-700 underline"
                      >
                        {syncing ? 'Syncing...' : 'Sync orders now'}
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedOrders.map((order) => (
                  <tr key={`${order._account_id}-${order.order_id}`} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        checked={selectedOrders.includes(order.order_id)}
                        onChange={() => handleSelectOrder(order.order_id)}
                        className="rounded"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold text-xs">
                          {order._account_name?.charAt(0)?.toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {order._account_name}
                          </div>
                          <div className="text-xs text-gray-500 uppercase">
                            {order._account_country}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {order.order_number}
                      </div>
                      <div className="text-xs text-gray-500">
                        ID: {order.order_id}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                        {order.statuses?.[0] || 'N/A'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {order.price} {order.currency || 'PHP'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(order.created_at).toLocaleDateString()}
                      <br />
                      <span className="text-xs">
                        {new Date(order.created_at).toLocaleTimeString()}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm relative">
                      <button
                        onClick={() => fetchOrderItems(order.order_id, order._account_id)}
                        className="text-blue-600 hover:text-blue-900 font-medium mr-2"
                      >
                        View Items
                      </button>

                      <button
                        onClick={() => handleActionClick(order.order_id)}
                        className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                      >
                        More Actions
                        <svg className="ml-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {openDropdown === order.order_id && (
                        <div 
                          ref={dropdownRef}
                          className="absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-10"
                        >
                          <div className="py-1">
                            <button
                              onClick={() => handleArrangeShipment(order)}
                              className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                            >
                              Arrange Shipment
                            </button>
                            <button
                              onClick={() => console.log('Recreate Package')}
                              className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                            >
                              Recreate Package
                            </button>
                            <button
                              onClick={() => console.log('Request Extension')}
                              className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                            >
                              Request Extension
                            </button>
                            <button
                              onClick={() => console.log('Logistics Status')}
                              className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                            >
                              Logistics Status
                            </button>
                            <button
                              onClick={() => console.log('Print AWB')}
                              className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                            >
                              Print AWB
                            </button>
                            <button
                              onClick={() => console.log('Print Packing List')}
                              className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                            >
                              Print Packing List
                            </button>
                            <button
                              onClick={() => console.log('Print Pick List')}
                              className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                            >
                              Print Pick List
                            </button>
                            <button
                              onClick={() => console.log('Seller Note')}
                              className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                            >
                              Seller Note
                            </button>
                            <div className="border-t border-gray-100"></div>
                            <button
                              onClick={() => handleCancelOrder(order)}
                              className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
                            >
                              Cancel Order
                            </button>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200">
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  Showing <span className="font-medium">{indexOfFirstOrder + 1}</span> to{' '}
                  <span className="font-medium">
                    {Math.min(indexOfLastOrder, filteredOrders.length)}
                  </span>{' '}
                  of <span className="font-medium">{filteredOrders.length}</span> results
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  {[...Array(Math.min(totalPages, 5))].map((_, idx) => {
                    const pageNum = idx + 1;
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                          currentPage === pageNum
                            ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                            : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Next
                  </button>
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Order Items Table */}
      {orderItems.length > 0 && (
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-lg font-semibold">Order Items ({orderItems.length})</h2>
            <button
              onClick={exportOrderItemsToExcel}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition flex items-center gap-2 text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export Items
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Product
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    SKU
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Quantity
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Price
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {orderItems.map((item, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{item.name}</div>
                      {item.variation && (
                        <div className="text-xs text-gray-500">{item.variation}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.sku}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.quantity || 1}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {item.paid_price} {item.currency || 'PHP'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                        {item.status || 'N/A'}
                      </span> 
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default OrderItems;
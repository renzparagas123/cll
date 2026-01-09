// ============================================
// REACT HOOKS FOR CACHED DATA
// File: src/hooks/useCachedData.js
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { SyncService, CachedDataService } from '../utils/CachedDataService';

// ============================================
// USE CACHED ORDERS HOOK
// ============================================
export function useCachedOrders(initialParams = {}) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0 });
  const [params, setParams] = useState(initialParams);

  const fetchOrders = useCallback(async (newParams = {}) => {
    setLoading(true);
    setError(null);
    
    try {
      const queryParams = { ...params, ...newParams };
      const result = await CachedDataService.getOrders(queryParams);
      
      if (result.success) {
        setOrders(result.data);
        setPagination(result.pagination || { page: 1, limit: 50, total: result.data.length });
      } else {
        throw new Error(result.error || 'Failed to fetch orders');
      }
    } catch (err) {
      setError(err.message);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    fetchOrders();
  }, []);

  const refresh = useCallback((newParams = {}) => {
    setParams(prev => ({ ...prev, ...newParams }));
    return fetchOrders(newParams);
  }, [fetchOrders]);

  return {
    orders,
    loading,
    error,
    pagination,
    refresh,
    setPage: (page) => refresh({ page }),
    setFilters: (filters) => refresh({ ...filters, page: 1 })
  };
}

// ============================================
// USE CACHED CAMPAIGN METRICS HOOK
// ============================================
export function useCachedCampaignMetrics(initialParams = {}) {
  const [metrics, setMetrics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [params, setParams] = useState(initialParams);

  const fetchMetrics = useCallback(async (newParams = {}) => {
    setLoading(true);
    setError(null);
    
    try {
      const queryParams = { ...params, ...newParams };
      const result = await CachedDataService.getCampaignMetrics(queryParams);
      
      if (result.success) {
        setMetrics(result.data);
      } else {
        throw new Error(result.error || 'Failed to fetch metrics');
      }
    } catch (err) {
      setError(err.message);
      setMetrics([]);
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    fetchMetrics();
  }, []);

  const refresh = useCallback((newParams = {}) => {
    setParams(prev => ({ ...prev, ...newParams }));
    return fetchMetrics(newParams);
  }, [fetchMetrics]);

  // Calculate totals
  const totals = metrics.reduce((acc, m) => ({
    spend: acc.spend + (m.spend || 0),
    storeRevenue: acc.storeRevenue + (m.store_revenue || 0),
    productRevenue: acc.productRevenue + (m.product_revenue || 0),
    storeOrders: acc.storeOrders + (m.store_orders || 0),
    storeUnitSold: acc.storeUnitSold + (m.store_unit_sold || 0),
    impressions: acc.impressions + (m.impressions || 0),
    clicks: acc.clicks + (m.clicks || 0)
  }), {
    spend: 0,
    storeRevenue: 0,
    productRevenue: 0,
    storeOrders: 0,
    storeUnitSold: 0,
    impressions: 0,
    clicks: 0
  });

  return {
    metrics,
    totals,
    loading,
    error,
    refresh,
    setFilters: (filters) => refresh({ ...filters })
  };
}

// ============================================
// USE CACHED CAMPAIGNS HOOK
// ============================================
export function useCachedCampaigns(accountId = null) {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchCampaigns = useCallback(async (accId = accountId) => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await CachedDataService.getCampaigns(accId);
      
      if (result.success) {
        setCampaigns(result.data);
      } else {
        throw new Error(result.error || 'Failed to fetch campaigns');
      }
    } catch (err) {
      setError(err.message);
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    fetchCampaigns();
  }, [accountId]);

  return {
    campaigns,
    loading,
    error,
    refresh: fetchCampaigns
  };
}

// ============================================
// USE SYNC STATUS HOOK
// ============================================
export function useSyncStatus() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const result = await SyncService.getStatus();
      if (result.success) {
        setStatus(result.data);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, []);

  // Sync functions
  const syncAll = useCallback(async (options = {}) => {
    setSyncing(true);
    setError(null);
    try {
      const result = await SyncService.syncAll(options);
      await fetchStatus(); // Refresh status after sync
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setSyncing(false);
    }
  }, [fetchStatus]);

  const syncOrders = useCallback(async (accountId, daysBack) => {
    setSyncing(true);
    setError(null);
    try {
      const result = await SyncService.syncOrders(accountId, daysBack);
      await fetchStatus();
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setSyncing(false);
    }
  }, [fetchStatus]);

  const syncCampaignMetrics = useCallback(async (accountId, daysBack) => {
    setSyncing(true);
    setError(null);
    try {
      const result = await SyncService.syncCampaignMetrics(accountId, daysBack);
      await fetchStatus();
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setSyncing(false);
    }
  }, [fetchStatus]);

  return {
    status,
    loading,
    syncing,
    error,
    refresh: fetchStatus,
    syncAll,
    syncOrders,
    syncCampaignMetrics
  };
}

export default {
  useCachedOrders,
  useCachedCampaignMetrics,
  useCachedCampaigns,
  useSyncStatus
};
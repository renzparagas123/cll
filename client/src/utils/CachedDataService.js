// ============================================
// CACHED DATA SERVICE - Frontend reads from Supabase cache
// File: src/utils/CachedDataService.js
// Manual sync only - saves last sync time to localStorage
// ============================================

import { auth } from '../lib/supabase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// LocalStorage keys for sync time tracking
const SYNC_TIME_KEYS = {
  ORDERS: 'lastSync_orders',
  CAMPAIGNS: 'lastSync_campaigns',
  METRICS: 'lastSync_metrics',
  ALL: 'lastSync_all',
};

// Helper for authenticated fetch
async function authenticatedFetch(url, options = {}) {
  const token = await auth.getAccessToken();
  
  if (!token) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || error.message || 'Request failed');
  }

  return response.json();
}

// Save sync time to localStorage
function saveSyncTime(key) {
  const now = new Date().toISOString();
  localStorage.setItem(key, now);
  localStorage.setItem(SYNC_TIME_KEYS.ALL, now); // Always update the general "last sync"
  return now;
}

// Get sync time from localStorage
export function getLastSyncTime(type = 'all') {
  const key = type === 'orders' ? SYNC_TIME_KEYS.ORDERS :
              type === 'campaigns' ? SYNC_TIME_KEYS.CAMPAIGNS :
              type === 'metrics' ? SYNC_TIME_KEYS.METRICS :
              SYNC_TIME_KEYS.ALL;
  return localStorage.getItem(key);
}

// Format sync time for display
export function formatSyncTime(isoString) {
  if (!isoString) return 'Never';
  
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  // If less than 1 minute ago
  if (diffMins < 1) return 'Just now';
  
  // If less than 1 hour ago
  if (diffMins < 60) return `${diffMins}m ago`;
  
  // If less than 24 hours ago
  if (diffHours < 24) return `${diffHours}h ago`;
  
  // If less than 7 days ago
  if (diffDays < 7) return `${diffDays}d ago`;
  
  // Otherwise show date
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Get formatted last sync time
export function getFormattedLastSync(type = 'all') {
  return formatSyncTime(getLastSyncTime(type));
}

// ============================================
// SYNC OPERATIONS
// ============================================

export const SyncService = {
  // Sync all data (orders, campaigns, metrics)
  async syncAll(options = {}) {
    const result = await authenticatedFetch(`${API_URL}/sync/all`, {
      method: 'POST',
      body: JSON.stringify(options)
    });
    
    if (result.success) {
      saveSyncTime(SYNC_TIME_KEYS.ALL);
      saveSyncTime(SYNC_TIME_KEYS.ORDERS);
      saveSyncTime(SYNC_TIME_KEYS.CAMPAIGNS);
      saveSyncTime(SYNC_TIME_KEYS.METRICS);
    }
    
    return result;
  },

  // Sync orders only
  async syncOrders(accountId = null, daysBack = 30) {
    const result = await authenticatedFetch(`${API_URL}/sync/orders`, {
      method: 'POST',
      body: JSON.stringify({ accountId, daysBack })
    });
    
    if (result.success) {
      saveSyncTime(SYNC_TIME_KEYS.ORDERS);
    }
    
    return result;
  },

  // Sync campaigns only
  async syncCampaigns(accountId = null) {
    const result = await authenticatedFetch(`${API_URL}/sync/campaigns`, {
      method: 'POST',
      body: JSON.stringify({ accountId })
    });
    
    if (result.success) {
      saveSyncTime(SYNC_TIME_KEYS.CAMPAIGNS);
    }
    
    return result;
  },

  // Sync campaign metrics only
  async syncCampaignMetrics(accountId = null, daysBack = 7) {
    const result = await authenticatedFetch(`${API_URL}/sync/campaign-metrics`, {
      method: 'POST',
      body: JSON.stringify({ accountId, daysBack })
    });
    
    if (result.success) {
      saveSyncTime(SYNC_TIME_KEYS.METRICS);
    }
    
    return result;
  },

  // Get sync status from API
  async getStatus() {
    return authenticatedFetch(`${API_URL}/sync/status`);
  },
  
  // Get last sync times from localStorage (fast, no API call)
  getLocalSyncTimes() {
    return {
      all: getLastSyncTime('all'),
      orders: getLastSyncTime('orders'),
      campaigns: getLastSyncTime('campaigns'),
      metrics: getLastSyncTime('metrics'),
      formatted: {
        all: getFormattedLastSync('all'),
        orders: getFormattedLastSync('orders'),
        campaigns: getFormattedLastSync('campaigns'),
        metrics: getFormattedLastSync('metrics'),
      }
    };
  }
};

// ============================================
// CACHED DATA RETRIEVAL
// ============================================

export const CachedDataService = {
  // Get cached orders
  async getOrders(params = {}) {
    const queryParams = new URLSearchParams();
    
    if (params.accountId) queryParams.set('accountId', params.accountId);
    if (params.status) queryParams.set('status', params.status);
    if (params.dateFrom) queryParams.set('dateFrom', params.dateFrom);
    if (params.dateTo) queryParams.set('dateTo', params.dateTo);
    if (params.page) queryParams.set('page', params.page);
    if (params.limit) queryParams.set('limit', params.limit);
    
    return authenticatedFetch(`${API_URL}/sync/data/orders?${queryParams}`);
  },

  // Get cached campaigns
  async getCampaigns(accountId = null) {
    const queryParams = accountId ? `?accountId=${accountId}` : '';
    return authenticatedFetch(`${API_URL}/sync/data/campaigns${queryParams}`);
  },

  // Get cached campaign metrics
  async getCampaignMetrics(params = {}) {
    const queryParams = new URLSearchParams();
    
    if (params.accountId) queryParams.set('accountId', params.accountId);
    if (params.campaignId) queryParams.set('campaignId', params.campaignId);
    if (params.dateFrom) queryParams.set('dateFrom', params.dateFrom);
    if (params.dateTo) queryParams.set('dateTo', params.dateTo);
    
    return authenticatedFetch(`${API_URL}/sync/data/campaign-metrics?${queryParams}`);
  }
};

export default { SyncService, CachedDataService, getLastSyncTime, getFormattedLastSync };
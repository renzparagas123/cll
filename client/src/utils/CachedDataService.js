// ============================================
// CACHED DATA SERVICE - Frontend reads from Supabase cache
// File: src/utils/CachedDataService.js
// Manual sync only - no cron job
// ============================================

import { auth } from '../lib/supabase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

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

// ============================================
// SYNC OPERATIONS
// ============================================

export const SyncService = {
  // Sync all data (orders, campaigns, metrics)
  async syncAll(options = {}) {
    return authenticatedFetch(`${API_URL}/sync/all`, {
      method: 'POST',
      body: JSON.stringify(options)
    });
  },

  // Sync orders only
  async syncOrders(accountId = null, daysBack = 30) {
    return authenticatedFetch(`${API_URL}/sync/orders`, {
      method: 'POST',
      body: JSON.stringify({ accountId, daysBack })
    });
  },

  // Sync campaigns only
  async syncCampaigns(accountId = null) {
    return authenticatedFetch(`${API_URL}/sync/campaigns`, {
      method: 'POST',
      body: JSON.stringify({ accountId })
    });
  },

  // Sync campaign metrics only
  async syncCampaignMetrics(accountId = null, daysBack = 7) {
    return authenticatedFetch(`${API_URL}/sync/campaign-metrics`, {
      method: 'POST',
      body: JSON.stringify({ accountId, daysBack })
    });
  },

  // Get sync status
  async getStatus() {
    return authenticatedFetch(`${API_URL}/sync/status`);
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

export default { SyncService, CachedDataService };
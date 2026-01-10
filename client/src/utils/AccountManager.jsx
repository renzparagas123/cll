// utils/AccountManager.jsx
// Updated AccountManager that syncs with backend database
// Accounts persist across devices via Supabase

import { useState, useEffect, useCallback, useRef } from 'react';
import { auth } from '../lib/supabase';

const API_URL = import.meta.env.VITE_API_URL || '/api';

// Helper to make authenticated API calls
async function apiCall(endpoint, options = {}) {
  const token = await auth.getAccessToken();
  
  if (!token) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || data.message || 'API request failed');
  }

  return data;
}

export const AccountManager = {
  // Local cache for performance
  _cache: {
    accounts: null,
    activeAccountId: null,
    lastFetch: null,
  },

  // Cache duration (5 minutes)
  CACHE_DURATION: 5 * 60 * 1000,

  // Check if cache is valid
  _isCacheValid() {
    return (
      this._cache.accounts !== null &&
      this._cache.lastFetch !== null &&
      Date.now() - this._cache.lastFetch < this.CACHE_DURATION
    );
  },

  // Clear cache
  clearCache() {
    this._cache = {
      accounts: null,
      activeAccountId: null,
      lastFetch: null,
    };
    // Also clear localStorage backup
    localStorage.removeItem('lazada_accounts_cache');
    localStorage.removeItem('lazada_active_account');
  },

  // Get all accounts (from backend)
  async getAccounts(forceRefresh = false) {
    // Return cached data if valid and not forcing refresh
    if (!forceRefresh && this._isCacheValid()) {
      return this._cache.accounts;
    }

    try {
      const data = await apiCall('/accounts');
      
      // Update cache
      this._cache.accounts = data.accounts;
      this._cache.activeAccountId = data.activeAccountId;
      this._cache.lastFetch = Date.now();

      // Also store in localStorage as backup
      localStorage.setItem('lazada_accounts_cache', JSON.stringify(data.accounts));
      if (data.activeAccountId) {
        localStorage.setItem('lazada_active_account', data.activeAccountId);
      }

      return data.accounts;
    } catch (error) {
      console.error('Failed to fetch accounts:', error);
      
      // Fall back to localStorage cache if API fails
      const cached = localStorage.getItem('lazada_accounts_cache');
      if (cached) {
        return JSON.parse(cached);
      }
      
      return [];
    }
  },

  // Get accounts synchronously (from cache/localStorage)
  // Use this for initial render, then call getAccounts() to refresh
  getAccountsSync() {
    if (this._cache.accounts) {
      return this._cache.accounts;
    }

    const cached = localStorage.getItem('lazada_accounts_cache');
    return cached ? JSON.parse(cached) : [];
  },

  // Add account is now handled by the callback flow
  // The backend saves the account during token exchange
  // This method just refreshes the cache
  async refreshAfterAdd() {
    return this.getAccounts(true);
  },

  // Remove an account
  async removeAccount(accountId) {
    try {
      await apiCall(`/accounts/${accountId}`, { method: 'DELETE' });
      
      // Clear cache to force refresh
      this.clearCache();
      
      // Refresh accounts
      return this.getAccounts(true);
    } catch (error) {
      console.error('Failed to remove account:', error);
      throw error;
    }
  },

  // Set active account
  async setActiveAccount(accountId) {
    try {
      const data = await apiCall(`/accounts/${accountId}/activate`, {
        method: 'POST',
      });

      // Update cache
      this._cache.activeAccountId = accountId;
      localStorage.setItem('lazada_active_account', accountId);

      // Also set legacy localStorage keys for backward compatibility
      const account = data.account;
      if (account) {
        localStorage.setItem('lazada_access_token', account.access_token);
        localStorage.setItem('lazada_refresh_token', account.refresh_token);
        localStorage.setItem('lazada_country', account.country);
        localStorage.setItem('lazada_account', account.account_name);
      }

      return account;
    } catch (error) {
      console.error('Failed to set active account:', error);
      throw error;
    }
  },

  // Get active account ID
  getActiveAccountId() {
    if (this._cache.activeAccountId) {
      return this._cache.activeAccountId;
    }
    return localStorage.getItem('lazada_active_account');
  },

  // Get active account data
  async getActiveAccount() {
    const activeId = this.getActiveAccountId();
    if (!activeId) return null;

    const accounts = await this.getAccounts();
    return accounts.find((acc) => acc.id === activeId) || null;
  },

  // Get active account synchronously (from cache)
  getActiveAccountSync() {
    const activeId = this.getActiveAccountId();
    if (!activeId) return null;

    const accounts = this.getAccountsSync();
    return accounts.find((acc) => acc.id === activeId) || null;
  },

  // Check if token is expired
  isTokenExpired(account) {
    if (!account?.token_expires_at) return true;
    return new Date(account.token_expires_at) < new Date();
  },

  // Clear all (logout)
  async clearAll() {
    this.clearCache();
    localStorage.removeItem('lazada_access_token');
    localStorage.removeItem('lazada_refresh_token');
    localStorage.removeItem('lazada_country');
    localStorage.removeItem('lazada_account');
  },

  // Get access token for API calls (with auto-refresh)
  async getAccessToken(accountId = null) {
    const targetAccountId = accountId || this.getActiveAccountId();
    
    if (!targetAccountId) {
      throw new Error('No account selected');
    }

    const accounts = await this.getAccounts();
    const account = accounts.find((acc) => acc.id === targetAccountId);

    if (!account) {
      throw new Error('Account not found');
    }

    // Token refresh is handled by the backend middleware
    // Just return the current token
    return account.access_token;
  },
};

// React hook for using AccountManager
export function useAccounts() {
  // Initialize with cached data
  const cachedAccounts = AccountManager.getAccountsSync();
  const cachedActive = AccountManager.getActiveAccountSync();
  
  const [accounts, setAccounts] = useState(cachedAccounts);
  const [activeAccount, setActiveAccount] = useState(cachedActive);
  const [loading, setLoading] = useState(false); // Start with false - never show loading if we have cache
  const [error, setError] = useState(null);
  
  // Track if initial fetch is done to prevent re-fetching on tab switch
  const initialFetchDone = useRef(false);
  const isMounted = useRef(true);

  const refresh = useCallback(async (force = false) => {
    // Never set loading true if we already have accounts
    if (accounts.length === 0) {
      setLoading(true);
    }
    
    setError(null);
    try {
      const fetchedAccounts = await AccountManager.getAccounts(force);
      if (isMounted.current) {
        setAccounts(fetchedAccounts);
        
        const active = await AccountManager.getActiveAccount();
        if (isMounted.current) {
          setActiveAccount(active);
        }
      }
    } catch (err) {
      if (isMounted.current) {
        setError(err.message);
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }, [accounts.length]);

  // Only fetch once on mount - not on every render or tab switch
  useEffect(() => {
    isMounted.current = true;
    
    // Skip if already fetched
    if (initialFetchDone.current) return;
    initialFetchDone.current = true;
    
    // If we have cached data, just do a silent background refresh
    if (cachedAccounts.length > 0) {
      // Don't set loading - just refresh in background
      AccountManager.getAccounts(false).then(fetchedAccounts => {
        if (isMounted.current) {
          setAccounts(fetchedAccounts);
          AccountManager.getActiveAccount().then(active => {
            if (isMounted.current) {
              setActiveAccount(active);
            }
          });
        }
      }).catch(err => {
        console.error('Background refresh failed:', err);
      });
    } else {
      // No cached data, do full refresh with loading
      setLoading(true);
      refresh(true);
    }
    
    return () => {
      isMounted.current = false;
    };
  }, []); // Empty dependency array - only run on mount

  const switchAccount = useCallback(async (accountId) => {
    setLoading(true);
    try {
      const account = await AccountManager.setActiveAccount(accountId);
      setActiveAccount(account);
      await refresh(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  const removeAccount = useCallback(async (accountId) => {
    setLoading(true);
    try {
      await AccountManager.removeAccount(accountId);
      await refresh(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  return {
    accounts,
    activeAccount,
    loading,
    error,
    refresh,
    switchAccount,
    removeAccount,
  };
}

export default AccountManager;
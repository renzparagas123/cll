// pages/LazadaAuth.jsx
// Page for connecting Lazada seller accounts
// User must be logged in to access this page

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccounts } from '../utils/AccountManager';

function LazadaAuth({ apiUrl }) {
  const navigate = useNavigate();
  const [authUrl, setAuthUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const { accounts, activeAccount, loading: accountsLoading, switchAccount, removeAccount } = useAccounts();

  useEffect(() => {
    fetchAuthUrl();
  }, []);

  const fetchAuthUrl = async () => {
    try {
      const response = await fetch(`${apiUrl}/lazada/auth-url`);
      const data = await response.json();
      setAuthUrl(data.authUrl);
    } catch (err) {
      setError('Failed to get authorization URL');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = () => {
    if (authUrl) {
      window.location.href = authUrl;
    }
  };

  const handleSelectAccount = async (accountId) => {
    await switchAccount(accountId);
    navigate('/orders');
  };

  const handleRemoveAccount = async (accountId, e) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to remove this account?')) {
      await removeAccount(accountId);
    }
  };

  if (loading || accountsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Lazada Accounts</h1>
          <p className="text-gray-600">Connect and manage your Lazada seller accounts</p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {/* Connected Accounts */}
        {accounts.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Connected Accounts</h2>
            <div className="space-y-3">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  onClick={() => handleSelectAccount(account.id)}
                  className={`flex items-center justify-between p-4 rounded-lg border-2 cursor-pointer transition-all ${
                    activeAccount?.id === account.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center space-x-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      activeAccount?.id === account.id ? 'bg-blue-500' : 'bg-gray-200'
                    }`}>
                      <svg className={`w-5 h-5 ${activeAccount?.id === account.id ? 'text-white' : 'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{account.account_name || account.seller_id}</p>
                      <p className="text-sm text-gray-500">
                        {account.country} • Seller ID: {account.seller_id}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    {activeAccount?.id === account.id && (
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                        Active
                      </span>
                    )}
                    <button
                      onClick={(e) => handleRemoveAccount(account.id, e)}
                      className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                      title="Remove account"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add New Account */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {accounts.length > 0 ? 'Add Another Account' : 'Connect Your First Account'}
          </h2>
          
          <p className="text-gray-600 mb-6">
            Click the button below to authorize access to your Lazada seller account.
            Your credentials will be securely stored and synced across all your devices.
          </p>

          <button
            onClick={handleConnect}
            disabled={!authUrl}
            className="w-full py-4 px-6 bg-gradient-to-r from-orange-500 to-orange-600 text-white font-semibold rounded-lg hover:from-orange-600 hover:to-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
            </svg>
            <span>Connect Lazada Account</span>
          </button>

          <p className="text-xs text-gray-400 mt-4 text-center">
            You will be redirected to Lazada to authorize access
          </p>
        </div>

        {/* Back to Dashboard */}
        {accounts.length > 0 && (
          <div className="text-center mt-6">
            <button
              onClick={() => navigate('/dashboard')}
              className="text-blue-600 hover:text-blue-700 font-medium"
            >
              ← Back to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default LazadaAuth;
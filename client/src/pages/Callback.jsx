// pages/Callback.jsx
// Updated to save Lazada account to database via authenticated API

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { auth } from '../lib/supabase';
import { AccountManager } from '../utils/AccountManager';

function Callback({ apiUrl }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('Processing authentication...');
  const [error, setError] = useState(null);

  useEffect(() => {
    console.log('=== CALLBACK PAGE LOADED ===');
    console.log('Current URL:', window.location.href);
    
    const code = searchParams.get('code');
    const errorParam = searchParams.get('error');

    if (errorParam) {
      console.error('Authorization error:', errorParam);
      setError(`Authorization failed: ${errorParam}`);
      setTimeout(() => navigate('/lazada-auth', { replace: true }), 3000);
      return;
    }

    if (!code) {
      console.error('No authorization code found');
      setError('No authorization code found');
      setTimeout(() => navigate('/lazada-auth', { replace: true }), 3000);
      return;
    }

    console.log('Authorization code received:', code);
    exchangeToken(code);
  }, [searchParams, navigate]);

  const exchangeToken = async (code) => {
    try {
      setStatus('Verifying your session...');
      
      // Get the user's access token for API authentication
      const token = await auth.getAccessToken();
      
      if (!token) {
        setError('You must be logged in to connect a Lazada account');
        setTimeout(() => navigate('/login', { replace: true }), 3000);
        return;
      }

      setStatus('Exchanging authorization code...');
      console.log('Calling API:', `${apiUrl}/lazada/token`);
      
      const response = await fetch(`${apiUrl}/lazada/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`, // User auth token
        },
        body: JSON.stringify({ code })
      });

      const data = await response.json();
      console.log('Token exchange response:', data);

      if (response.ok && data.success) {
        setStatus('Success! Account saved...');
        
        // The backend has already saved the account to the database
        // Just refresh the local cache
        await AccountManager.refreshAfterAdd();

        // Set this as the active account if we have an account ID
        if (data.account?.id) {
          await AccountManager.setActiveAccount(data.account.id);
        }

        console.log('Account saved! Redirecting to orders...');
        setStatus('Redirecting to your orders...');

        setTimeout(() => {
          navigate('/orders', { replace: true });
        }, 1000);
      } else {
        console.error('Token exchange failed:', data);
        setError(`Authentication failed: ${data.error || data.details || 'Unknown error'}`);
        setTimeout(() => navigate('/lazada-auth', { replace: true }), 3000);
      }
    } catch (err) {
      console.error('Network error:', err);
      setError(`Network error: ${err.message}`);
      setTimeout(() => navigate('/lazada-auth', { replace: true }), 3000);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full text-center">
        {error ? (
          <>
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Connection Failed</h2>
            <p className="text-red-600">{error}</p>
            <p className="text-xs text-gray-400 mt-4">Redirecting...</p>
          </>
        ) : (
          <>
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Connecting to Lazada</h2>
            <p className="text-gray-600">{status}</p>
            <p className="text-xs text-gray-400 mt-4">This may take a few seconds...</p>
          </>
        )}
      </div>
    </div>
  );
}

export default Callback;
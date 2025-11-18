import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

function LazadaAuth({ apiUrl }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Check if we got the authorization code from Lazada
    const code = searchParams.get('code');
    
    if (code) {
      exchangeCodeForToken(code);
    }
  }, [searchParams]);

  const exchangeCodeForToken = async (code) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${apiUrl}/lazada/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code }),
      });

      const data = await response.json();

      if (response.ok) {
        // Store tokens securely (consider using httpOnly cookies in production)
        localStorage.setItem('lazada_access_token', data.access_token);
        localStorage.setItem('lazada_refresh_token', data.refresh_token);
        localStorage.setItem('lazada_expires_in', data.expires_in);
        
        // Redirect to dashboard
        navigate('/dashboard');
      } else {
        setError(data.error || 'Failed to authenticate');
      }
    } catch (err) {
      setError('Network error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${apiUrl}/lazada/auth-url`);
      const data = await response.json();
      
      // Redirect to Lazada authorization page
      window.location.href = data.authUrl;
    } catch (err) {
      setError('Failed to get authorization URL');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
        <h1 className="text-2xl font-bold mb-6 text-center">Lazada Integration</h1>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}
        
        {loading ? (
          <div className="text-center">
            <p>Processing...</p>
          </div>
        ) : (
          <button
            onClick={handleLogin}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 transition"
          >
            Connect to Lazada
          </button>
        )}
      </div>
    </div>
  );
}

export default LazadaAuth;
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import LazadaAuth from './utils/lazadaAuth.js';
import {
  verifySupabaseToken,
  saveLazadaAccount,
  getUserLazadaAccounts,
  getLazadaAccount,
  updateLazadaTokens,
  deleteLazadaAccount,
  getUserPreferences,
  setActiveAccount
} from './utils/supabase.js';
import syncRoutes from './routes/syncRoutes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize Lazada Auth
const lazadaAuth = new LazadaAuth(
    process.env.LAZADA_APP_KEY,
    process.env.LAZADA_APP_SECRET,
    process.env.LAZADA_API_URL
);

// CORS configuration
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://cloudecomm-web.github.io']
    : ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Account-Id', 'X-Lazada-Token']
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// ============================================
// MIDDLEWARE - Verify Supabase User Token
// ============================================

const verifyUser = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Please provide Authorization header with Bearer token'
    });
  }

  const token = authHeader.replace('Bearer ', '');
  const user = await verifySupabaseToken(token);

  if (!user) {
    return res.status(401).json({
      error: 'Invalid or expired token',
      message: 'Please login again'
    });
  }

  req.user = user;
  next();
};

// ============================================
// MIDDLEWARE - Verify Lazada Access Token (for Lazada API calls)
// ============================================

const verifyLazadaToken = (req, res, next) => {
  // Lazada token can come from header or we'll get it from the account
  const lazadaToken = req.headers['x-lazada-token'];
  
  if (lazadaToken) {
    req.accessToken = lazadaToken;
  }
  
  next();
};

// ============================================
// BASIC ENDPOINTS
// ============================================

app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

app.get('/api/test', (req, res) => {
    res.json({
        message: 'API is working!',
        timestamp: new Date().toISOString()
    });
});

// ============================================
// SYNC ROUTES (Data Caching)
// ============================================
app.use('/api/sync', syncRoutes);

// ============================================
// LAZADA AUTHENTICATION ENDPOINTS
// ============================================

// Get Lazada authorization URL
app.get('/api/lazada/auth-url', (req, res) => {
    try {
        const redirectUri = process.env.NODE_ENV === 'production'
            ? 'https://cloudecomm-web.github.io/cll/callback'
            : 'http://localhost:5173/callback';

        const authUrl = `https://auth.lazada.com/oauth/authorize?response_type=code&force_auth=true&redirect_uri=${encodeURIComponent(redirectUri)}&client_id=${process.env.LAZADA_APP_KEY}`;

        res.json({
            authUrl,
            redirectUri,
            clientId: process.env.LAZADA_APP_KEY
        });
    } catch (error) {
        res.status(500).json({
            error: 'Failed to generate auth URL',
            details: error.message
        });
    }
});

// Exchange authorization code for access token AND save to database
app.post('/api/lazada/token', verifyUser, async (req, res) => {
    try {
        const { code } = req.body;

        if (!code) {
            return res.status(400).json({
                error: 'Authorization code is required'
            });
        }

        console.log('Exchanging code for token...');
        const tokenData = await lazadaAuth.createAccessToken(code);

        if (tokenData.code !== '0' && tokenData.code !== 0) {
            console.error('Token exchange failed:', tokenData);
            return res.status(400).json({
                error: 'Failed to exchange token',
                details: tokenData.message || 'Unknown error',
                lazada_code: tokenData.code
            });
        }

        console.log('Token received successfully, saving to database...');
        
        // Extract seller_id from country_user_info
        const sellerId = tokenData.country_user_info?.[0]?.seller_id || tokenData.account;
        
        // Save to Supabase database
        const savedAccount = await saveLazadaAccount(req.user.id, {
            seller_id: sellerId,
            account_name: tokenData.account,
            country: tokenData.country,
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expires_in: tokenData.expires_in,
            country_user_info: tokenData.country_user_info,
            account_platform: tokenData.account_platform
        });

        console.log('Account saved to database:', savedAccount.id);

        res.json({
            success: true,
            account: savedAccount,
            // Also return raw token data for backward compatibility
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expires_in: tokenData.expires_in,
            refresh_expires_in: tokenData.refresh_expires_in,
            account_name: tokenData.account,
            country: tokenData.country,
            country_user_info: tokenData.country_user_info,
            account_platform: tokenData.account_platform
        });
    } catch (error) {
        console.error('Token exchange error:', error);
        res.status(500).json({
            error: 'Failed to get access token',
            details: error.response?.data || error.message
        });
    }
});

// Refresh access token
app.post('/api/lazada/refresh-token', verifyUser, async (req, res) => {
    try {
        const { refreshToken, accountId } = req.body;

        if (!refreshToken) {
            return res.status(400).json({
                error: 'Refresh token is required'
            });
        }

        console.log('Refreshing token...');
        const tokenData = await lazadaAuth.refreshAccessToken(refreshToken);

        if (tokenData.code !== '0' && tokenData.code !== 0) {
            return res.status(400).json({
                error: 'Failed to refresh token',
                details: tokenData.message,
                lazada_code: tokenData.code
            });
        }

        // Update tokens in database if accountId provided
        if (accountId) {
            await updateLazadaTokens(req.user.id, accountId, {
                access_token: tokenData.access_token,
                refresh_token: tokenData.refresh_token,
                expires_in: tokenData.expires_in
            });
            console.log('Tokens updated in database');
        }

        res.json({
            success: true,
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expires_in: tokenData.expires_in,
            refresh_expires_in: tokenData.refresh_expires_in
        });
    } catch (error) {
        console.error('Token refresh error:', error);
        res.status(500).json({
            error: 'Failed to refresh token',
            details: error.response?.data || error.message
        });
    }
});

// ============================================
// ACCOUNT MANAGEMENT ENDPOINTS (NEW!)
// ============================================

// Get all user's Lazada accounts
app.get('/api/accounts', verifyUser, async (req, res) => {
    try {
        const accounts = await getUserLazadaAccounts(req.user.id);
        const preferences = await getUserPreferences(req.user.id);
        
        res.json({
            success: true,
            accounts,
            activeAccountId: preferences?.active_account_id || null
        });
    } catch (error) {
        console.error('Error fetching accounts:', error);
        res.status(500).json({
            error: 'Failed to fetch accounts',
            details: error.message
        });
    }
});

// Get a specific account
app.get('/api/accounts/:accountId', verifyUser, async (req, res) => {
    try {
        const account = await getLazadaAccount(req.user.id, req.params.accountId);
        
        if (!account) {
            return res.status(404).json({
                error: 'Account not found'
            });
        }
        
        res.json({
            success: true,
            account
        });
    } catch (error) {
        console.error('Error fetching account:', error);
        res.status(500).json({
            error: 'Failed to fetch account',
            details: error.message
        });
    }
});

// Set active account
app.post('/api/accounts/:accountId/activate', verifyUser, async (req, res) => {
    try {
        const account = await getLazadaAccount(req.user.id, req.params.accountId);
        
        if (!account) {
            return res.status(404).json({
                error: 'Account not found'
            });
        }
        
        await setActiveAccount(req.user.id, req.params.accountId);
        
        res.json({
            success: true,
            account,
            message: 'Account activated successfully'
        });
    } catch (error) {
        console.error('Error activating account:', error);
        res.status(500).json({
            error: 'Failed to activate account',
            details: error.message
        });
    }
});

// Delete an account
app.delete('/api/accounts/:accountId', verifyUser, async (req, res) => {
    try {
        await deleteLazadaAccount(req.user.id, req.params.accountId);
        
        res.json({
            success: true,
            message: 'Account removed successfully'
        });
    } catch (error) {
        console.error('Error deleting account:', error);
        res.status(500).json({
            error: 'Failed to delete account',
            details: error.message
        });
    }
});

// ============================================
// MIDDLEWARE - Get Lazada Token from Account
// ============================================

const withLazadaToken = async (req, res, next) => {
  // First check if token is directly provided
  if (req.headers['x-lazada-token']) {
    req.accessToken = req.headers['x-lazada-token'];
    return next();
  }

  // Otherwise, get from active account or specified account
  const accountId = req.headers['x-account-id'] || req.query.accountId;
  
  if (!accountId) {
    // Try to get active account
    const preferences = await getUserPreferences(req.user.id);
    if (!preferences?.active_account_id) {
      return res.status(400).json({
        error: 'No account specified',
        message: 'Please specify an account or set an active account'
      });
    }
    req.accountId = preferences.active_account_id;
  } else {
    req.accountId = accountId;
  }

  const account = await getLazadaAccount(req.user.id, req.accountId);
  
  if (!account) {
    return res.status(404).json({
      error: 'Account not found'
    });
  }

  // Check if token is expired
  if (new Date(account.token_expires_at) < new Date()) {
    // Try to refresh the token
    try {
      console.log('Token expired, attempting refresh...');
      const tokenData = await lazadaAuth.refreshAccessToken(account.refresh_token);
      
      if (tokenData.code === '0' || tokenData.code === 0) {
        // Update tokens in database
        const updatedAccount = await updateLazadaTokens(req.user.id, req.accountId, {
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          expires_in: tokenData.expires_in
        });
        req.accessToken = updatedAccount.access_token;
        req.account = updatedAccount;
        console.log('Token refreshed successfully');
      } else {
        return res.status(401).json({
          error: 'Token expired and refresh failed',
          message: 'Please re-authenticate this account',
          lazada_code: tokenData.code
        });
      }
    } catch (error) {
      console.error('Token refresh failed:', error);
      return res.status(401).json({
        error: 'Token expired and refresh failed',
        message: 'Please re-authenticate this account'
      });
    }
  } else {
    req.accessToken = account.access_token;
    req.account = account;
  }

  next();
};

// ============================================
// LAZADA API ENDPOINTS (Protected with user auth + Lazada token)
// ============================================

// Get seller information
app.get('/api/lazada/seller', verifyUser, withLazadaToken, async (req, res) => {
    try {
        const sellerData = await lazadaAuth.makeRequest(
            '/seller/get',
            req.accessToken
        );

        res.json(sellerData);
    } catch (error) {
        console.error('Seller data error:', error);
        res.status(500).json({
            error: 'Failed to get seller data',
            details: error.response?.data || error.message
        });
    }
});

// Get seller policy information
app.get('/api/lazada/seller/policy', verifyUser, withLazadaToken, async (req, res) => {
    try {
        console.log('Fetching seller policy...');
        
        const locale = req.query.locale || 'en_US';
        
        const policyData = await lazadaAuth.makeRequest(
            '/seller/policy/fetch',
            req.accessToken,
            { locale: locale }
        );

        if (policyData.code !== '0' && policyData.code !== 0) {
            console.error('Seller policy fetch failed:', policyData);
            return res.status(400).json({
                error: 'Failed to get seller policy',
                details: policyData.message || 'Unknown error',
                lazada_code: policyData.code
            });
        }

        console.log('Seller policy fetched successfully');
        res.json(policyData);
    } catch (error) {
        console.error('Seller policy error:', error);
        res.status(500).json({
            error: 'Failed to get seller policy',
            details: error.response?.data || error.message
        });
    }
});

// Get products
app.get('/api/lazada/products', verifyUser, withLazadaToken, async (req, res) => {
    try {
        const { filter = 'all', limit = 20, offset = 0 } = req.query;

        const productsData = await lazadaAuth.makeRequest(
            '/products/get',
            req.accessToken,
            {
                filter,
                limit: parseInt(limit),
                offset: parseInt(offset)
            }
        );

        res.json(productsData);
    } catch (error) {
        console.error('Products error:', error);
        res.status(500).json({
            error: 'Failed to get products',
            details: error.response?.data || error.message
        });
    }
});

// Get orders
app.get('/api/lazada/orders', verifyUser, withLazadaToken, async (req, res) => {
    try {
        const {
            created_after,
            created_before,
            limit = 20,
            offset = 0,
            status,
            sort_by = 'created_at',
            sort_direction = 'DESC'
        } = req.query;

        const params = {
            limit: parseInt(limit),
            offset: parseInt(offset),
            sort_by,
            sort_direction
        };

        if (created_after) params.created_after = created_after;
        if (created_before) params.created_before = created_before;
        if (status) params.status = status;

        const ordersData = await lazadaAuth.makeRequest(
            '/orders/get',
            req.accessToken,
            params
        );

        res.json(ordersData);
    } catch (error) {
        console.error('Orders error:', error);
        res.status(500).json({
            error: 'Failed to get orders',
            details: error.response?.data || error.message
        });
    }
});

// Get order details
app.get('/api/lazada/order/:orderId', verifyUser, withLazadaToken, async (req, res) => {
    try {
        const { orderId } = req.params;

        const orderData = await lazadaAuth.makeRequest(
            '/order/get',
            req.accessToken,
            { order_id: orderId }
        );

        res.json(orderData);
    } catch (error) {
        console.error('Order details error:', error);
        res.status(500).json({
            error: 'Failed to get order details',
            details: error.response?.data || error.message
        });
    }
});

// ============================================
// ORDER ITEMS ENDPOINTS
// ============================================

// Get items for a single order
app.get('/api/lazada/order/:orderId/items', verifyUser, withLazadaToken, async (req, res) => {
    try {
        const { orderId } = req.params;

        console.log(`Fetching items for order: ${orderId}`);
        const orderItemsData = await lazadaAuth.getOrderItems(
            req.accessToken,
            orderId
        );

        if (orderItemsData.code !== '0' && orderItemsData.code !== 0) {
            return res.status(400).json({
                error: 'Failed to get order items',
                details: orderItemsData.message,
                lazada_code: orderItemsData.code
            });
        }

        res.json(orderItemsData);
    } catch (error) {
        console.error('Order items error:', error);
        res.status(500).json({
            error: 'Failed to get order items',
            details: error.response?.data || error.message
        });
    }
});

// Get items for multiple orders
app.post('/api/lazada/orders/items', verifyUser, withLazadaToken, async (req, res) => {
    try {
        const { orderIds } = req.body;

        if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
            return res.status(400).json({
                error: 'orderIds array is required',
                message: 'Please provide an array of order IDs'
            });
        }

        console.log(`Fetching items for ${orderIds.length} orders`);
        const orderItemsData = await lazadaAuth.getMultipleOrderItems(
            req.accessToken,
            orderIds
        );

        if (orderItemsData.code !== '0' && orderItemsData.code !== 0) {
            return res.status(400).json({
                error: 'Failed to get multiple order items',
                details: orderItemsData.message,
                lazada_code: orderItemsData.code
            });
        }

        res.json(orderItemsData);
    } catch (error) {
        console.error('Multiple order items error:', error);
        res.status(500).json({
            error: 'Failed to get multiple order items',
            details: error.response?.data || error.message
        });
    }
});

// ============================================
// SPONSOR SOLUTIONS - REPORT ENDPOINTS
// ============================================

// Get report overview
app.get('/api/lazada/sponsor/solutions/report/getReportOverview', verifyUser, withLazadaToken, async (req, res) => {
    try {
        const {
            startDate,
            endDate,
            dimensions,
            metrics,
            currencyType
        } = req.query;

        console.log('\n' + '='.repeat(60));
        console.log('REPORT OVERVIEW API REQUEST');
        console.log('='.repeat(60));
        console.log('Query params received:', req.query);

        if (!startDate || !endDate) {
            return res.status(400).json({
                error: 'Missing required parameters',
                details: 'Both startDate and endDate are required (format: YYYY-MM-DD)',
                received: { startDate, endDate }
            });
        }

        // Calculate previous period dates
        const start = new Date(startDate);
        const end = new Date(endDate);
        const duration = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
        
        const lastEnd = new Date(start);
        lastEnd.setDate(lastEnd.getDate() - 1);
        
        const lastStart = new Date(lastEnd);
        lastStart.setDate(lastStart.getDate() - duration);

        const formatDate = (date) => date.toISOString().split('T')[0];

        const params = {
            startDate: startDate.trim(),
            endDate: endDate.trim(),
            lastStartDate: formatDate(lastStart),
            lastEndDate: formatDate(lastEnd),
            bizCode: 'sponsoredSearch',
            useRtTable: 'false'
        };

        if (dimensions) params.dimensions = dimensions;
        if (metrics) params.metrics = metrics;
        if (currencyType) params.currencyType = currencyType;

        console.log('✅ Params for Lazada API:', params);

        const reportData = await lazadaAuth.makeRequest(
            '/sponsor/solutions/report/getReportOverview',
            req.accessToken,
            params,
            'GET'
        );

        if (reportData.code !== '0' && reportData.code !== 0) {
            console.error('❌ API returned error:', reportData);
            return res.status(400).json({
                error: 'Lazada API Error',
                code: reportData.code,
                message: reportData.message,
                type: reportData.type,
                request_id: reportData.request_id,
                params_sent: params
            });
        }

        console.log('✅ SUCCESS - Report data retrieved');
        res.json(reportData);
    } catch (error) {
        console.error('❌ EXCEPTION:', error.message);
        res.status(500).json({
            error: 'Request failed',
            message: error.message,
            details: error.response?.data,
            status: error.response?.status
        });
    }
});

// Get campaign list
app.get('/api/lazada/sponsor/solutions/campaign/getCampaignList', verifyUser, withLazadaToken, async (req, res) => {
    try {
        const { pageNo = '1', pageSize = '100' } = req.query;

        const params = { pageNo, pageSize };

        const campaignData = await lazadaAuth.makeRequest(
            '/sponsor/solutions/campaign/getCampaignList',
            req.accessToken,
            params,
            'GET'
        );

        if (campaignData.code !== '0' && campaignData.code !== 0) {
            return res.status(400).json({
                error: 'Failed to get campaign list',
                code: campaignData.code,
                message: campaignData.message
            });
        }

        res.json(campaignData);
    } catch (error) {
        console.error('Campaign list error:', error);
        res.status(500).json({
            error: 'Failed to get campaign list',
            details: error.response?.data || error.message
        });
    }
});

// Get discovery report by adgroup
app.get('/api/lazada/sponsor/solutions/report/getDiscoveryReportAdgroup', verifyUser, withLazadaToken, async (req, res) => {
    try {
        const {
            campaignId,
            startDate,
            endDate,
            pageNo = '1',
            pageSize = '1000'
        } = req.query;

        if (!campaignId || !startDate || !endDate) {
            return res.status(400).json({
                error: 'Missing required parameters',
                details: 'campaignId, startDate, and endDate are required'
            });
        }

        const params = { campaignId, startDate, endDate, pageNo, pageSize };

        const reportData = await lazadaAuth.makeRequest(
            '/sponsor/solutions/report/getDiscoveryReportAdgroup',
            req.accessToken,
            params,
            'GET'
        );

        if (reportData.code !== '0' && reportData.code !== 0) {
            return res.status(400).json({
                error: 'Failed to get discovery report',
                code: reportData.code,
                message: reportData.message
            });
        }

        res.json(reportData);
    } catch (error) {
        console.error('Discovery report error:', error);
        res.status(500).json({
            error: 'Failed to get discovery report',
            details: error.response?.data || error.message
        });
    }
});

// Get campaign report on pre-placement
app.get('/api/lazada/sponsor/solutions/report/getReportCampaignOnPrePlacement', verifyUser, withLazadaToken, async (req, res) => {
    try {
        const {
            campaignId,
            campaignName,
            startDate,
            endDate,
            productType = 'ALL',
            sort = 'impressions',
            order = 'DESC',
            pageNo = '1',
            pageSize = '100',
            useRtTable = 'true'
        } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({
                error: 'Missing required parameters',
                details: 'startDate and endDate are required (format: YYYY-MM-DD)'
            });
        }

        const params = {
            startDate,
            endDate,
            productType,
            sort,
            order,
            pageNo,
            pageSize,
            useRtTable
        };

        if (campaignId) params.campaignId = campaignId;
        if (campaignName) params.campaignName = campaignName;

        const reportData = await lazadaAuth.makeRequest(
            '/sponsor/solutions/report/getReportCampaignOnPrePlacement',
            req.accessToken,
            params,
            'GET'
        );

        if (reportData.code !== '0' && reportData.code !== 0) {
            return res.status(400).json({
                error: 'Lazada API Error',
                code: reportData.code,
                message: reportData.message,
                request_id: reportData.request_id,
                params_sent: params
            });
        }

        res.json(reportData);
    } catch (error) {
        console.error('Campaign pre-placement error:', error);
        res.status(500).json({
            error: 'Request failed',
            message: error.message,
            details: error.response?.data,
            status: error.response?.status
        });
    }
});

// Get discovery report by campaign
app.get('/api/lazada/sponsor/solutions/report/getDiscoveryReportCampaign', verifyUser, withLazadaToken, async (req, res) => {
    try {
        const {
            startDate,
            endDate,
            pageNo = '1',
            pageSize = '1000'
        } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({
                error: 'Missing required parameters',
                details: 'startDate and endDate are required (format: YYYY-MM-DD)'
            });
        }

        const params = { startDate, endDate, pageNo, pageSize };

        const reportData = await lazadaAuth.makeRequest(
            '/sponsor/solutions/report/getDiscoveryReportCampaign',
            req.accessToken,
            params,
            'GET'
        );

        if (reportData.code !== '0' && reportData.code !== 0) {
            return res.status(400).json({
                error: 'Lazada API Error',
                code: reportData.code,
                message: reportData.message,
                request_id: reportData.request_id,
                params_sent: params
            });
        }

        res.json(reportData);
    } catch (error) {
        console.error('Discovery report campaign error:', error);
        res.status(500).json({
            error: 'Request failed',
            message: error.message,
            details: error.response?.data,
            status: error.response?.status
        });
    }
});

// ============================================
// ERROR HANDLING
// ============================================

app.use((req, res) => {
    res.status(404).json({
        error: 'Endpoint not found',
        path: req.path,
        method: req.method
    });
});

app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: err.message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔑 Lazada App Key: ${process.env.LAZADA_APP_KEY ? '✓ Set' : '✗ Missing'}`);
    console.log(`🔐 Lazada App Secret: ${process.env.LAZADA_APP_SECRET ? '✓ Set' : '✗ Missing'}`);
    console.log(`🌐 Lazada API URL: ${process.env.LAZADA_API_URL || 'Not set'}`);
    console.log(`📦 Supabase URL: ${process.env.VITE_SUPABASE_URL ? '✓ Set' : '✗ Missing'}`);
    console.log(`🔐 Supabase Key: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? '✓ Set' : '✗ Missing'}`);
    console.log('='.repeat(60));
    console.log('\n📋 Available endpoints:');
    console.log('  GET  /health');
    console.log('  GET  /api/test');
    console.log('\n🔐 Authentication:');
    console.log('  GET  /api/lazada/auth-url');
    console.log('  POST /api/lazada/token (requires user auth)');
    console.log('  POST /api/lazada/refresh-token (requires user auth)');
    console.log('\n👤 Account Management:');
    console.log('  GET    /api/accounts');
    console.log('  GET    /api/accounts/:accountId');
    console.log('  POST   /api/accounts/:accountId/activate');
    console.log('  DELETE /api/accounts/:accountId');
    console.log('\n🔄 Data Sync (NEW!):');
    console.log('  POST /api/sync/all');
    console.log('  POST /api/sync/orders');
    console.log('  POST /api/sync/campaigns');
    console.log('  POST /api/sync/campaign-metrics');
    console.log('  GET  /api/sync/status');
    console.log('  GET  /api/sync/data/orders');
    console.log('  GET  /api/sync/data/campaigns');
    console.log('  GET  /api/sync/data/campaign-metrics');
    console.log('\n📦 Lazada API (require user auth + account):');
    console.log('  GET  /api/lazada/seller');
    console.log('  GET  /api/lazada/products');
    console.log('  GET  /api/lazada/orders');
    console.log('  ... and more');
    console.log('='.repeat(60));
});
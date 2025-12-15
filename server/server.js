import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import LazadaAuth from './utils/lazadaAuth.js';

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
  allowedHeaders: ['Content-Type', 'Authorization']
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

// Exchange authorization code for access token
app.post('/api/lazada/token', async (req, res) => {
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

        console.log('Token received successfully');
        res.json({
            success: true,
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expires_in: tokenData.expires_in,
            refresh_expires_in: tokenData.refresh_expires_in,
            account: tokenData.account,
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
app.post('/api/lazada/refresh-token', async (req, res) => {
    try {
        const { refreshToken } = req.body;

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
// MIDDLEWARE - Verify Access Token
// ============================================

const verifyToken = (req, res, next) => {
    const accessToken = req.headers.authorization?.replace('Bearer ', '');

    if (!accessToken) {
        return res.status(401).json({
            error: 'Access token is required',
            message: 'Please provide Authorization header with Bearer token'
        });
    }

    req.accessToken = accessToken;
    next();
};

// ============================================
// LAZADA API ENDPOINTS (Protected)
// ============================================

// Get seller information
app.get('/api/lazada/seller', verifyToken, async (req, res) => {
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
app.get('/api/lazada/seller/policy', verifyToken, async (req, res) => {
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
app.get('/api/lazada/products', verifyToken, async (req, res) => {
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
app.get('/api/lazada/orders', verifyToken, async (req, res) => {
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
app.get('/api/lazada/order/:orderId', verifyToken, async (req, res) => {
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
app.get('/api/lazada/order/:orderId/items', verifyToken, async (req, res) => {
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
app.post('/api/lazada/orders/items', verifyToken, async (req, res) => {
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
app.get('/api/lazada/sponsor/solutions/report/getReportOverview', verifyToken, async (req, res) => {
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

        // Calculate previous period dates (same duration as selected period)
        const start = new Date(startDate);
        const end = new Date(endDate);
        const duration = Math.ceil((end - start) / (1000 * 60 * 60 * 24)); // days
        
        const lastEnd = new Date(start);
        lastEnd.setDate(lastEnd.getDate() - 1); // day before start
        
        const lastStart = new Date(lastEnd);
        lastStart.setDate(lastStart.getDate() - duration);

        // Format dates as YYYY-MM-DD
        const formatDate = (date) => date.toISOString().split('T')[0];

        // Lazada API requires BOTH current and previous period dates
        const params = {
            startDate: startDate.trim(),
            endDate: endDate.trim(),
            lastStartDate: formatDate(lastStart),
            lastEndDate: formatDate(lastEnd),
            bizCode: 'sponsoredSearch',
            useRtTable: 'false'
        };

        // Add optional parameters
        if (dimensions) params.dimensions = dimensions;
        if (metrics) params.metrics = metrics;
        if (currencyType) params.currencyType = currencyType;

        console.log('✅ Params for Lazada API (comparing two periods):');
        console.log('   Current Period:');
        console.log('     startDate:', params.startDate);
        console.log('     endDate:', params.endDate);
        console.log('   Previous Period (for comparison):');
        console.log('     lastStartDate:', params.lastStartDate);
        console.log('     lastEndDate:', params.lastEndDate);
        console.log('   Other params:');
        console.log('     bizCode:', params.bizCode);
        console.log('     useRtTable:', params.useRtTable);
        if (dimensions) console.log('   dimensions:', dimensions);
        if (metrics) console.log('   metrics:', metrics);
        if (currencyType) console.log('   currencyType:', currencyType);

        console.log('\n📤 Calling Lazada API with GET method');
        
        const reportData = await lazadaAuth.makeRequest(
            '/sponsor/solutions/report/getReportOverview',
            req.accessToken,
            params,
            'GET'
        );

        console.log('\n📥 Response received:');
        console.log('   Code:', reportData.code);
        console.log('   Message:', reportData.message);

        if (reportData.code !== '0' && reportData.code !== 0) {
            console.error('\n❌ API returned error:');
            console.error('   Code:', reportData.code);
            console.error('   Message:', reportData.message);
            console.error('   Type:', reportData.type);
            console.error('   Request ID:', reportData.request_id);
            console.log('='.repeat(60) + '\n');
            
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
        console.log('='.repeat(60) + '\n');
        
        res.json(reportData);
    } catch (error) {
        console.error('\n❌ EXCEPTION CAUGHT:');
        console.error('   Message:', error.message);
        console.error('   Response status:', error.response?.status);
        console.error('   Response data:', error.response?.data);
        console.log('='.repeat(60) + '\n');
        
        res.status(500).json({
            error: 'Request failed',
            message: error.message,
            details: error.response?.data,
            status: error.response?.status
        });
    }
});

// Get campaign list
app.get('/api/lazada/sponsor/solutions/campaign/getCampaignList', verifyToken, async (req, res) => {
    try {
        const { pageNo = '1', pageSize = '100' } = req.query;

        console.log('\n' + '='.repeat(60));
        console.log('GET CAMPAIGN LIST REQUEST');
        console.log('='.repeat(60));
        console.log('Query params:', { pageNo, pageSize });

        const params = {
            pageNo,
            pageSize
        };

        const campaignData = await lazadaAuth.makeRequest(
            '/sponsor/solutions/campaign/getCampaignList',
            req.accessToken,
            params,
            'GET'
        );

        console.log('Response code:', campaignData.code);
        console.log('Campaigns found:', campaignData.result?.campaigns?.length || 0);
        console.log('='.repeat(60) + '\n');

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
app.get('/api/lazada/sponsor/solutions/report/getDiscoveryReportAdgroup', verifyToken, async (req, res) => {
    try {
        const {
            campaignId,
            startDate,
            endDate,
            pageNo = '1',
            pageSize = '1000'
        } = req.query;

        console.log('\n' + '='.repeat(60));
        console.log('GET DISCOVERY REPORT ADGROUP REQUEST');
        console.log('='.repeat(60));
        console.log('Query params:', { campaignId, startDate, endDate, pageNo, pageSize });

        if (!campaignId || !startDate || !endDate) {
            return res.status(400).json({
                error: 'Missing required parameters',
                details: 'campaignId, startDate, and endDate are required'
            });
        }

        const params = {
            campaignId,
            startDate,
            endDate,
            pageNo,
            pageSize
        };

        const reportData = await lazadaAuth.makeRequest(
            '/sponsor/solutions/report/getDiscoveryReportAdgroup',
            req.accessToken,
            params,
            'GET'
        );

        console.log('Response code:', reportData.code);
        console.log('Reports found:', reportData.result?.result?.length || 0);
        console.log('='.repeat(60) + '\n');

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
app.get('/api/lazada/sponsor/solutions/report/getReportCampaignOnPrePlacement', verifyToken, async (req, res) => {
    try {
        const {
            campaignId,
            startDate,
            endDate,
            pageNo = '1',
            pageSize = '1000'
        } = req.query;

        console.log('\n' + '='.repeat(60));
        console.log('GET CAMPAIGN REPORT ON PRE-PLACEMENT REQUEST');
        console.log('='.repeat(60));
        console.log('Query params:', { campaignId, startDate, endDate, pageNo, pageSize });

        if (!campaignId || !startDate || !endDate) {
            return res.status(400).json({
                error: 'Missing required parameters',
                details: 'campaignId, startDate, and endDate are required (format: YYYY-MM-DD)'
            });
        }

        const params = {
            campaignId,
            startDate,
            endDate,
            pageNo,
            pageSize
        };

        console.log('✅ Params for Lazada API:');
        console.log('   campaignId:', params.campaignId);
        console.log('   startDate:', params.startDate);
        console.log('   endDate:', params.endDate);
        console.log('   pageNo:', params.pageNo);
        console.log('   pageSize:', params.pageSize);

        console.log('\n📤 Calling Lazada API with GET method');
        
        const reportData = await lazadaAuth.makeRequest(
            '/sponsor/solutions/report/getReportCampaignOnPrePlacement',
            req.accessToken,
            params,
            'GET'
        );

        console.log('\n📥 Response received:');
        console.log('   Code:', reportData.code);
        console.log('   Message:', reportData.message);
        console.log('   Reports found:', reportData.result?.result?.length || 0);

        if (reportData.code !== '0' && reportData.code !== 0) {
            console.error('\n❌ API returned error:');
            console.error('   Code:', reportData.code);
            console.error('   Message:', reportData.message);
            console.log('='.repeat(60) + '\n');
            
            return res.status(400).json({
                error: 'Lazada API Error',
                code: reportData.code,
                message: reportData.message,
                request_id: reportData.request_id,
                params_sent: params
            });
        }

        console.log('✅ SUCCESS - Campaign pre-placement report retrieved');
        console.log('='.repeat(60) + '\n');
        
        res.json(reportData);
    } catch (error) {
        console.error('\n❌ EXCEPTION CAUGHT:');
        console.error('   Message:', error.message);
        console.error('   Response status:', error.response?.status);
        console.error('   Response data:', error.response?.data);
        console.log('='.repeat(60) + '\n');
        
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
    console.log('='.repeat(60));
    console.log('\n📋 Available endpoints:');
    console.log('  GET  /health');
    console.log('  GET  /api/test');
    console.log('\n🔐 Authentication:');
    console.log('  GET  /api/lazada/auth-url');
    console.log('  POST /api/lazada/token');
    console.log('  POST /api/lazada/refresh-token');
    console.log('\n📦 Lazada API (require auth token):');
    console.log('  GET  /api/lazada/seller');
    console.log('  GET  /api/lazada/seller/policy');
    console.log('  GET  /api/lazada/products');
    console.log('  GET  /api/lazada/orders');
    console.log('  GET  /api/lazada/order/:orderId');
    console.log('  GET  /api/lazada/order/:orderId/items');
    console.log('  POST /api/lazada/orders/items');
    console.log('\n📊 Sponsor Solutions:');
    console.log('  GET  /api/lazada/sponsor/solutions/report/getReportOverview');
    console.log('  GET  /api/lazada/sponsor/solutions/campaign/getCampaignList');
    console.log('  GET  /api/lazada/sponsor/solutions/report/getDiscoveryReportAdgroup');
    console.log('='.repeat(60));
});
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
    ? ['https://renzparagas123.github.io', 'https://your-custom-domain.com']
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

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Test endpoint
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
      ? 'https://renzparagas123.github.io/callback'
      : 'http://localhost:5173/callback';

    const authUrl = `https://auth.lazada.com/oauth/authorize?response_type=code&force_auth=true&redirect_uri=${encodeURIComponent(redirectUri)}&client_id=${process.env.LAZADA_APP_KEY}`;

    res.json({ authUrl, redirectUri });
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
    
    console.log('Token received successfully');
    res.json({
      success: true,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: tokenData.expires_in,
      account: tokenData.account,
      country: tokenData.country
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
    
    res.json({
      success: true,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: tokenData.expires_in
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
// LAZADA API ENDPOINTS (Protected)
// ============================================

// Middleware to verify access token
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
      status 
    } = req.query;

    const params = {
      limit: parseInt(limit),
      offset: parseInt(offset)
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
// ERROR HANDLING
// ============================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Endpoint not found',
    path: req.path,
    method: req.method
  });
});

// Global error handler
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
  console.log('='.repeat(50));
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔑 Lazada App Key: ${process.env.LAZADA_APP_KEY ? '✓ Set' : '✗ Missing'}`);
  console.log(`🔐 Lazada App Secret: ${process.env.LAZADA_APP_SECRET ? '✓ Set' : '✗ Missing'}`);
  console.log('='.repeat(50));
  console.log('\nAvailable endpoints:');
  console.log('  GET  /health');
  console.log('  GET  /api/test');
  console.log('  GET  /api/lazada/auth-url');
  console.log('  POST /api/lazada/token');
  console.log('  POST /api/lazada/refresh-token');
  console.log('  GET  /api/lazada/seller');
  console.log('  GET  /api/lazada/products');
  console.log('  GET  /api/lazada/orders');
  console.log('  GET  /api/lazada/order/:orderId');
  console.log('='.repeat(50));
});
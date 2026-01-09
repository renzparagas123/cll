// ============================================
// SYNC ROUTES - API endpoints for data sync
// File: src/server/routes/syncRoutes.js
// Manual sync only - no cron job
// ============================================

import express from 'express';
import { 
  syncOrders, 
  syncCampaigns, 
  syncCampaignMetrics, 
  syncAllData 
} from '../services/syncService.js';
import { supabaseAdmin } from '../utils/supabase.js';

const router = express.Router();

// ============================================
// MIDDLEWARE: Verify user authentication
// ============================================
async function verifyUser(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No authorization token provided' });
  }
  
  const token = authHeader.split(' ')[1];
  
  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Authentication failed' });
  }
}

// Apply auth middleware to all routes
router.use(verifyUser);

// ============================================
// SYNC ENDPOINTS
// ============================================

// Sync all data (orders, campaigns, metrics)
router.post('/all', async (req, res) => {
  try {
    const { ordersDaysBack = 30, metricsDaysBack = 7 } = req.body;
    
    console.log(`📥 Sync all request from user ${req.user.id}`);
    
    const result = await syncAllData(req.user.id, { ordersDaysBack, metricsDaysBack });
    
    res.json({
      success: true,
      message: 'Sync completed',
      data: result
    });
  } catch (error) {
    console.error('Sync all error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Sync orders only
router.post('/orders', async (req, res) => {
  try {
    const { accountId, daysBack = 30 } = req.body;
    
    console.log(`📦 Sync orders request from user ${req.user.id}`);
    
    const result = await syncOrders(req.user.id, accountId, { daysBack });
    
    res.json({
      success: true,
      message: 'Orders sync completed',
      data: result
    });
  } catch (error) {
    console.error('Sync orders error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Sync campaigns only
router.post('/campaigns', async (req, res) => {
  try {
    const { accountId } = req.body;
    
    console.log(`📊 Sync campaigns request from user ${req.user.id}`);
    
    const result = await syncCampaigns(req.user.id, accountId);
    
    res.json({
      success: true,
      message: 'Campaigns sync completed',
      data: result
    });
  } catch (error) {
    console.error('Sync campaigns error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Sync campaign metrics only
router.post('/campaign-metrics', async (req, res) => {
  try {
    const { accountId, daysBack = 7 } = req.body;
    
    console.log(`📈 Sync campaign metrics request from user ${req.user.id}`);
    
    const result = await syncCampaignMetrics(req.user.id, accountId, { daysBack });
    
    res.json({
      success: true,
      message: 'Campaign metrics sync completed',
      data: result
    });
  } catch (error) {
    console.error('Sync campaign metrics error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ============================================
// SYNC STATUS & LOGS
// ============================================

// Get sync status
router.get('/status', async (req, res) => {
  try {
    // Get sync settings
    const { data: settings } = await supabaseAdmin
      .from('sync_settings')
      .select('*')
      .eq('user_id', req.user.id)
      .single();
    
    // Get recent sync logs
    const { data: logs } = await supabaseAdmin
      .from('sync_logs')
      .select('*')
      .eq('user_id', req.user.id)
      .order('started_at', { ascending: false })
      .limit(10);
    
    // Get data counts
    const { count: ordersCount } = await supabaseAdmin
      .from('cached_orders')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.user.id);
    
    const { count: campaignsCount } = await supabaseAdmin
      .from('cached_campaigns')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.user.id);
    
    const { count: metricsCount } = await supabaseAdmin
      .from('cached_campaign_metrics')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.user.id);
    
    res.json({
      success: true,
      data: {
        settings: settings || {
          last_sync_at: null,
          last_sync_status: null
        },
        recent_logs: logs || [],
        data_counts: {
          orders: ordersCount || 0,
          campaigns: campaignsCount || 0,
          campaign_metrics: metricsCount || 0
        }
      }
    });
  } catch (error) {
    console.error('Get sync status error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ============================================
// CACHED DATA ENDPOINTS
// ============================================

// Get cached orders
router.get('/data/orders', async (req, res) => {
  try {
    const { 
      accountId, 
      status, 
      dateFrom, 
      dateTo, 
      page = 1, 
      limit = 50 
    } = req.query;
    
    let query = supabaseAdmin
      .from('cached_orders')
      .select(`
        *,
        lazada_accounts!inner(account_name, seller_id, country)
      `, { count: 'exact' })
      .eq('user_id', req.user.id)
      .order('order_created_at', { ascending: false });
    
    if (accountId && accountId !== 'all') {
      query = query.eq('account_id', accountId);
    }
    
    if (status && status !== 'all') {
      query = query.eq('status', status);
    }
    
    if (dateFrom) {
      query = query.gte('order_created_at', dateFrom);
    }
    
    if (dateTo) {
      query = query.lte('order_created_at', dateTo + 'T23:59:59');
    }
    
    // Pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query = query.range(offset, offset + parseInt(limit) - 1);
    
    const { data, error, count } = await query;
    
    if (error) throw error;
    
    res.json({
      success: true,
      data: data || [],
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count || 0
      }
    });
  } catch (error) {
    console.error('Get cached orders error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get cached campaign metrics
router.get('/data/campaign-metrics', async (req, res) => {
  try {
    const { 
      accountId, 
      campaignId,
      dateFrom, 
      dateTo 
    } = req.query;
    
    let query = supabaseAdmin
      .from('cached_campaign_metrics')
      .select(`
        *,
        lazada_accounts!inner(account_name, seller_id, country)
      `)
      .eq('user_id', req.user.id)
      .order('metric_date', { ascending: false });
    
    if (accountId && accountId !== 'all') {
      query = query.eq('account_id', accountId);
    }
    
    if (campaignId) {
      query = query.eq('campaign_id', campaignId);
    }
    
    if (dateFrom) {
      query = query.gte('metric_date', dateFrom);
    }
    
    if (dateTo) {
      query = query.lte('metric_date', dateTo);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    res.json({
      success: true,
      data: data || []
    });
  } catch (error) {
    console.error('Get cached campaign metrics error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get cached campaigns list
router.get('/data/campaigns', async (req, res) => {
  try {
    const { accountId } = req.query;
    
    let query = supabaseAdmin
      .from('cached_campaigns')
      .select(`
        *,
        lazada_accounts!inner(account_name, seller_id, country)
      `)
      .eq('user_id', req.user.id)
      .order('campaign_name');
    
    if (accountId && accountId !== 'all') {
      query = query.eq('account_id', accountId);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    res.json({
      success: true,
      data: data || []
    });
  } catch (error) {
    console.error('Get cached campaigns error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

export default router;
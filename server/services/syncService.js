// ============================================
// SYNC SERVICE - Fetches Lazada data and saves to Supabase
// File: src/server/services/syncService.js
// ============================================

import { supabaseAdmin } from '../utils/supabase.js';
import { refreshLazadaToken, makeLazadaRequest } from '../utils/lazadaAuth.js';

// ============================================
// HELPER FUNCTIONS
// ============================================

// Get all active Lazada accounts for a user (or all users if no userId)
async function getLazadaAccounts(userId = null) {
  let query = supabaseAdmin
    .from('lazada_accounts')
    .select('*')
    .eq('is_active', true);
  
  if (userId) {
    query = query.eq('user_id', userId);
  }
  
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// Get fresh access token, refresh if needed
async function getFreshToken(account) {
  const now = new Date();
  const expiresAt = new Date(account.token_expires_at);
  
  // Refresh if expires in less than 1 hour
  if (expiresAt <= new Date(now.getTime() + 60 * 60 * 1000)) {
    console.log(`🔄 Refreshing token for account ${account.account_name || account.seller_id}`);
    const newTokens = await refreshLazadaToken(account.refresh_token);
    
    // Update tokens in database
    await supabaseAdmin
      .from('lazada_accounts')
      .update({
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token,
        expires_in: newTokens.expires_in,
        token_expires_at: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', account.id);
    
    return newTokens.access_token;
  }
  
  return account.access_token;
}

// Create sync log entry
async function createSyncLog(userId, accountId, syncType, params = {}) {
  const { data, error } = await supabaseAdmin
    .from('sync_logs')
    .insert({
      user_id: userId,
      account_id: accountId,
      sync_type: syncType,
      status: 'started',
      params
    })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

// Update sync log
async function updateSyncLog(logId, updates) {
  await supabaseAdmin
    .from('sync_logs')
    .update(updates)
    .eq('id', logId);
}

// ============================================
// SYNC ORDERS
// ============================================
export async function syncOrders(userId, accountId = null, options = {}) {
  const { daysBack = 30 } = options;
  
  console.log(`📦 Starting orders sync for user ${userId}`);
  
  const accounts = await getLazadaAccounts(userId);
  const targetAccounts = accountId 
    ? accounts.filter(a => a.id === accountId)
    : accounts;
  
  if (targetAccounts.length === 0) {
    throw new Error('No accounts found to sync');
  }
  
  let totalSynced = 0;
  const results = [];
  
  for (const account of targetAccounts) {
    const syncLog = await createSyncLog(userId, account.id, 'orders', { daysBack });
    
    try {
      const accessToken = await getFreshToken(account);
      
      // Calculate date range
      const createdAfter = new Date();
      createdAfter.setDate(createdAfter.getDate() - daysBack);
      
      let allOrders = [];
      let offset = 0;
      const limit = 100;
      let hasMore = true;
      
      // Fetch all orders with pagination
      while (hasMore) {
        console.log(`  Fetching orders for ${account.account_name || account.seller_id}, offset: ${offset}`);
        
        const response = await makeLazadaRequest('/orders/get', {
          access_token: accessToken,
          created_after: createdAfter.toISOString(),
          limit,
          offset,
          sort_by: 'created_at',
          sort_direction: 'DESC'
        });
        
        if (response.code === '0' || response.code === 0) {
          const orders = response.data?.orders || [];
          allOrders = [...allOrders, ...orders];
          
          if (orders.length < limit) {
            hasMore = false;
          } else {
            offset += limit;
          }
        } else {
          throw new Error(response.message || 'Failed to fetch orders');
        }
      }
      
      console.log(`  Found ${allOrders.length} orders for ${account.account_name || account.seller_id}`);
      
      // Upsert orders to Supabase
      if (allOrders.length > 0) {
        const ordersToUpsert = allOrders.map(order => ({
          user_id: userId,
          account_id: account.id,
          order_id: order.order_id?.toString(),
          order_number: order.order_number,
          status: order.statuses?.[0] || null,
          price: parseFloat(order.price) || 0,
          currency: order.currency || 'PHP',
          items_count: order.items_count || 0,
          order_created_at: order.created_at,
          order_updated_at: order.updated_at,
          raw_data: order,
          synced_at: new Date().toISOString()
        }));
        
        // Batch upsert in chunks of 100
        for (let i = 0; i < ordersToUpsert.length; i += 100) {
          const chunk = ordersToUpsert.slice(i, i + 100);
          const { error } = await supabaseAdmin
            .from('cached_orders')
            .upsert(chunk, { onConflict: 'account_id,order_id' });
          
          if (error) throw error;
        }
        
        totalSynced += allOrders.length;
      }
      
      await updateSyncLog(syncLog.id, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        records_synced: allOrders.length
      });
      
      results.push({
        account_id: account.id,
        account_name: account.account_name || account.seller_id,
        orders_synced: allOrders.length,
        status: 'success'
      });
      
    } catch (error) {
      console.error(`  ❌ Error syncing orders for ${account.account_name}:`, error);
      
      await updateSyncLog(syncLog.id, {
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: error.message
      });
      
      results.push({
        account_id: account.id,
        account_name: account.account_name || account.seller_id,
        status: 'failed',
        error: error.message
      });
    }
  }
  
  console.log(`✅ Orders sync completed. Total synced: ${totalSynced}`);
  
  return {
    total_synced: totalSynced,
    accounts: results
  };
}

// ============================================
// SYNC CAMPAIGNS
// ============================================
export async function syncCampaigns(userId, accountId = null) {
  console.log(`📊 Starting campaigns sync for user ${userId}`);
  
  const accounts = await getLazadaAccounts(userId);
  const targetAccounts = accountId 
    ? accounts.filter(a => a.id === accountId)
    : accounts;
  
  let totalSynced = 0;
  const results = [];
  
  for (const account of targetAccounts) {
    const syncLog = await createSyncLog(userId, account.id, 'campaigns');
    
    try {
      const accessToken = await getFreshToken(account);
      
      const response = await makeLazadaRequest('/sponsor/solutions/campaign/getCampaignList', {
        access_token: accessToken,
        pageNo: 1,
        pageSize: 1000
      });
      
      if (response.code === '0' || response.code === 0) {
        const campaigns = response.result?.campaigns || [];
        
        console.log(`  Found ${campaigns.length} campaigns for ${account.account_name || account.seller_id}`);
        
        if (campaigns.length > 0) {
          const campaignsToUpsert = campaigns.map(campaign => ({
            user_id: userId,
            account_id: account.id,
            campaign_id: campaign.campaignId?.toString(),
            campaign_name: campaign.campaignName,
            campaign_type: campaign.campaignType,
            campaign_objective: campaign.campaignObjective,
            status: campaign.status,
            day_budget: parseFloat(campaign.dayBudget) || 0,
            raw_data: campaign,
            synced_at: new Date().toISOString()
          }));
          
          const { error } = await supabaseAdmin
            .from('cached_campaigns')
            .upsert(campaignsToUpsert, { onConflict: 'account_id,campaign_id' });
          
          if (error) throw error;
          
          totalSynced += campaigns.length;
        }
        
        await updateSyncLog(syncLog.id, {
          status: 'completed',
          completed_at: new Date().toISOString(),
          records_synced: campaigns.length
        });
        
        results.push({
          account_id: account.id,
          account_name: account.account_name || account.seller_id,
          campaigns_synced: campaigns.length,
          status: 'success'
        });
        
      } else {
        throw new Error(response.message || 'Failed to fetch campaigns');
      }
      
    } catch (error) {
      console.error(`  ❌ Error syncing campaigns for ${account.account_name}:`, error);
      
      await updateSyncLog(syncLog.id, {
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: error.message
      });
      
      results.push({
        account_id: account.id,
        account_name: account.account_name || account.seller_id,
        status: 'failed',
        error: error.message
      });
    }
  }
  
  console.log(`✅ Campaigns sync completed. Total synced: ${totalSynced}`);
  
  return {
    total_synced: totalSynced,
    accounts: results
  };
}

// ============================================
// SYNC CAMPAIGN METRICS
// ============================================
export async function syncCampaignMetrics(userId, accountId = null, options = {}) {
  const { daysBack = 7 } = options;
  
  console.log(`📈 Starting campaign metrics sync for user ${userId}`);
  
  const accounts = await getLazadaAccounts(userId);
  const targetAccounts = accountId 
    ? accounts.filter(a => a.id === accountId)
    : accounts;
  
  let totalSynced = 0;
  const results = [];
  
  // Generate date list
  const dateList = [];
  for (let i = 0; i < daysBack; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    dateList.push(date.toISOString().split('T')[0]);
  }
  
  for (const account of targetAccounts) {
    const syncLog = await createSyncLog(userId, account.id, 'campaign_metrics', { daysBack });
    let accountSynced = 0;
    
    try {
      const accessToken = await getFreshToken(account);
      
      // Fetch metrics for each date
      for (const date of dateList) {
        console.log(`  Fetching metrics for ${account.account_name || account.seller_id} - ${date}`);
        
        const response = await makeLazadaRequest('/sponsor/solutions/report/getDiscoveryReportCampaign', {
          access_token: accessToken,
          startDate: date,
          endDate: date,
          pageNo: 1,
          pageSize: 1000
        });
        
        if (response.code === '0' || response.code === 0) {
          const campaigns = response.result?.result || [];
          
          if (campaigns.length > 0) {
            const metricsToUpsert = campaigns.map(campaign => ({
              user_id: userId,
              account_id: account.id,
              campaign_id: campaign.campaignId?.toString(),
              campaign_name: campaign.campaignName,
              metric_date: date,
              spend: parseFloat(campaign.spend) || 0,
              day_budget: parseFloat(campaign.dayBudget) || 0,
              store_revenue: parseFloat(campaign.storeRevenue) || 0,
              product_revenue: parseFloat(campaign.productRevenue) || 0,
              store_orders: parseInt(campaign.storeOrders) || 0,
              product_orders: parseInt(campaign.productOrders) || 0,
              store_unit_sold: parseInt(campaign.storeUnitSold) || 0,
              product_unit_sold: parseInt(campaign.productUnitSold) || 0,
              impressions: parseInt(campaign.impressions) || 0,
              clicks: parseInt(campaign.clicks) || 0,
              ctr: parseFloat(campaign.ctr) || 0,
              cpc: parseFloat(campaign.cpc) || 0,
              store_roi: parseFloat(campaign.storeRoi) || 0,
              store_cvr: parseFloat(campaign.storeCvr) || 0,
              product_cvr: parseFloat(campaign.productCvr) || 0,
              store_a2c: parseInt(campaign.storeA2c) || 0,
              product_a2c: parseInt(campaign.productA2c) || 0,
              raw_data: campaign,
              synced_at: new Date().toISOString()
            }));
            
            const { error } = await supabaseAdmin
              .from('cached_campaign_metrics')
              .upsert(metricsToUpsert, { onConflict: 'account_id,campaign_id,metric_date' });
            
            if (error) throw error;
            
            accountSynced += campaigns.length;
          }
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      totalSynced += accountSynced;
      
      await updateSyncLog(syncLog.id, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        records_synced: accountSynced
      });
      
      results.push({
        account_id: account.id,
        account_name: account.account_name || account.seller_id,
        metrics_synced: accountSynced,
        dates_processed: dateList.length,
        status: 'success'
      });
      
    } catch (error) {
      console.error(`  ❌ Error syncing metrics for ${account.account_name}:`, error);
      
      await updateSyncLog(syncLog.id, {
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: error.message
      });
      
      results.push({
        account_id: account.id,
        account_name: account.account_name || account.seller_id,
        status: 'failed',
        error: error.message
      });
    }
  }
  
  console.log(`✅ Campaign metrics sync completed. Total synced: ${totalSynced}`);
  
  return {
    total_synced: totalSynced,
    dates_processed: dateList.length,
    accounts: results
  };
}

// ============================================
// SYNC ALL DATA
// ============================================
export async function syncAllData(userId, options = {}) {
  const { ordersDaysBack = 30, metricsDaysBack = 7 } = options;
  
  console.log(`🔄 Starting full sync for user ${userId}`);
  const startTime = Date.now();
  
  const results = {
    orders: null,
    campaigns: null,
    campaign_metrics: null,
    duration_ms: 0,
    status: 'completed'
  };
  
  try {
    // Sync orders
    results.orders = await syncOrders(userId, null, { daysBack: ordersDaysBack });
    
    // Sync campaigns
    results.campaigns = await syncCampaigns(userId);
    
    // Sync campaign metrics
    results.campaign_metrics = await syncCampaignMetrics(userId, null, { daysBack: metricsDaysBack });
    
    // Update sync settings
    await supabaseAdmin
      .from('sync_settings')
      .upsert({
        user_id: userId,
        last_sync_at: new Date().toISOString(),
        last_sync_status: 'completed',
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });
    
  } catch (error) {
    console.error('❌ Full sync failed:', error);
    results.status = 'failed';
    results.error = error.message;
    
    await supabaseAdmin
      .from('sync_settings')
      .upsert({
        user_id: userId,
        last_sync_at: new Date().toISOString(),
        last_sync_status: 'failed',
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });
  }
  
  results.duration_ms = Date.now() - startTime;
  console.log(`✅ Full sync completed in ${results.duration_ms}ms`);
  
  return results;
}

// ============================================
// SCHEDULED SYNC FOR ALL USERS
// ============================================
export async function runScheduledSync() {
  console.log('⏰ Running scheduled sync for all users...');
  
  // Get all users with auto_sync_enabled
  const { data: settings, error } = await supabaseAdmin
    .from('sync_settings')
    .select('user_id')
    .eq('auto_sync_enabled', true);
  
  if (error) {
    console.error('Failed to get sync settings:', error);
    return;
  }
  
  // Also get users who don't have sync_settings yet (default enabled)
  const { data: allAccounts } = await supabaseAdmin
    .from('lazada_accounts')
    .select('user_id')
    .eq('is_active', true);
  
  const userIds = [...new Set([
    ...(settings || []).map(s => s.user_id),
    ...(allAccounts || []).map(a => a.user_id)
  ])];
  
  console.log(`Found ${userIds.length} users to sync`);
  
  for (const userId of userIds) {
    try {
      await syncAllData(userId);
    } catch (error) {
      console.error(`Failed to sync user ${userId}:`, error);
    }
  }
  
  console.log('✅ Scheduled sync completed for all users');
}
import crypto from 'crypto';
import axios from 'axios';

class LazadaAuth {
  constructor(appKey, appSecret, apiUrl) {
    this.appKey = appKey;
    this.appSecret = appSecret;
    this.apiUrl = apiUrl;
  }

  // Generate signature for API requests
  generateSignature(apiPath, params) {
    // Sort parameters alphabetically
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}${params[key]}`)
      .join('');

    // Create signature string: API path + sorted parameters
    const signString = `${apiPath}${sortedParams}`;

    // Generate HMAC-SHA256 signature
    const signature = crypto
      .createHmac('sha256', this.appSecret)
      .update(signString)
      .digest('hex')
      .toUpperCase();

    return signature;
  }

  // Get current timestamp in milliseconds
  getTimestamp() {
    return Date.now();
  }

  // Create access token using authorization code
  async createAccessToken(code) {
    const apiPath = '/auth/token/create';
    const timestamp = this.getTimestamp();

    const params = {
      app_key: this.appKey,
      timestamp: timestamp.toString(),
      sign_method: 'sha256',
      code: code,
    };

    // Generate signature
    const sign = this.generateSignature(apiPath, params);
    params.sign = sign;

    try {
      const response = await axios.post(
        `${this.apiUrl}${apiPath}`,
        null,
        { params }
      );

      console.log('Token creation response:', response.data);
      
      // Lazada returns the data in response.data
      return response.data;
    } catch (error) {
      console.error('Lazada Token Creation Error:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      throw error;
    }
  }

  // Refresh access token
  async refreshAccessToken(refreshToken) {
    const apiPath = '/auth/token/refresh';
    const timestamp = this.getTimestamp();

    const params = {
      app_key: this.appKey,
      timestamp: timestamp.toString(),
      sign_method: 'sha256',
      refresh_token: refreshToken,
    };

    const sign = this.generateSignature(apiPath, params);
    params.sign = sign;

    try {
      const response = await axios.post(
        `${this.apiUrl}${apiPath}`,
        null,
        { params }
      );

      console.log('Token refresh response:', response.data);
      return response.data;
    } catch (error) {
      console.error('Lazada Token Refresh Error:', error.response?.data || error.message);
      throw error;
    }
  }

  // Make authenticated API request (GET)
   async makeRequest(apiPath, accessToken, additionalParams = {}) {
    const timestamp = this.getTimestamp();

    const params = {
      app_key: this.appKey,
      timestamp: timestamp.toString(),
      sign_method: 'sha256',
      access_token: accessToken,
      ...additionalParams,
    };

    console.log('=== LAZADA AUTH makeRequest DEBUG ===');
    console.log('API Path:', apiPath);
    console.log('Additional Params:', JSON.stringify(additionalParams, null, 2));
    console.log('Full Params (before signature):', JSON.stringify(params, null, 2));

    const sign = this.generateSignature(apiPath, params);
    params.sign = sign;

    console.log('Signature:', sign);
    console.log('Full URL:', `${this.apiUrl}${apiPath}`);
    console.log('Query String Params:', new URLSearchParams(params).toString());

    try {
      const response = await axios.get(`${this.apiUrl}${apiPath}`, { params });
      console.log('✅ Response Status:', response.status);
      console.log('✅ Response Data:', JSON.stringify(response.data, null, 2));
      return response.data;
    } catch (error) {
      console.error('❌ Lazada API Request Error:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        headers: error.response?.headers
      });
      throw error;
    }
  }

  // Make authenticated API request (POST)
  async makePostRequest(apiPath, accessToken, bodyParams = {}) {
    const timestamp = this.getTimestamp();

    const params = {
      app_key: this.appKey,
      timestamp: timestamp.toString(),
      sign_method: 'sha256',
      access_token: accessToken,
    };

    const sign = this.generateSignature(apiPath, params);
    params.sign = sign;

    try {
      const response = await axios.post(
        `${this.apiUrl}${apiPath}`,
        bodyParams,
        { params }
      );
      return response.data;
    } catch (error) {
      console.error('Lazada API POST Request Error:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get Order Items (specific implementation)
  async getOrderItems(accessToken, orderId) {
    const apiPath = '/order/items/get';
    const timestamp = this.getTimestamp();

    const params = {
      app_key: this.appKey,
      timestamp: timestamp.toString(),
      sign_method: 'sha256',
      access_token: accessToken,
      order_id: orderId.toString(),
    };

    const sign = this.generateSignature(apiPath, params);
    params.sign = sign;

    try {
      const response = await axios.get(`${this.apiUrl}${apiPath}`, { params });
      return response.data;
    } catch (error) {
      console.error('Lazada Get Order Items Error:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get Multiple Order Items
  async getMultipleOrderItems(accessToken, orderIds) {
    const apiPath = '/orders/items/get';
    const timestamp = this.getTimestamp();

    // Convert array of order IDs to JSON string
    const orderIdsJson = JSON.stringify(orderIds);

    const params = {
      app_key: this.appKey,
      timestamp: timestamp.toString(),
      sign_method: 'sha256',
      access_token: accessToken,
      order_ids: orderIdsJson,
    };

    const sign = this.generateSignature(apiPath, params);
    params.sign = sign;

    try {
      const response = await axios.get(`${this.apiUrl}${apiPath}`, { params });
      return response.data;
    } catch (error) {
      console.error('Lazada Get Multiple Order Items Error:', error.response?.data || error.message);
      throw error;
    }
  }
}

export default LazadaAuth;
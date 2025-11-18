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
    // Sort parameters
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}${params[key]}`)
      .join('');

    // Create signature string
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
      timestamp: timestamp,
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

      return response.data;
    } catch (error) {
      console.error('Lazada API Error:', error.response?.data || error.message);
      throw error;
    }
  }

  // Refresh access token
  async refreshAccessToken(refreshToken) {
    const apiPath = '/auth/token/refresh';
    const timestamp = this.getTimestamp();

    const params = {
      app_key: this.appKey,
      timestamp: timestamp,
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

      return response.data;
    } catch (error) {
      console.error('Lazada Refresh Token Error:', error.response?.data || error.message);
      throw error;
    }
  }

  // Make authenticated API request
  async makeRequest(apiPath, accessToken, additionalParams = {}) {
    const timestamp = this.getTimestamp();

    const params = {
      app_key: this.appKey,
      timestamp: timestamp,
      sign_method: 'sha256',
      access_token: accessToken,
      ...additionalParams,
    };

    const sign = this.generateSignature(apiPath, params);
    params.sign = sign;

    try {
      const response = await axios.get(`${this.apiUrl}${apiPath}`, { params });
      return response.data;
    } catch (error) {
      console.error('Lazada API Request Error:', error.response?.data || error.message);
      throw error;
    }
  }
}

export default LazadaAuth;
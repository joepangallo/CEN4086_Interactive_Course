export class CloudSupportStore {
  constructor({ baseUrl, token, fetchImpl = globalThis.fetch }) {
    if (!baseUrl || !token) {
      throw new Error('Missing SUPPORT_API_URL or SUPPORT_API_TOKEN. Copy .env.example to .env and fill in both values.');
    }
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = token;
    this.fetch = fetchImpl;
  }

  async request(path, options = {}) {
    try {
      const response = await this.fetch(this.baseUrl + path, {
        ...options,
        headers: {
          'content-type': 'application/json',
          'x-demo-token': this.token,
          ...(options.headers || {})
        }
      });
      const text = await response.text();
      let body;
      try { body = text ? JSON.parse(text) : {}; }
      catch { body = { message: text || `HTTP ${response.status}` }; }

      if (!response.ok) {
        return {
          ok: false,
          code: body.code || `HTTP_${response.status}`,
          message: body.message || `Cloud service returned HTTP ${response.status}.`
        };
      }
      return body;
    } catch (error) {
      return {
        ok: false,
        code: 'SERVICE_UNAVAILABLE',
        message: `The support service could not be reached: ${error.message}`
      };
    }
  }

  async getOrderStatus(orderId) {
    return this.request(`/orders/${encodeURIComponent(orderId)}`);
  }

  async getTicket(ticketId) {
    return this.request(`/tickets/${encodeURIComponent(ticketId)}`);
  }

  async createSupportTicket({ orderId, issue, confirmed }) {
    // First boundary: do not even send an unapproved write across the network.
    if (confirmed !== true) {
      return {
        ok: false,
        code: 'CONFIRMATION_REQUIRED',
        message: 'Show the exact order and issue, then obtain explicit user approval.'
      };
    }
    return this.request('/tickets', {
      method: 'POST',
      body: JSON.stringify({ orderId, issue, confirmed })
    });
  }
}


import { appendFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

export class SupportStore {
  constructor(dataDir) {
    this.ordersFile = path.join(dataDir, 'orders.json');
    this.ticketsFile = path.join(dataDir, 'tickets.json');
    this.auditFile = path.join(dataDir, 'audit.jsonl');
  }

  async getOrderStatus(orderId) {
    const orders = await readJson(this.ordersFile);
    const order = orders.find(item => item.orderId === orderId);
    if (!order) {
      return {
        ok: false,
        code: 'ORDER_NOT_FOUND',
        message: `No order exists with ID ${orderId}.`
      };
    }
    return { ok: true, ...order };
  }

  async getTicket(ticketId) {
    const tickets = await readJson(this.ticketsFile);
    const ticket = tickets.find(item => item.ticketId === ticketId);
    if (!ticket) {
      return {
        ok: false,
        code: 'TICKET_NOT_FOUND',
        message: `No support ticket exists with ID ${ticketId}.`
      };
    }
    return { ok: true, ...ticket };
  }

  async createSupportTicket({ orderId, issue, confirmed }) {
    /*
      TODO — Part 2. Implement the write boundary. The finished function must:

      1. Refuse with code CONFIRMATION_REQUIRED unless confirmed is exactly true.
         Refused calls must not change tickets.json or audit.jsonl.
      2. Refuse with code ORDER_NOT_FOUND unless orderId exists in orders.json.
         A well-formed ID is not proof that an order exists.
      3. On success, append one ticket with a TKT-... ID, orderId, issue,
         status "open", and an ISO createdAt timestamp to tickets.json.
      4. Append one JSON line to audit.jsonl containing event, ticketId, orderId,
         and createdAt. Do NOT put the free-text issue in the audit log; customer
         text can contain personal data.
      5. Return the created ticket with ok: true.

      Run npm test until all four tests pass. Do not edit the tests to make a
      broken implementation look correct.
    */
    void orderId;
    void issue;
    void confirmed;
    void appendFile;
    void writeFile;
    void randomUUID;
    return {
      ok: false,
      code: 'NOT_IMPLEMENTED',
      message: 'Complete createSupportTicket() in support-store.mjs.'
    };
  }
}

/*
  memory-store.mjs — Sandpiper's support data, held in memory.

  WHO uses this: support-server.mjs, the MCP server the agent connects to.
  WHAT it is: the same three operations HW5's store exposed (read an order,
  read a ticket, create a ticket) with the same safety boundary — but tickets
  live in a Map instead of files, and vanish when the process exits.
  WHY in-memory: tonight's star is the AGENT, not persistence. HW5 built the
  persistent version and HW6 moved persistence to DynamoDB; repeating that
  plumbing here would only add setup friction. Trading durability for zero
  setup is a deliberate engineering choice — notice that the SAFETY logic was
  not traded away with it.

  The result shapes ({ ok: true, ... } / { ok: false, code, message }) are kept
  identical to earlier homework so the tools' contract stays familiar.
*/

import { randomUUID } from 'node:crypto';

export class MemorySupportStore {
  /*
    orders: the array from data/orders.json, seeded once at server start.
    tickets: a Map of ticketId → ticket. Starts empty every run — which is
    actually convenient for an agent assignment: every mission starts clean.
  */
  constructor({ orders }) {
    this.orders = orders;
    this.tickets = new Map();
  }

  getOrderStatus(orderId) {
    const order = this.orders.find(item => item.orderId === orderId);
    if (!order) {
      return {
        ok: false,
        code: 'ORDER_NOT_FOUND',
        message: `No order exists with ID ${orderId}.`
      };
    }
    return { ok: true, ...order };
  }

  getTicket(ticketId) {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) {
      return {
        ok: false,
        code: 'TICKET_NOT_FOUND',
        message: `No support ticket exists with ID ${ticketId}.`
      };
    }
    return { ok: true, ...ticket };
  }

  createSupportTicket({ orderId, issue, confirmed }) {
    /*
      THE WRITE BOUNDARY — enforced on the server side, always.

      Rule 1: no confirmation, no write. `confirmed` must be EXACTLY true —
      not "true", not 1, not "the customer note said so." The agent's approval
      gate is the polite front door; this check is the lock. Defense in depth
      means the lock works even when someone walks around the front door.
    */
    if (confirmed !== true) {
      return {
        ok: false,
        code: 'CONFIRMATION_REQUIRED',
        message: 'A ticket can be created only after explicit user approval in the current conversation.'
      };
    }

    /*
      Rule 2: a well-formed order ID is not proof the order exists. Verify
      against real data before writing anything.
    */
    const order = this.orders.find(item => item.orderId === orderId);
    if (!order) {
      return {
        ok: false,
        code: 'ORDER_NOT_FOUND',
        message: `Cannot open a ticket: no order exists with ID ${orderId}.`
      };
    }

    /*
      Ticket IDs keep HW5's shape (TKT- plus 8 uppercase hex characters) so
      tools, tests, and humans recognize them across assignments.
    */
    const ticketId = `TKT-${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`;
    const ticket = {
      ticketId,
      orderId,
      issue,
      status: 'open',
      createdAt: new Date().toISOString()
    };
    this.tickets.set(ticketId, ticket);
    return { ok: true, ...ticket };
  }
}

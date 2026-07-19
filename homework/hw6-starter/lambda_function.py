import base64
import json
import logging
import os
import re
import secrets
import uuid
from datetime import datetime, timezone

import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

ORDERS = {
    "ORD-1001": {"orderId": "ORD-1001", "status": "processing", "eta": "2026-07-22"},
    "ORD-1002": {"orderId": "ORD-1002", "status": "shipped", "eta": "2026-07-20"},
    "ORD-1003": {"orderId": "ORD-1003", "status": "delivered", "eta": "2026-07-16"},
}


def response(status, body):
    return {
        "statusCode": status,
        "headers": {"content-type": "application/json"},
        "body": json.dumps(body),
    }


def request_body(event):
    raw = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        raw = base64.b64decode(raw).decode("utf-8")
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def lambda_handler(event, context):
    # Invoke this ONLY from the Lambda console after creating the CloudWatch alarm.
    # It is deliberately outside normal HTTP routing so public callers cannot trigger it.
    if event.get("forceError") is True:
        raise RuntimeError("Intentional HW6 alarm test")

    table_name = os.environ.get("TABLE_NAME", "")
    expected_token = os.environ.get("DEMO_TOKEN", "")
    if not table_name or not expected_token:
        logger.error("Lambda is missing TABLE_NAME or DEMO_TOKEN configuration")
        return response(500, {"ok": False, "code": "SERVER_MISCONFIGURED", "message": "Service configuration is incomplete."})

    headers = {str(k).lower(): str(v) for k, v in (event.get("headers") or {}).items()}
    supplied_token = headers.get("x-demo-token", "")
    if not supplied_token or not secrets.compare_digest(supplied_token, expected_token):
        logger.warning("Rejected request with an invalid demo token")
        return response(401, {"ok": False, "code": "UNAUTHORIZED", "message": "Invalid demo token."})

    http = (event.get("requestContext") or {}).get("http") or {}
    method = http.get("method") or event.get("httpMethod") or ""
    path = event.get("rawPath") or event.get("path") or ""
    params = event.get("pathParameters") or {}
    table = boto3.resource("dynamodb").Table(table_name)

    if method == "GET" and path.startswith("/orders/"):
        order_id = params.get("orderId") or path.rsplit("/", 1)[-1]
        order = ORDERS.get(order_id)
        if not order:
            return response(404, {"ok": False, "code": "ORDER_NOT_FOUND", "message": f"No order exists with ID {order_id}."})
        return response(200, {"ok": True, **order})

    if method == "GET" and path.startswith("/tickets/"):
        ticket_id = params.get("ticketId") or path.rsplit("/", 1)[-1]
        item = table.get_item(Key={"ticketId": ticket_id}).get("Item")
        if not item:
            return response(404, {"ok": False, "code": "TICKET_NOT_FOUND", "message": f"No support ticket exists with ID {ticket_id}."})
        return response(200, {"ok": True, **item})

    if method == "POST" and path.rstrip("/").endswith("/tickets"):
        body = request_body(event)
        if body is None:
            return response(400, {"ok": False, "code": "INVALID_JSON", "message": "Request body must be valid JSON."})

        order_id = body.get("orderId", "")
        issue = body.get("issue", "")
        confirmed = body.get("confirmed")
        if confirmed is not True:
            return response(409, {"ok": False, "code": "CONFIRMATION_REQUIRED", "message": "Explicit user confirmation is required."})
        if not re.fullmatch(r"ORD-\d{4}", order_id) or order_id not in ORDERS:
            return response(404, {"ok": False, "code": "ORDER_NOT_FOUND", "message": f"No order exists with ID {order_id}."})
        if not isinstance(issue, str) or not 10 <= len(issue) <= 500:
            return response(400, {"ok": False, "code": "INVALID_ISSUE", "message": "Issue must contain 10 to 500 characters."})

        created_at = datetime.now(timezone.utc).isoformat()
        ticket = {
            "ticketId": "TKT-" + uuid.uuid4().hex[:8].upper(),
            "orderId": order_id,
            "issue": issue,
            "status": "open",
            "createdAt": created_at,
        }
        table.put_item(Item=ticket)

        # Deliberately omit the free-text issue and the token from logs.
        logger.info(json.dumps({
            "event": "ticket_created",
            "ticketId": ticket["ticketId"],
            "orderId": order_id,
            "createdAt": created_at,
            "requestId": getattr(context, "aws_request_id", None),
        }))
        return response(201, {"ok": True, **ticket})

    return response(404, {"ok": False, "code": "ROUTE_NOT_FOUND", "message": f"No route for {method} {path}."})


import 'dotenv/config';

const baseUrl = (process.env.SUPPORT_API_URL || '').replace(/\/$/, '');
const token = process.env.SUPPORT_API_TOKEN || '';
if (!baseUrl || !token) {
  console.error('Missing SUPPORT_API_URL or SUPPORT_API_TOKEN in .env.');
  process.exit(1);
}

async function post(suppliedToken, confirmed) {
  const response = await fetch(baseUrl + '/tickets', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-demo-token': suppliedToken
    },
    body: JSON.stringify({
      orderId: 'ORD-1001',
      issue: 'Boundary test: no ticket should be created.',
      confirmed
    })
  });
  const body = await response.json();
  return { status: response.status, body };
}

const unauthorized = await post(token + '-intentionally-wrong', false);
console.log('Wrong-token test:', unauthorized.status, unauthorized.body.code);
if (unauthorized.status !== 401 || unauthorized.body.code !== 'UNAUTHORIZED') {
  console.error('Expected HTTP 401 UNAUTHORIZED. Check the API route and Lambda environment.');
  process.exit(1);
}

const unconfirmed = await post(token, false);
console.log('Unconfirmed-write test:', unconfirmed.status, unconfirmed.body.code);
if (unconfirmed.status !== 409 || unconfirmed.body.code !== 'CONFIRMATION_REQUIRED') {
  console.error('Expected HTTP 409 CONFIRMATION_REQUIRED. The Lambda boundary is not working.');
  process.exit(1);
}

console.log('PASS: the public endpoint rejected both calls and created no ticket.');


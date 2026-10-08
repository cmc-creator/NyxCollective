const crypto = require('crypto');

async function getFirestoreToken() {
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!clientEmail || !rawKey) return null;

  const privateKey = rawKey.replace(/\\n/g, '\n');
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: clientEmail,
    sub: clientEmail,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/datastore',
  })).toString('base64url');

  const unsigned = `${header}.${payload}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(unsigned);
  const assertion = `${unsigned}.${sign.sign(privateKey, 'base64url')}`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${assertion}`,
  });
  const data = await response.json();
  return data.access_token || null;
}

async function saveOrder(sessionId, orderData, createOnly = false) {
  const token = await getFirestoreToken();
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!token || !projectId) return { ok: false, status: 503 };

  const precondition = createOnly ? '?currentDocument.exists=false' : '';
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/orders/${sessionId}${precondition}`;
  const fields = {
    customerEmail: { stringValue: orderData.customerEmail || '' },
    sessionId: { stringValue: sessionId },
    amountTotal: { integerValue: String(orderData.amountTotal || 0) },
    currency: { stringValue: orderData.currency || 'usd' },
    createdAt: { timestampValue: new Date().toISOString() },
    fulfillmentStatus: { stringValue: orderData.fulfillmentStatus || 'processing' },
    ...(orderData.printfulOrderId ? { printfulOrderId: { stringValue: String(orderData.printfulOrderId) } } : {}),
    ...(orderData.fulfillmentError ? { fulfillmentError: { stringValue: String(orderData.fulfillmentError).slice(0, 500) } } : {}),
    items: {
      arrayValue: {
        values: (orderData.items || []).map(item => ({
          mapValue: {
            fields: {
              name: { stringValue: item.name || '' },
              variantName: { stringValue: item.variantName || '' },
              qty: { integerValue: String(item.qty || 1) },
              price: { doubleValue: item.price || 0 },
            },
          },
        })),
      },
    },
  };

  const response = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (response.status === 409) return { ok: false, duplicate: true, status: 409 };
  if (!response.ok) {
    console.error('Firestore order write failed:', await response.text());
    return { ok: false, status: response.status };
  }
  return { ok: true, status: response.status };
}

function decodeFirestoreValue(value) {
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeFirestoreValue);
  if ('mapValue' in value) return decodeFirestoreFields(value.mapValue.fields || {});
  return null;
}

function decodeFirestoreFields(fields) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeFirestoreValue(value)]));
}

async function getOrdersForEmail(email) {
  const token = await getFirestoreToken();
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!token || !projectId) throw new Error('Firestore is not configured');

  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'orders' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'customerEmail' },
            op: 'EQUAL',
            value: { stringValue: email },
          },
        },
        orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
        limit: 20,
      },
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error('Firestore order query failed');

  return data.filter(row => row.document).map(row => ({
    id: row.document.name.split('/').pop(),
    ...decodeFirestoreFields(row.document.fields || {}),
  }));
}

module.exports = { getOrdersForEmail, saveOrder };
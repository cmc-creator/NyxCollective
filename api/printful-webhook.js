// printful-webhook.js — Vercel API route
// Handles Stripe checkout.session.completed → submits order to Printful + writes to Firestore.
// Raw body required for signature verification — bodyParser is disabled below.

const crypto = require('crypto');

// Firestore helper — writes order data using REST API + service account JWT.
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
  const sig = sign.sign(privateKey, 'base64url');
  const jwt = `${unsigned}.${sig}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    console.error('Failed to get Firestore token:', JSON.stringify(tokenData));
    return null;
  }
  return tokenData.access_token;
}

async function writeOrderToFirestore(sessionId, orderData) {
  const token = await getFirestoreToken();
  if (!token) return;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/orders/${sessionId}`;

  const fields = {
    customerEmail:  { stringValue: orderData.customerEmail || '' },
    sessionId:      { stringValue: sessionId },
    amountTotal:    { integerValue: String(orderData.amountTotal || 0) },
    currency:       { stringValue: orderData.currency || 'usd' },
    createdAt:      { timestampValue: new Date().toISOString() },
    items: {
      arrayValue: {
        values: (orderData.items || []).map(item => ({
          mapValue: {
            fields: {
              name:        { stringValue: item.name || '' },
              variantName: { stringValue: item.variantName || '' },
              qty:         { integerValue: String(item.qty || 1) },
              price:       { doubleValue: item.price || 0 },
            },
          },
        })),
      },
    },
  };

  const pfRes = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });

  if (!pfRes.ok) {
    console.error('Firestore write failed:', await pfRes.text());
  } else {
    console.log('Order written to Firestore:', sessionId);
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end('Method not allowed');

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const printfulToken = process.env.PRINTFUL_TOKEN;

  if (!webhookSecret || !printfulToken) {
    console.error('Missing env: STRIPE_WEBHOOK_SECRET or PRINTFUL_TOKEN');
    return res.status(500).end('Server configuration error');
  }

  const rawBody = await getRawBody(req);
  const sigHeader = req.headers['stripe-signature'];

  if (!sigHeader) return res.status(400).end('Missing Stripe signature');
  if (!verifySignature(rawBody, sigHeader, webhookSecret)) {
    return res.status(401).end('Invalid signature');
  }

  let session;
  try {
    const payload = JSON.parse(rawBody);
    if (payload.type !== 'checkout.session.completed') {
      return res.status(200).end('OK');
    }
    session = payload.data.object;
  } catch {
    return res.status(400).end('Invalid JSON');
  }

  const meta = session.metadata || {};
  const itemCount = parseInt(meta.item_count, 10);
  if (!itemCount || itemCount < 1) {
    console.log('No fulfillment metadata — skipping Printful order');
    return res.status(200).end('OK - no items');
  }

  const items = [];
  const orderItems = [];
  for (let i = 0; i < itemCount; i++) {
    try {
      const item = JSON.parse(meta['item_' + i] || 'null');
      if (item && item.variantId && Number.isInteger(item.qty) && item.qty > 0) {
        items.push({ sync_variant_id: item.variantId, quantity: item.qty });
      } else {
        console.warn('item_' + i + ' missing variantId or qty — skipped');
      }
      if (item) {
        orderItems.push({
          name: item.name || '',
          variantName: item.variantName || '',
          qty: item.qty || 1,
          price: item.price || 0,
        });
      }
    } catch {
      console.error('Failed to parse metadata item_' + i);
    }
  }

  if (items.length === 0) {
    console.warn('No valid Printful items found in metadata');
    return res.status(200).end('OK - no fulfillable items');
  }

  const shipping = session.shipping_details || session.shipping || {};
  const addr = shipping.address || {};
  const recipient = {
    name: shipping.name || session.customer_details?.name || 'Customer',
    address1: addr.line1 || '',
    address2: addr.line2 || '',
    city: addr.city || '',
    state_code: addr.state || '',
    country_code: addr.country || 'US',
    zip: addr.postal_code || '',
    email: session.customer_details?.email || session.customer_email || '',
  };

  try {
    const pfRes = await fetch('https://api.printful.com/orders?confirm=true', {
      method: 'POST',
      headers: { Authorization: `Bearer ${printfulToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient, items }),
    });

    const data = await pfRes.json();
    if (!pfRes.ok) {
      console.error('Printful error:', JSON.stringify(data));
      return res.status(502).end('Printful error: ' + (data.error?.message || 'unknown'));
    }

    console.log('Printful order created and confirmed:', data.result?.id);

    const customerEmail = session.customer_details?.email || session.customer_email || '';
    await writeOrderToFirestore(session.id, {
      customerEmail,
      amountTotal: session.amount_total || 0,
      currency: session.currency || 'usd',
      items: orderItems,
    });

    return res.status(200).end('OK');
  } catch (err) {
    console.error('Printful fetch error:', err.message);
    return res.status(500).end('Internal server error');
  }
};

// Disable Vercel's automatic body parser so we get the raw buffer
module.exports.config = {
  api: { bodyParser: false },
};

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function verifySignature(payload, sigHeader, secret) {
  try {
    const parts = sigHeader.split(',');
    const tPart = parts.find(p => p.startsWith('t='));
    if (!tPart) return false;
    const timestamp = tPart.split('=')[1];
    const sigs = parts.filter(p => p.startsWith('v1=')).map(p => p.slice(3));
    if (!sigs.length) return false;

    // Reject events older than 5 minutes
    if (Math.abs(Date.now() / 1000 - parseInt(timestamp, 10)) > 300) return false;

    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${payload}`)
      .digest('hex');

    return sigs.some(sig => {
      try {
        return crypto.timingSafeEqual(
          Buffer.from(sig, 'hex'),
          Buffer.from(expected, 'hex')
        );
      } catch { return false; }
    });
  } catch { return false; }
}

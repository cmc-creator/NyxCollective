// printful-webhook.js — Vercel API route
// Handles Stripe checkout and payment-intent events with idempotent fulfillment.
// Raw body required for signature verification — bodyParser is disabled below.

const crypto = require('crypto');
const { saveOrder } = require('../lib/firestore-orders');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end('Method not allowed');

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const printfulToken = process.env.PRINTFUL_TOKEN;

  if (!webhookSecret || !printfulToken || !process.env.FIREBASE_PROJECT_ID) {
    console.error('Missing env: STRIPE_WEBHOOK_SECRET, PRINTFUL_TOKEN, or FIREBASE_PROJECT_ID');
    return res.status(500).end('Server configuration error');
  }

  const rawBody = await getRawBody(req);
  const sigHeader = req.headers['stripe-signature'];

  if (!sigHeader) return res.status(400).end('Missing Stripe signature');
  if (!verifySignature(rawBody, sigHeader, webhookSecret)) {
    return res.status(401).end('Invalid signature');
  }

  let order;
  try {
    const payload = JSON.parse(rawBody);
    if (payload.type === 'checkout.session.completed') {
      order = payload.data.object;
    } else if (payload.type === 'payment_intent.succeeded') {
      const payment = payload.data.object;
      const metadata = payment.metadata || {};
      order = {
        id: payment.id,
        payment_status: 'paid',
        amount_total: payment.amount || 0,
        currency: payment.currency || 'usd',
        customer_email: metadata.email || '',
        shipping_details: {
          name: metadata.name || '',
          address: {
            line1: metadata.address1 || '',
            city: metadata.city || '',
            state: metadata.state || '',
            country: metadata.country || 'US',
            postal_code: metadata.zip || '',
          },
        },
        metadata: {
          item_count: '1',
          shipping_id: metadata.shipping_id || '',
          item_0: JSON.stringify({
            variantId: metadata.variant_id,
            qty: Number(metadata.qty) || 1,
            name: metadata.product_name || 'Merchandise',
            variantName: metadata.variant_name || '',
            price: Number(metadata.product_price) || 0,
          }),
        },
      };
    } else {
      return res.status(200).end('OK');
    }
  } catch {
    return res.status(400).end('Invalid JSON');
  }

  const meta = order.metadata || {};
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
      const variantId = Number(item?.variantId);
      if (item && Number.isInteger(variantId) && variantId > 0 && Number.isInteger(item.qty) && item.qty > 0) {
        items.push({ sync_variant_id: variantId, quantity: item.qty });
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

  if (order.payment_status !== 'paid') {
    console.log('Checkout session is not paid — skipping fulfillment');
    return res.status(200).end('OK - payment not complete');
  }

  const shipping = order.shipping_details || order.shipping || {};
  const addr = shipping.address || {};
  const recipient = {
    name: shipping.name || order.customer_details?.name || 'Customer',
    address1: addr.line1 || '',
    address2: addr.line2 || '',
    city: addr.city || '',
    state_code: addr.state || '',
    country_code: addr.country || 'US',
    zip: addr.postal_code || '',
    email: order.customer_details?.email || order.customer_email || '',
  };

  const customerEmail = order.customer_details?.email || order.customer_email || '';
  const orderData = {
    customerEmail,
    amountTotal: order.amount_total || 0,
    currency: order.currency || 'usd',
    items: orderItems,
    fulfillmentStatus: 'processing',
  };

  try {
    const reservation = await saveOrder(order.id, orderData, true);
    if (reservation.status === 409) {
      console.log('Duplicate or previously reserved payment:', order.id);
      return res.status(200).end('OK - already reserved');
    }
    if (!reservation.ok) {
      console.error('Could not reserve payment:', order.id);
      return res.status(500).end('Unable to reserve order');
    }

    const pfRes = await fetch('https://api.printful.com/orders?confirm=true', {
      method: 'POST',
      headers: { Authorization: `Bearer ${printfulToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient, items, shipping: meta.shipping_id || 'STANDARD' }),
    });

    const data = await pfRes.json();
    if (!pfRes.ok) {
      console.error('Printful error:', JSON.stringify(data));
      await saveOrder(order.id, {
        ...orderData,
        fulfillmentStatus: 'failed',
        fulfillmentError: data.error?.message || 'Printful rejected the order',
      });
      return res.status(502).end('Printful error: ' + (data.error?.message || 'unknown'));
    }

    console.log('Printful order created and confirmed:', data.result?.id);
    const savedOrder = await saveOrder(order.id, {
      ...orderData,
      fulfillmentStatus: 'submitted',
      printfulOrderId: data.result?.id,
    });
    if (!savedOrder.ok) return res.status(500).end('Fulfillment submitted; order status update failed');

    return res.status(200).end('OK');
  } catch (err) {
    console.error('Printful fetch error:', err.message);
    await saveOrder(order.id, {
      ...orderData,
      fulfillmentStatus: 'review_required',
      fulfillmentError: err.message,
    }).catch(() => {});
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

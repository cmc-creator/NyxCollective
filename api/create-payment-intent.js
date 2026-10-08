// create-payment-intent.js — Vercel API route
// Creates a Stripe PaymentIntent for merch checkout.
// POST { variantId, qty, shippingId, recipient } → { clientSecret }

const { getShippingRates, getSyncVariant } = require('../lib/printful');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sk = process.env.STRIPE_SECRET_KEY;
  const printfulToken = process.env.PRINTFUL_TOKEN;
  if (!sk) return res.status(500).json({ error: 'Server configuration error' });
  if (!printfulToken) return res.status(500).json({ error: 'Shipping is not configured' });

  const { variantId, qty, shippingId, recipient } = req.body || {};

  const numericVariantId = Number(variantId);
  const quantity = Number(qty);
  const countryCode = String(recipient?.country_code || '').toUpperCase();
  const stateCode = String(recipient?.state_code || '').trim().toUpperCase();
  if (
    !Number.isInteger(numericVariantId) || numericVariantId < 1 ||
    !Number.isInteger(quantity) || quantity < 1 || quantity > 10 ||
    !shippingId || !recipient?.name || !recipient?.address1 || !recipient?.city ||
    !recipient?.zip || !['US', 'CA', 'GB', 'AU', 'NZ', 'DE', 'FR', 'NL', 'SE', 'NO', 'DK', 'FI', 'JP'].includes(countryCode) ||
    (['US', 'CA', 'AU'].includes(countryCode) && !stateCode)
  ) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  let cents;
  let product;
  try {
    const [variant, rates] = await Promise.all([
      getSyncVariant(printfulToken, numericVariantId),
      getShippingRates(printfulToken, {
        address1: String(recipient.address1).trim(),
        city: String(recipient.city).trim(),
        state_code: stateCode,
        country_code: countryCode,
        zip: String(recipient.zip).trim(),
      }, [{ sync_variant_id: numericVariantId, quantity }]),
    ]);
    const shipping = rates.find(rate => String(rate.id) === String(shippingId));
    const shippingPrice = Number.parseFloat(shipping?.rate);
    if (!shipping || !Number.isFinite(shippingPrice) || shippingPrice < 0) {
      return res.status(400).json({ error: 'Invalid shipping option' });
    }
    product = variant;
    cents = Math.round((variant.price * quantity + shippingPrice) * 100);
  } catch (err) {
    console.error('Printful checkout validation failed:', err.message);
    return res.status(502).json({ error: 'Unable to verify product price or shipping' });
  }
  if (!Number.isFinite(cents) || cents < 50) return res.status(400).json({ error: 'Invalid amount' });

  const params = new URLSearchParams();
  params.set('amount', String(cents));
  params.set('currency', 'usd');
  params.set('metadata[variant_id]', String(numericVariantId));
  params.set('metadata[qty]', String(quantity));
  params.set('metadata[shipping_id]', String(shippingId));
  params.set('metadata[product_name]', product.name || 'Merchandise');
  params.set('metadata[product_price]', String(product.price));
  params.set('metadata[variant_name]', product.name || '');
  params.set('metadata[name]', String(recipient.name).trim().slice(0, 200));
  params.set('metadata[email]', String(recipient.email || '').trim().slice(0, 200));
  params.set('metadata[address1]', String(recipient.address1).trim().slice(0, 200));
  params.set('metadata[city]', String(recipient.city).trim().slice(0, 100));
  params.set('metadata[state]', String(recipient.state_code || '').trim().slice(0, 50));
  params.set('metadata[zip]', String(recipient.zip).trim().slice(0, 20));
  params.set('metadata[country]', String(recipient.country_code || 'US').trim().slice(0, 2));

  try {
    const stripeRes = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sk}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await stripeRes.json();
    if (!stripeRes.ok) return res.status(400).json({ error: data.error?.message || 'Stripe error' });
    return res.status(200).json({ clientSecret: data.client_secret });
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
};

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://nyxcollectivellc.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

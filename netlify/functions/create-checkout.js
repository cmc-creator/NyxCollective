exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return respond(200, '');
  }

  if (event.httpMethod !== 'POST') {
    return respond(405, JSON.stringify({ error: 'Method not allowed' }));
  }

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return respond(500, JSON.stringify({ error: 'Server configuration error' }));
  }

  let items;
  try {
    ({ items } = JSON.parse(event.body || '{}'));
    if (!Array.isArray(items) || items.length === 0) throw new Error('Empty cart');
  } catch {
    return respond(400, JSON.stringify({ error: 'Invalid request body' }));
  }

  // Validate each item before sending to Stripe
  for (const item of items) {
    if (
      typeof item.name !== 'string' || !item.name.trim() ||
      typeof item.price !== 'number' || item.price <= 0 || !isFinite(item.price) ||
      !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 99
    ) {
      return respond(400, JSON.stringify({ error: 'Invalid item in cart' }));
    }
  }

  // Build x-www-form-urlencoded body for Stripe REST API (no npm required)
  const params = new URLSearchParams();
  params.append('mode', 'payment');
  params.append('success_url', 'https://nyxcollectivellc.com/merch?success=true');
  params.append('cancel_url', 'https://nyxcollectivellc.com/merch');
  params.append('payment_method_types[0]', 'card');

  // Embed fulfillment + order history data in metadata
  params.append('metadata[item_count]', String(items.length));
  items.forEach((item, i) => {
    params.append(`metadata[item_${i}]`, JSON.stringify({
      variantId: item.variantId || null,
      qty: item.qty,
      name: (item.name || '').trim().slice(0, 80),
      variantName: typeof item.variantName === 'string' ? item.variantName.slice(0, 60) : '',
      price: typeof item.price === 'number' ? item.price : 0,
    }));
  });

  // Collect shipping address at checkout
  const countries = ['US', 'CA', 'GB', 'AU', 'NZ', 'DE', 'FR', 'NL', 'SE', 'NO', 'DK', 'FI', 'JP'];
  countries.forEach((c, i) => {
    params.append(`shipping_address_collection[allowed_countries][${i}]`, c);
  });

  items.forEach((item, i) => {
    params.append(`line_items[${i}][quantity]`, String(item.qty));
    params.append(`line_items[${i}][price_data][currency]`, 'usd');
    params.append(`line_items[${i}][price_data][unit_amount]`, String(Math.round(item.price * 100)));
    params.append(`line_items[${i}][price_data][product_data][name]`, item.name.trim());
    // Only attach image if it's a valid https URL (Stripe requirement)
    if (typeof item.thumbnail === 'string' && /^https:\/\/.+/.test(item.thumbnail)) {
      params.append(`line_items[${i}][price_data][product_data][images][0]`, item.thumbnail);
    }
  });

  try {
    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await res.json();

    if (!res.ok) {
      return respond(res.status, JSON.stringify({ error: data.error?.message || 'Stripe error' }));
    }

    return respond(200, JSON.stringify({ url: data.url }));
  } catch {
    return respond(500, JSON.stringify({ error: 'Internal server error' }));
  }
};

function respond(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
    body,
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(), body: '' };
  if (event.httpMethod !== 'POST') return respond(405, { error: 'Method not allowed' });

  const token = process.env.PRINTFUL_TOKEN;
  if (!token) return respond(500, { error: 'Server configuration error' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return respond(400, { error: 'Invalid JSON' }); }

  const { variantId, quantity, address } = body;
  if (!variantId || !address?.city || !address?.zip) {
    return respond(400, { error: 'Missing required fields: variantId, address.city, address.zip' });
  }

  try {
    const res = await fetch('https://api.printful.com/shipping/rates', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: {
          address1: address.address1 || '',
          city: address.city,
          state_code: address.state_code || '',
          country_code: address.country_code || 'US',
          zip: address.zip
        },
        items: [{ sync_variant_id: parseInt(variantId, 10), quantity: parseInt(quantity, 10) || 1 }]
      })
    });

    const data = await res.json();
    if (!res.ok) return respond(502, { error: 'Shipping rates unavailable', details: data });
    return respond(200, data.result || []);
  } catch {
    return respond(500, { error: 'Internal server error' });
  }
};

function respond(status, body) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json', ...corsHeaders() }, body: JSON.stringify(body) };
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
}

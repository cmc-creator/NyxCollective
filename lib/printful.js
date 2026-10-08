async function getSyncVariant(token, variantId) {
  const response = await fetch(`https://api.printful.com/store/variants/${variantId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json();
  const variant = data.result?.sync_variant || data.result;
  const price = Number.parseFloat(variant?.retail_price);
  if (!response.ok || !variant || !Number.isFinite(price) || price <= 0) {
    throw new Error('Printful product price unavailable');
  }
  return { price, name: variant.name || '' };
}

async function getShippingRates(token, recipient, items) {
  const response = await fetch('https://api.printful.com/shipping/rates', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient, items, currency: 'USD' }),
  });
  const data = await response.json();
  if (!response.ok || !Array.isArray(data.result)) {
    throw new Error('Printful shipping rates unavailable');
  }
  return data.result;
}

module.exports = { getShippingRates, getSyncVariant };
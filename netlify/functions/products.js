exports.handler = async () => {
  const token = process.env.PRINTFUL_TOKEN;

  if (!token) {
    return respond(500, { error: 'Server configuration error' });
  }

  try {
    // Fetch product list from Printful
    const listRes = await fetch('https://api.printful.com/store/products', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!listRes.ok) {
      const err = await listRes.json().catch(() => ({}));
      return respond(502, { error: 'Failed to reach Printful', details: err });
    }

    const list = await listRes.json();

    if (!list.result || !list.result.length) {
      return respond(200, []);
    }

    // Fetch variant details for each product to get pricing
    const products = await Promise.all(
      list.result.map(async (p) => {
        try {
          const detailRes = await fetch(`https://api.printful.com/store/products/${p.id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const detail = await detailRes.json();
          const variants = detail.result?.sync_variants || [];
          const prices = variants
            .map(v => parseFloat(v.retail_price))
            .filter(x => !isNaN(x) && x > 0);

          return {
            id: p.id,
            name: p.name,
            thumbnail: p.thumbnail_url || null,
            variants: p.variants,
            minPrice: prices.length ? Math.min(...prices).toFixed(2) : null,
            maxPrice: prices.length ? Math.max(...prices).toFixed(2) : null,
            variantDetails: variants.map(v => ({ name: v.name, price: v.retail_price, variantId: v.id }))
          };
        } catch {
          return {
            id: p.id,
            name: p.name,
            thumbnail: p.thumbnail_url || null,
            variants: p.variants,
            minPrice: null,
            maxPrice: null,
            variantDetails: []
          };
        }
      })
    );

    return respond(200, products, { 'Cache-Control': 'public, max-age=300' });

  } catch (err) {
    return respond(500, { error: 'Internal server error' });
  }
};

function respond(statusCode, body, extra = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      ...extra
    },
    body: JSON.stringify(body)
  };
}

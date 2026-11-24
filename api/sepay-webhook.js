export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) return res.status(500).json({ error: 'Missing env' });

  const body = req.body || {};
  if (body.transferType && body.transferType !== 'in') return res.status(200).json({ ok: true });

  const text = `${body.content || ''} ${body.description || ''}`.toUpperCase();
  const match = text.match(/TVCT\d{6}/);
  if (!match) return res.status(200).json({ ignored: true });

  const orderCode = match[0];
  const amount = Number(body.transferAmount || 0);
  const headers = {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json'
  };

  try {
    const orderRes = await fetch(`${SUPABASE_URL}/rest/v1/orders?order_code=eq.${orderCode}&select=*`, { headers });
    const orders = await orderRes.json();
    const order = orders && orders[0];
    if (!order || order.status === 'paid') return res.status(200).json({ ok: true });
    if (amount < Number(order.total_amount || 0)) return res.status(200).json({ insufficient: true });

    await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${order.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status: 'paid' })
    });

    const assets = (order.items || []).map(item => ({
      user_id: order.user_id || null,
      user_email: order.user_email,
      asset_type: item.type,
      asset_name: item.name,
      drive_url: item.url
    }));

    if (assets.length > 0) {
      await fetch(`${SUPABASE_URL}/rest/v1/user_assets`, {
        method: 'POST',
        headers,
        body: JSON.stringify(assets)
      });
    }

    return res.status(200).json({ success: true, orderCode });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

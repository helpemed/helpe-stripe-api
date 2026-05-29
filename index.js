/**
 * HelpE — API Stripe Checkout (Render / Node)
 * POST /api/create-checkout-session
 * POST /api/stripe/webhook
 */
require('dotenv').config();

const express = require('express');
const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const PORT = Number(process.env.PORT) || 4242;
const SITE_URL = (process.env.SITE_URL || 'https://helpe-med.com').replace(/\/$/, '');

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const priceId = process.env.STRIPE_PRICE_ID || process.env.STRIPE_PRICE_FORMATION;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const stripe = stripeSecret ? new Stripe(stripeSecret) : null;
const supabase =
  supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

const app = express();

function cors(req, res, next) {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Stripe-Signature');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
}

app.use(cors);

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'helpe-stripe-api',
    stripe: Boolean(stripe),
    supabase: Boolean(supabase),
    priceConfigured: Boolean(priceId),
  });
});

app.get('/api/stripe/diagnostic', async (_req, res) => {
  if (!stripe || !priceId) {
    return res.status(503).json({
      ok: false,
      error: 'STRIPE_SECRET_KEY ou STRIPE_PRICE_ID / STRIPE_PRICE_FORMATION manquant.',
    });
  }

  const mode = stripeSecret.startsWith('sk_live_') ? 'live' : 'test';

  try {
    const price = await stripe.prices.retrieve(priceId);
    return res.json({
      ok: true,
      stripeMode: mode,
      priceId,
      priceActive: price.active,
      priceType: price.type,
      currency: price.currency,
      unitAmount: price.unit_amount,
      hint:
        price.type !== 'one_time'
          ? 'Ce prix doit être « paiement unique » (one_time), pas un abonnement.'
          : null,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      stripeMode: mode,
      priceId,
      error: err.message,
      hint:
        /no such price/i.test(err.message)
          ? 'Price ID introuvable : vérifie test vs live dans Stripe, ou recopie le bon price_... depuis Produit → Tarifs.'
          : 'Vérifie que STRIPE_SECRET_KEY et STRIPE_PRICE_ID viennent du même mode Stripe (test ou live).',
    });
  }
});

app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    if (!stripe || !webhookSecret || !supabase) {
      console.error('[webhook] Missing STRIPE or SUPABASE config');
      return res.status(503).send('Service not configured');
    }

    const sig = req.headers['stripe-signature'];
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error('[webhook] Signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const email =
        session.customer_details?.email ||
        session.customer_email ||
        session.metadata?.email ||
        null;

      if (email) {
        const { error } = await supabase.from('helpe_formation_buyers').upsert(
          {
            email: email.trim().toLowerCase(),
            stripe_session_id: session.id,
            stripe_customer_id:
              typeof session.customer === 'string' ? session.customer : null,
            paid_at: new Date().toISOString(),
          },
          { onConflict: 'email' }
        );
        if (error) console.error('[webhook] Supabase upsert failed:', error.message);
        else console.log('[webhook] Buyer recorded:', email);
      } else {
        console.warn('[webhook] checkout.session.completed without email', session.id);
      }
    }

    res.json({ received: true });
  }
);

app.use(express.json({ limit: '32kb' }));

app.post('/api/create-checkout-session', async (req, res) => {
  if (!stripe || !priceId) {
    return res.status(503).json({
      error: 'Paiement indisponible (configuration serveur incomplète).',
    });
  }

  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Adresse e-mail invalide.' });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${SITE_URL}/merci-formation.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/offres.html?checkout=cancelled`,
      metadata: { email, product: 'formation_autonome' },
      locale: 'fr',
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('[checkout] Stripe error:', err.message);
    res.status(500).json({
      error: 'Impossible de créer la session de paiement. Réessayez dans un instant.',
      code: err.code || undefined,
      detail: err.message,
    });
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`HelpE Stripe API listening on port ${PORT}`);
  if (!stripeSecret) console.warn('WARN: STRIPE_SECRET_KEY missing');
  if (!priceId) console.warn('WARN: STRIPE_PRICE_ID missing');
  if (!webhookSecret) console.warn('WARN: STRIPE_WEBHOOK_SECRET missing (webhooks disabled until set)');
  if (!supabase) console.warn('WARN: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing');
});

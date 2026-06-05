/**
 * HelpE — API Stripe Checkout (Render / Node)
 * POST /api/create-checkout-session
 * POST /api/stripe/webhook
 */
require('dotenv').config();

const express = require('express');
const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');
const { activateBuyerAccess, sendPasswordResetEmail, resolveAuthLink } = require('./formation-purchase-email');
const { fulfillBlueprintCheckout } = require('./blueprint-purchase-email');
const { validateBlueprintIntake, buildOrderRow } = require('./blueprint-intake');
const { validateDiagnosticIntake, buildIntakeRow } = require('./diagnostic-intake');
const { sendDiagnosticIntakeEmails } = require('./diagnostic-intake-email');

const PORT = Number(process.env.PORT) || 4242;
const SITE_URL = (process.env.SITE_URL || 'https://helpe-med.com').replace(/\/$/, '');

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const priceId = process.env.STRIPE_PRICE_ID || process.env.STRIPE_PRICE_FORMATION;
const priceBlueprint =
  process.env.STRIPE_PRICE_BLUEPRINT || process.env.STRIPE_PRICE_ID_BLUEPRINT;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

function isBlueprintProduct(meta) {
  const p = meta?.helpe_product || meta?.product;
  return p === 'blueprint_679' || p === 'blueprint';
}

async function createStripeCheckoutSession({ product, email, orderId }) {
  const isBlueprint = product === 'blueprint' || product === 'blueprint_679';

  if (isBlueprint) {
    if (!priceBlueprint) {
      throw new Error('STRIPE_PRICE_BLUEPRINT non configuré sur le serveur.');
    }
    if (!orderId) {
      throw new Error('order_id requis pour le paiement Blueprint.');
    }
    return stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: email || undefined,
      line_items: [{ price: priceBlueprint, quantity: 1 }],
      success_url: `${SITE_URL}/merci-blueprint.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/blueprint.html`,
      metadata: {
        helpe_product: 'blueprint_679',
        product: 'blueprint_679',
        order_id: String(orderId),
        email: email || '',
      },
      locale: 'fr',
    });
  }

  if (!priceId) {
    throw new Error('STRIPE_PRICE_ID non configuré.');
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Adresse e-mail invalide.');
  }

  return stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: email,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${SITE_URL}/merci-formation.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${SITE_URL}/offres.html?checkout=cancelled`,
    metadata: { email, helpe_product: 'formation_autonome', product: 'formation_autonome' },
    locale: 'fr',
  });
}
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
    blueprintPriceConfigured: Boolean(priceBlueprint),
    resend: Boolean(process.env.RESEND_API_KEY),
    inviteAfterPurchase: process.env.HELPE_INVITE_AFTER_PURCHASE !== 'false',
    blueprintIntake: Boolean(supabase),
    diagnosticIntake: Boolean(supabase),
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

app.get('/api/stripe/diagnostic-blueprint', async (_req, res) => {
  if (!stripe || !priceBlueprint) {
    return res.status(503).json({
      ok: false,
      error: 'STRIPE_SECRET_KEY ou STRIPE_PRICE_BLUEPRINT manquant.',
    });
  }

  const mode = stripeSecret.startsWith('sk_live_') ? 'live' : 'test';

  try {
    const price = await stripe.prices.retrieve(priceBlueprint);
    const expectedCents = 67900;
    return res.json({
      ok: true,
      product: 'blueprint_679',
      stripeMode: mode,
      priceId: priceBlueprint,
      priceActive: price.active,
      priceType: price.type,
      currency: price.currency,
      unitAmount: price.unit_amount,
      amountMatches679:
        price.currency === 'eur' && price.unit_amount === expectedCents,
      hint:
        price.type !== 'one_time'
          ? 'Ce prix doit être paiement unique (one_time).'
          : price.unit_amount !== expectedCents
            ? 'Montant attendu : 67900 centimes (679 € TTC). Vérifie le tarif dans Stripe.'
            : null,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      stripeMode: mode,
      priceId: priceBlueprint,
      error: err.message,
      hint: /no such price/i.test(err.message)
        ? 'Price ID introuvable : même mode test/live que STRIPE_SECRET_KEY.'
        : null,
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

      if (isBlueprintProduct(session.metadata)) {
        const result = await fulfillBlueprintCheckout(supabase, session, SITE_URL);
        if (!result.ok) {
          console.error('[webhook] fulfillBlueprintCheckout failed:', result.error, session.id);
          return res.status(500).json({ error: result.error });
        }
        console.log('[webhook] Blueprint paid:', result.order_id, result.blueprint_id);
      } else {
        const email =
          session.customer_details?.email ||
          session.customer_email ||
          session.metadata?.email ||
          null;

        if (email) {
          const result = await activateBuyerAccess(supabase, email, SITE_URL, {
            sessionId: session.id,
          });
          if (!result.ok) {
            console.error('[webhook] activateBuyerAccess failed:', result.error);
            return res.status(500).json({ error: 'Supabase upsert failed', detail: result.error });
          }
        } else {
          console.warn('[webhook] checkout.session.completed without email', session.id);
        }
      }
    }

    res.json({ received: true });
  }
);

app.use(express.json({ limit: '32kb' }));

app.post('/api/confirm-checkout-session', async (req, res) => {
  if (!stripe || !supabase) {
    return res.status(503).json({ error: 'Service non configuré.' });
  }

  const sessionId = typeof req.body?.session_id === 'string' ? req.body.session_id.trim() : '';
  if (!sessionId || !sessionId.startsWith('cs_')) {
    return res.status(400).json({ error: 'session_id invalide.' });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== 'paid') {
      return res.status(402).json({
        ok: false,
        payment_status: session.payment_status,
        error: 'Paiement non finalisé.',
      });
    }

    if (isBlueprintProduct(session.metadata)) {
      const result = await fulfillBlueprintCheckout(supabase, session, SITE_URL);
      if (!result.ok) {
        console.error('[confirm] fulfillBlueprintCheckout failed:', result.error);
        return res.status(500).json({ ok: false, error: result.error });
      }
      return res.json({
        ok: true,
        product: 'blueprint_679',
        order_id: result.order_id,
        blueprint_id: result.blueprint_id,
        email: result.email,
        alreadyPaid: result.alreadyPaid,
        resend: result.resend,
      });
    }

    const email =
      session.customer_details?.email ||
      session.customer_email ||
      session.metadata?.email ||
      null;

    if (!email) {
      return res.status(422).json({ ok: false, error: 'E-mail introuvable sur la session Stripe.' });
    }

    const result = await activateBuyerAccess(supabase, email, SITE_URL, { sessionId });
    if (!result.ok) {
      console.error('[confirm] activateBuyerAccess failed:', result.error);
      return res.status(500).json({ ok: false, error: result.error });
    }

    return res.json({
      ok: true,
      product: 'formation_autonome',
      email: result.email,
      invite: result.passwordLink,
      resend: result.resend,
    });
  } catch (err) {
    console.error('[confirm] Stripe error:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/auth-link/:token', async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: 'Service non configuré.' });
  }

  const token = typeof req.params.token === 'string' ? req.params.token.trim() : '';
  const result = await resolveAuthLink(supabase, token);

  if (!result.ok) {
    const status = result.error === 'expired' ? 410 : 404;
    return res.status(status).json({
      error:
        result.error === 'expired'
          ? 'Ce lien a expiré. Demandez un nouvel e-mail depuis la page de connexion.'
          : 'Lien invalide.',
    });
  }

  return res.json({ url: result.url });
});

app.post('/api/send-password-reset', async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: 'Service non configuré.' });
  }

  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Adresse e-mail invalide.' });
  }

  try {
    const result = await sendPasswordResetEmail({ supabase, email, siteUrl: SITE_URL });

    if (!result.ok) {
      console.error('[reset] sendPasswordResetEmail failed:', result.error);
      return res.status(500).json({
        error: 'Impossible d’envoyer l’e-mail pour le moment. Réessayez ou contactez contact@helpe-med.com.',
      });
    }

    return res.json({
      ok: true,
      message:
        'Si un compte existe pour cette adresse, un e-mail de réinitialisation vient d’être envoyé. Vérifiez votre boîte mail (et vos spams).',
    });
  } catch (err) {
    console.error('[reset] error:', err.message);
    return res.status(500).json({ error: 'Erreur serveur. Réessayez dans un instant.' });
  }
});

app.post('/api/diagnostic-intake', async (req, res) => {
  if (!supabase) {
    return res.status(503).json({
      error: 'Service diagnostic indisponible (Supabase non configuré).',
    });
  }

  const validation = validateDiagnosticIntake(req.body);
  if (!validation.ok) {
    return res.status(400).json({ error: validation.errors.join(' '), errors: validation.errors });
  }

  const row = buildIntakeRow(req.body);

  try {
    const { data, error } = await supabase
      .from('helpe_diagnostic_intake')
      .insert(row)
      .select('id, segment_code, pre_diag, created_at, email, prenom, nom')
      .single();

    if (error) {
      console.error('[diagnostic-intake] Supabase insert failed:', error.message);
      const hint =
        error.code === '42P01' || /does not exist/i.test(error.message)
          ? 'Exécutez website/supabase/helpe_diagnostic_intake.sql dans Supabase.'
          : undefined;
      return res.status(500).json({
        error: 'Enregistrement impossible. Réessayez ou contactez contact@helpe-med.com.',
        detail: error.message,
        hint,
      });
    }

    let emailResult = { ok: false, skipped: true };
    try {
      emailResult = await sendDiagnosticIntakeEmails({
        supabase,
        intakeId: data.id,
        siteUrl: SITE_URL,
      });
    } catch (mailErr) {
      console.error('[diagnostic-intake] email:', mailErr.message);
    }

    return res.json({
      ok: true,
      intake_id: data.id,
      segment_code: data.segment_code,
      pre_diag: data.pre_diag,
      email: data.email,
      prenom: data.prenom,
      nom: data.nom,
      message:
        'Questionnaire enregistré. Choisissez maintenant votre créneau pour finaliser la réservation.',
      emails: emailResult,
    });
  } catch (err) {
    console.error('[diagnostic-intake] error:', err.message);
    return res.status(500).json({ error: 'Erreur serveur. Réessayez dans un instant.' });
  }
});

app.post('/api/blueprint-intake', async (req, res) => {
  if (!supabase) {
    return res.status(503).json({
      error: 'Service Blueprint indisponible (Supabase non configuré).',
    });
  }

  const validation = validateBlueprintIntake(req.body);
  if (!validation.ok) {
    return res.status(400).json({ error: validation.errors.join(' '), errors: validation.errors });
  }

  const row = buildOrderRow(req.body);

  try {
    const { data, error } = await supabase
      .from('helpe_blueprint_orders')
      .insert(row)
      .select('id, blueprint_id, created_at, status')
      .single();

    if (error) {
      console.error('[blueprint-intake] Supabase insert failed:', error.message);
      const hint =
        error.code === '42P01' || /does not exist/i.test(error.message)
          ? 'Exécutez website/supabase/helpe_blueprint_orders.sql dans Supabase.'
          : undefined;
      return res.status(500).json({
        error: 'Enregistrement impossible. Réessayez ou contactez contact@helpe-med.com.',
        detail: error.message,
        hint,
      });
    }

    const payload = {
      ok: true,
      order_id: data.id,
      blueprint_id: data.blueprint_id,
      status: data.status,
      email: row.email,
      message:
        'Demande enregistrée. Vous allez être redirigé vers le paiement sécurisé Stripe (679 € TTC).',
    };

    if (stripe && priceBlueprint) {
      try {
        const session = await createStripeCheckoutSession({
          product: 'blueprint',
          email: row.email,
          orderId: data.id,
        });
        payload.checkout_url = session.url;
        payload.checkout_session_id = session.id;
      } catch (checkoutErr) {
        console.error('[blueprint-intake] checkout session:', checkoutErr.message);
        payload.checkout_error = checkoutErr.message;
        payload.message =
          'Demande enregistrée. Le paiement en ligne est momentanément indisponible : nous vous envoyons le lien Stripe sous 24 h à ' +
          row.email +
          '.';
      }
    } else {
      payload.message =
        'Demande enregistrée. Nous vous envoyons le lien de paiement Stripe sous 24 h à ' + row.email + '.';
    }

    return res.json(payload);
  } catch (err) {
    console.error('[blueprint-intake] error:', err.message);
    return res.status(500).json({ error: 'Erreur serveur. Réessayez dans un instant.' });
  }
});

app.post('/api/create-checkout-session', async (req, res) => {
  if (!stripe) {
    return res.status(503).json({
      error: 'Paiement indisponible (configuration serveur incomplète).',
    });
  }

  const product = req.body?.product === 'blueprint' ? 'blueprint' : 'formation';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
  const orderId = typeof req.body?.order_id === 'string' ? req.body.order_id.trim() : '';

  try {
    const session = await createStripeCheckoutSession({ product, email, orderId });
    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('[checkout] Stripe error:', err.message);
    const status =
      err.message?.includes('requis') ||
      err.message?.includes('invalide') ||
      err.message?.includes('configuré')
        ? 400
        : 500;
    res.status(status).json({
      error: err.message || 'Impossible de créer la session de paiement. Réessayez dans un instant.',
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
  if (!priceBlueprint) console.warn('WARN: STRIPE_PRICE_BLUEPRINT missing (Blueprint checkout disabled)');
  if (!webhookSecret) console.warn('WARN: STRIPE_WEBHOOK_SECRET missing (webhooks disabled until set)');
  if (!supabase) console.warn('WARN: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing');
  if (!process.env.RESEND_API_KEY) console.warn('WARN: RESEND_API_KEY missing (no branded post-purchase email)');
});

/**
 * Blueprint 679 € — paiement confirmé + e-mail Resend
 */

const { sendResendEmail, emailShell } = require('./formation-purchase-email');

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildBlueprintThankYouEmail({ siteUrl, prenom, blueprintId }) {
  const name = prenom ? escapeHtml(prenom) : 'Bonjour';
  const model = escapeHtml(blueprintId || 'votre profil');
  const subject = 'Paiement Blueprint confirmé — HelpE';

  const body = `
          <p>${name},</p>
          <p>Votre paiement pour le <strong>Blueprint Visibilité 90j</strong> (679&nbsp;€ TTC) est bien enregistré.</p>
          <p>Modèle stratégique calculé pour votre situation : <strong>${model}</strong>.</p>
          <p><strong>Prochaine étape :</strong> nous préparons votre plan personnalisé (PDF, scripts, checklist) et la vidéo explicative. Livraison sous <strong>5 jours ouvrés</strong> à cette adresse e-mail.</p>
          <p style="font-size:14px;color:#64748b;">Une retouche est incluse sous 14 jours si le plan ne reflète pas ce que vous avez décrit dans le formulaire.</p>
          <p style="font-size:14px;color:#64748b;margin-top:20px;">Question ? Répondez à cet e-mail ou écrivez à <a href="mailto:contact@helpe-med.com" style="color:#1a6fb5;">contact@helpe-med.com</a>.</p>`;

  const text = `Paiement Blueprint HelpE confirmé.

Modèle : ${blueprintId || '—'}
Livraison sous 5 jours ouvrés (PDF + vidéo explicative).

HelpE — contact@helpe-med.com`;

  return { subject, html: emailShell('Blueprint confirmé', body), text };
}

async function markBlueprintOrderPaid(supabase, { orderId, sessionId }) {
  if (!orderId) {
    return { ok: false, error: 'order_id manquant dans la session Stripe.' };
  }

  const { data: existing, error: fetchError } = await supabase
    .from('helpe_blueprint_orders')
    .select('id, status, email, prenom, blueprint_id')
    .eq('id', orderId)
    .maybeSingle();

  if (fetchError) {
    return { ok: false, error: fetchError.message };
  }
  if (!existing) {
    return { ok: false, error: 'Commande Blueprint introuvable.' };
  }

  if (existing.status === 'paid' || existing.status === 'delivered') {
    return { ok: true, alreadyPaid: true, order: existing };
  }

  const { error: updateError } = await supabase
    .from('helpe_blueprint_orders')
    .update({
      status: 'paid',
      stripe_session_id: sessionId || null,
      paid_at: new Date().toISOString(),
    })
    .eq('id', orderId);

  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  return { ok: true, alreadyPaid: false, order: existing };
}

async function sendBlueprintPurchaseEmails({ supabase, orderId, siteUrl }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.HELPE_RESEND_FROM || 'HelpE <onboarding@resend.dev>';

  if (!apiKey) {
    console.warn('[blueprint] RESEND_API_KEY missing — pas d’e-mail client');
    return { ok: false, skipped: true, error: 'RESEND_API_KEY missing' };
  }

  const { data: order, error } = await supabase
    .from('helpe_blueprint_orders')
    .select('email, prenom, blueprint_id, status')
    .eq('id', orderId)
    .maybeSingle();

  if (error || !order?.email) {
    return { ok: false, error: error?.message || 'order not found' };
  }

  const mail = buildBlueprintThankYouEmail({
    siteUrl,
    prenom: order.prenom,
    blueprintId: order.blueprint_id,
  });

  const sent = await sendResendEmail({
    apiKey,
    from,
    to: order.email,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  });

  if (!sent.ok) {
    console.error('[blueprint] Resend failed:', sent.error);
    return { ok: false, error: sent.error };
  }

  console.log('[blueprint] Confirmation e-mail sent:', order.email, order.blueprint_id);
  return { ok: true, email: order.email, resendId: sent.id };
}

async function fulfillBlueprintCheckout(supabase, session, siteUrl) {
  const orderId = session.metadata?.order_id || session.metadata?.helpe_order_id;
  const mark = await markBlueprintOrderPaid(supabase, {
    orderId,
    sessionId: session.id,
  });

  if (!mark.ok) {
    return mark;
  }

  let resend = { ok: false, skipped: true };
  if (!mark.alreadyPaid) {
    resend = await sendBlueprintPurchaseEmails({ supabase, orderId, siteUrl });
  }

  return {
    ok: true,
    order_id: orderId,
    blueprint_id: mark.order?.blueprint_id,
    email: mark.order?.email,
    alreadyPaid: mark.alreadyPaid,
    resend,
  };
}

module.exports = {
  buildBlueprintThankYouEmail,
  markBlueprintOrderPaid,
  sendBlueprintPurchaseEmails,
  fulfillBlueprintCheckout,
};

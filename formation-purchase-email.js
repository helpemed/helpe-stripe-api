/**
 * E-mail post-achat formation — Resend + lien mot de passe (generateLink Supabase)
 */

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isExistingAuthUserError(message) {
  const msg = String(message || '').toLowerCase();
  return (
    msg.includes('already been registered') ||
    msg.includes('already registered') ||
    msg.includes('user already') ||
    msg.includes('duplicate') ||
    msg.includes('exists')
  );
}

function emailShell(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
        <tr><td style="background:linear-gradient(135deg,#1a1f2e,#1a3a5c);padding:28px 32px;color:#fff;">
          <div style="font-size:18px;font-weight:800;">Help<span style="color:#60a5fa;">E</span></div>
          <p style="margin:16px 0 0;font-size:22px;font-weight:800;line-height:1.3;">${title}</p>
        </td></tr>
        <tr><td style="padding:28px 32px;color:#1a1f2e;font-size:15px;line-height:1.65;">
          ${bodyHtml}
          <p style="font-size:13px;color:#64748b;margin-top:32px;border-top:1px solid #e2e8f0;padding-top:16px;">
            HelpE · Développement de patientèle pour les professionnels de santé libéraux<br>
            <a href="mailto:contact@helpe-med.com" style="color:#1a6fb5;">contact@helpe-med.com</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildThankYouEmail(siteUrl) {
  const base = siteUrl.replace(/\/$/, '');
  const subject = 'Merci pour votre achat — HelpE';

  const body = `
          <p>Votre paiement pour la <strong>formation autonome HelpE</strong> est bien enregistré.</p>
          <p>Vous allez recevoir dans un instant un <strong>second e-mail</strong> avec le lien pour <strong>choisir votre mot de passe</strong> et ouvrir votre espace formation.</p>
          <p style="font-size:14px;color:#64748b;">Pensez à vérifier vos courriers indésirables. Utilisez <strong>exactement la même adresse e-mail</strong> que lors du paiement.</p>
          <p style="font-size:14px;color:#64748b;margin-top:20px;">Accès à vie · Mises à jour incluses · Support e-mail 30 jours.</p>`;

  const text = `Merci pour votre achat HelpE.

Votre paiement pour la formation autonome est bien enregistré.

Vous allez recevoir un second e-mail avec le lien pour choisir votre mot de passe et accéder à la formation.

HelpE — contact@helpe-med.com`;

  return { subject, html: emailShell('Merci pour votre confiance', body), text };
}

function buildPasswordSetupEmail(siteUrl, passwordSetupUrl) {
  const base = siteUrl.replace(/\/$/, '');
  const loginUrl = `${base}/login.html?redirect=formation.html`;
  const subject = 'Définir votre mot de passe — accès formation HelpE';

  const setupBlock = passwordSetupUrl
    ? `<p>Cliquez ci-dessous pour <strong>choisir votre mot de passe</strong> (lien personnel, valable environ une heure) :</p>
          <table cellpadding="0" cellspacing="0" style="margin:28px 0 8px;"><tr><td style="background:#1a6fb5;border-radius:50px;">
            <a href="${escapeHtml(passwordSetupUrl)}" style="display:inline-block;padding:14px 28px;color:#ffffff;font-weight:700;font-size:15px;text-decoration:none;">Définir mon mot de passe →</a>
          </td></tr></table>`
    : `<p>Connectez-vous ou utilisez « Mot de passe oublié » sur la page de connexion :</p>
          <table cellpadding="0" cellspacing="0" style="margin:28px 0 8px;"><tr><td style="background:#1a6fb5;border-radius:50px;">
            <a href="${loginUrl}" style="display:inline-block;padding:14px 28px;color:#ffffff;font-weight:700;font-size:15px;text-decoration:none;">Accéder à ma formation →</a>
          </td></tr></table>`;

  const body = `
          <p>Votre accès à la formation est prêt.</p>
          ${setupBlock}
          <p style="font-size:13px;color:#64748b;margin-top:24px;">Déjà un compte HelpE ? <a href="${loginUrl}" style="color:#1a6fb5;font-weight:600;">Connectez-vous ici</a>.</p>`;

  const text = passwordSetupUrl
    ? `Définissez votre mot de passe pour accéder à la formation HelpE :\n${passwordSetupUrl}\n\nConnexion : ${loginUrl}`
    : `Accédez à votre formation : ${loginUrl}`;

  return { subject, html: emailShell('Activez votre accès', body), text };
}

/** @deprecated kept for tests — use buildThankYouEmail + buildPasswordSetupEmail */
function buildFormationPurchaseEmail(siteUrl, passwordSetupUrl) {
  return buildPasswordSetupEmail(siteUrl, passwordSetupUrl);
}

async function sendResendEmail({ apiKey, from, to, subject, html, text }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.message || `Resend HTTP ${res.status}`;
    return { ok: false, error: msg };
  }
  return { ok: true, id: data.id ?? null };
}

async function generatePasswordSetupLink(supabase, email, siteUrl) {
  const redirectTo = `${siteUrl.replace(/\/$/, '')}/reset-password.html`;

  async function tryLink(type) {
    const { data, error } = await supabase.auth.admin.generateLink({
      type,
      email,
      options: { redirectTo },
    });
    if (error) return { error: error.message, link: null };
    const link = data?.properties?.action_link || null;
    if (!link) return { error: 'action_link missing', link: null };
    return { error: null, link, type };
  }

  let result = await tryLink('invite');
  if (result.link) {
    console.log('[access] Lien mot de passe (invite):', email);
    return result;
  }

  if (isExistingAuthUserError(result.error)) {
    result = await tryLink('recovery');
    if (result.link) {
      console.log('[access] Lien mot de passe (recovery):', email);
      return result;
    }
  }

  console.warn('[access] generateLink invite/recovery échec, tentative createUser:', result.error);
  const { error: createError } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
  });

  if (createError && !isExistingAuthUserError(createError.message)) {
    console.error('[access] createUser:', createError.message);
    return { error: createError.message, link: null };
  }

  result = await tryLink('recovery');
  if (result.link) {
    console.log('[access] Lien mot de passe (recovery après create):', email);
    return result;
  }

  result = await tryLink('invite');
  if (result.link) {
    console.log('[access] Lien mot de passe (invite après create):', email);
    return result;
  }

  console.error('[access] Impossible de générer le lien mot de passe:', result.error);
  return { error: result.error || 'generateLink failed', link: null };
}

async function sendPostPurchaseEmails({ email, siteUrl, passwordSetupUrl }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.HELPE_RESEND_FROM || 'HelpE <onboarding@resend.dev>';

  if (!apiKey) {
    console.warn('[access] RESEND_API_KEY absent — pas d’e-mail Resend post-achat');
    return { ok: false, skipped: true };
  }

  const thankYou = buildThankYouEmail(siteUrl);
  const thankYouResult = await sendResendEmail({
    apiKey,
    from,
    to: email,
    subject: thankYou.subject,
    html: thankYou.html,
    text: thankYou.text,
  });

  if (!thankYouResult.ok) {
    console.error('[access] Resend remerciement:', thankYouResult.error);
    return { ok: false, thankYou: thankYouResult, password: null };
  }
  console.log('[access] E-mail remerciement envoyé:', email, thankYouResult.id);

  const password = buildPasswordSetupEmail(siteUrl, passwordSetupUrl);
  const passwordResult = await sendResendEmail({
    apiKey,
    from,
    to: email,
    subject: password.subject,
    html: password.html,
    text: password.text,
  });

  if (!passwordResult.ok) {
    console.error('[access] Resend mot de passe:', passwordResult.error);
    return { ok: false, thankYou: thankYouResult, password: passwordResult };
  }
  console.log('[access] E-mail mot de passe envoyé:', email, passwordResult.id);

  return { ok: true, thankYou: thankYouResult, password: passwordResult };
}

async function isSessionProcessed(supabase, sessionId) {
  if (!sessionId) return false;
  const { data } = await supabase
    .from('helpe_stripe_events')
    .select('stripe_event_id')
    .eq('session_id', sessionId)
    .maybeSingle();
  return Boolean(data);
}

async function markSessionProcessed(supabase, sessionId, email) {
  if (!sessionId) return;
  const { error } = await supabase.from('helpe_stripe_events').insert({
    stripe_event_id: `access_${sessionId}`,
    session_id: sessionId,
    buyer_email: email,
  });
  if (error && error.code !== '23505' && !/duplicate key|unique constraint/i.test(error.message)) {
    console.warn('[access] mark session processed:', error.message);
  }
}

/**
 * Enregistre l’acheteur + 2 e-mails Resend (remerciement + mot de passe), une fois par session Stripe
 */
async function activateBuyerAccess(supabase, email, siteUrl, options = {}) {
  const normalizedEmail = email.trim().toLowerCase();
  const sessionId = options.sessionId || null;

  if (sessionId && (await isSessionProcessed(supabase, sessionId))) {
    console.log('[access] Session déjà traitée — pas de renvoi:', sessionId);
    return {
      ok: true,
      email: normalizedEmail,
      duplicate: true,
      resend: { skipped: true, reason: 'session_already_processed' },
      passwordLink: { skipped: true },
    };
  }

  const { error } = await supabase.from('helpe_formation_buyers').upsert(
    { email: normalizedEmail },
    { onConflict: 'email' }
  );

  if (error) {
    console.error('[access] Supabase upsert failed:', error.message);
    return { ok: false, error: error.message };
  }

  console.log('[access] Buyer recorded:', normalizedEmail);

  let passwordSetupUrl = null;
  let linkResult = { ok: false, skipped: true };

  if (process.env.HELPE_INVITE_AFTER_PURCHASE !== 'false') {
    linkResult = await generatePasswordSetupLink(supabase, normalizedEmail, siteUrl);
    passwordSetupUrl = linkResult.link || null;
  }

  const resendResult = await sendPostPurchaseEmails({
    email: normalizedEmail,
    siteUrl,
    passwordSetupUrl,
  });

  if (!resendResult.ok) {
    return {
      ok: false,
      email: normalizedEmail,
      error: resendResult.password?.error || resendResult.thankYou?.error || 'email_failed',
      passwordLink: linkResult,
      resend: resendResult,
    };
  }

  if (sessionId) {
    await markSessionProcessed(supabase, sessionId, normalizedEmail);
  }

  return {
    ok: true,
    email: normalizedEmail,
    passwordLink: linkResult,
    resend: resendResult,
  };
}

module.exports = {
  activateBuyerAccess,
  buildFormationPurchaseEmail,
  buildThankYouEmail,
  buildPasswordSetupEmail,
  generatePasswordSetupLink,
};

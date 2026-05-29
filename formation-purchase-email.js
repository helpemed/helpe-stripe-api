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

function buildFormationPurchaseEmail(siteUrl, passwordSetupUrl) {
  const base = siteUrl.replace(/\/$/, '');
  const loginUrl = `${base}/login.html?redirect=formation.html`;
  const setupUrl = passwordSetupUrl || loginUrl;
  const subject = 'Votre accès à la formation HelpE — choisissez votre mot de passe';

  const setupBlock = passwordSetupUrl
    ? `<p><strong>Prochaine étape (2 minutes) :</strong> cliquez ci-dessous pour <strong>choisir votre mot de passe</strong> et ouvrir la formation.</p>
          <table cellpadding="0" cellspacing="0" style="margin:28px 0 8px;"><tr><td style="background:#1a6fb5;border-radius:50px;">
            <a href="${escapeHtml(passwordSetupUrl)}" style="display:inline-block;padding:14px 28px;color:#ffffff;font-weight:700;font-size:15px;text-decoration:none;">Définir mon mot de passe →</a>
          </td></tr></table>
          <p style="font-size:13px;color:#64748b;">Ce lien est personnel et expire après environ une heure. Pensez aux courriers indésirables.</p>`
    : `<p><strong>Prochaine étape :</strong> connectez-vous ou utilisez « Mot de passe oublié » sur la page de connexion avec <strong>exactement la même adresse</strong> que lors du paiement.</p>
          <table cellpadding="0" cellspacing="0" style="margin:28px 0 8px;"><tr><td style="background:#1a6fb5;border-radius:50px;">
            <a href="${loginUrl}" style="display:inline-block;padding:14px 28px;color:#ffffff;font-weight:700;font-size:15px;text-decoration:none;">Accéder à ma formation →</a>
          </td></tr></table>`;

  const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
        <tr><td style="background:linear-gradient(135deg,#1a1f2e,#1a3a5c);padding:28px 32px;color:#fff;">
          <div style="font-size:18px;font-weight:800;">Help<span style="color:#60a5fa;">E</span></div>
          <p style="margin:16px 0 0;font-size:22px;font-weight:800;line-height:1.3;">Bienvenue dans la formation</p>
        </td></tr>
        <tr><td style="padding:28px 32px;color:#1a1f2e;font-size:15px;line-height:1.65;">
          <p>Merci pour votre confiance — votre paiement est bien enregistré.</p>
          ${setupBlock}
          <p style="font-size:13px;color:#64748b;margin-top:24px;">Déjà un compte HelpE ? <a href="${loginUrl}" style="color:#1a6fb5;font-weight:600;">Connectez-vous ici</a> avec vos identifiants habituels.</p>
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

  const text = passwordSetupUrl
    ? `Merci pour votre achat HelpE — votre paiement est enregistré.

Choisissez votre mot de passe (lien personnel, valable ~1 h) :
${passwordSetupUrl}

Ensuite connectez-vous : ${loginUrl}

HelpE — contact@helpe-med.com`
    : `Merci pour votre achat HelpE.

Connectez-vous ou utilisez « Mot de passe oublié » : ${loginUrl}

HelpE — contact@helpe-med.com`;

  return { subject, html, text };
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

async function sendFormationPurchaseEmail({ email, siteUrl, passwordSetupUrl }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.HELPE_RESEND_FROM || 'HelpE <onboarding@resend.dev>';

  if (!apiKey) {
    console.warn('[access] RESEND_API_KEY absent — pas d’e-mail Resend post-achat');
    return { ok: false, skipped: true };
  }

  const { subject, html, text } = buildFormationPurchaseEmail(siteUrl, passwordSetupUrl);
  const result = await sendResendEmail({ apiKey, from, to: email, subject, html, text });

  if (result.ok) {
    console.log('[access] E-mail Resend post-achat envoyé:', email, result.id);
  } else {
    console.error('[access] Resend post-achat:', result.error);
  }
  return result;
}

/**
 * Enregistre l’acheteur + lien mot de passe dans l’e-mail Resend (un seul e-mail)
 */
async function activateBuyerAccess(supabase, email, siteUrl) {
  const normalizedEmail = email.trim().toLowerCase();

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
  } else {
    console.log('[access] HELPE_INVITE_AFTER_PURCHASE=false — pas de lien mot de passe');
  }

  const resendResult = await sendFormationPurchaseEmail({
    email: normalizedEmail,
    siteUrl,
    passwordSetupUrl,
  });

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
  generatePasswordSetupLink,
};

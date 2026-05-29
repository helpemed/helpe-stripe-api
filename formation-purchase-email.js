/**
 * E-mail post-achat formation — Resend (même stack que les guides HelpE)
 */

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildFormationPurchaseEmail(siteUrl) {
  const base = siteUrl.replace(/\/$/, '');
  const loginUrl = `${base}/login.html?redirect=formation.html`;
  const subject = 'Votre accès à la formation HelpE est activé';

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
          <p><strong>Prochaine étape :</strong> définissez votre mot de passe pour accéder à l’espace formation (méthode pas à pas, fiches, templates, déontologie par profession).</p>
          <p style="font-size:14px;color:#64748b;">Vous devriez recevoir <strong>un second e-mail</strong> « Invitation » pour choisir votre mot de passe. Pensez aux courriers indésirables. Utilisez <strong>exactement la même adresse</strong> que lors du paiement.</p>
          <table cellpadding="0" cellspacing="0" style="margin:28px 0 8px;"><tr><td style="background:#1a6fb5;border-radius:50px;">
            <a href="${loginUrl}" style="display:inline-block;padding:14px 28px;color:#ffffff;font-weight:700;font-size:15px;text-decoration:none;">Accéder à ma formation →</a>
          </td></tr></table>
          <p style="font-size:13px;color:#64748b;margin-top:24px;">Déjà un compte HelpE ? Connectez-vous avec vos identifiants habituels — l’accès formation est ajouté automatiquement.</p>
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

  const text = `Merci pour votre achat HelpE — votre paiement est enregistré.

Définissez votre mot de passe via l'e-mail d'invitation (vérifiez les spams), puis connectez-vous :
${loginUrl}

Utilisez la même adresse e-mail que lors du paiement.

HelpE — contact@helpe-med.com`;

  return { subject, html, text, loginUrl: escapeHtml(loginUrl) };
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

async function inviteBuyerAuth(supabase, email, siteUrl) {
  const inviteEnabled = process.env.HELPE_INVITE_AFTER_PURCHASE !== 'false';
  if (!inviteEnabled) {
    console.log('[access] HELPE_INVITE_AFTER_PURCHASE=false — pas d’invitation Auth');
    return { ok: true, skipped: true };
  }

  const redirectTo = siteUrl ? `${siteUrl.replace(/\/$/, '')}/reset-password.html` : undefined;
  const inviteOptions = redirectTo ? { redirectTo } : {};

  const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, inviteOptions);

  if (!inviteError) {
    console.log('[access] Invitation Auth envoyée:', email);
    return { ok: true };
  }

  const msg = inviteError.message || '';
  const alreadyUser =
    msg.includes('already been registered') ||
    msg.includes('already registered') ||
    /duplicate|exists/i.test(msg);

  if (alreadyUser) {
    console.log('[access] Compte Auth déjà existant:', email);
    return { ok: true, existing: true };
  }

  console.warn('[access] inviteUserByEmail échec, tentative createUser:', msg);
  const { error: createError } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
  });

  if (createError) {
    const createDup =
      createError.message?.includes('already been registered') ||
      createError.message?.includes('already registered') ||
      /duplicate|exists/i.test(createError.message || '');
    if (createDup) return { ok: true, existing: true };
    console.error('[access] createUser:', createError.message);
    return { ok: false, error: createError.message };
  }

  console.log('[access] Utilisateur Auth créé (e-mail confirmé):', email);
  return { ok: true, created: true };
}

async function sendFormationPurchaseEmail({ email, siteUrl }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.HELPE_RESEND_FROM || 'HelpE <onboarding@resend.dev>';

  if (!apiKey) {
    console.warn('[access] RESEND_API_KEY absent — pas d’e-mail Resend post-achat');
    return { ok: false, skipped: true };
  }

  const { subject, html, text } = buildFormationPurchaseEmail(siteUrl);
  const result = await sendResendEmail({ apiKey, from, to: email, subject, html, text });

  if (result.ok) {
    console.log('[access] E-mail Resend post-achat envoyé:', email, result.id);
  } else {
    console.error('[access] Resend post-achat:', result.error);
  }
  return result;
}

/**
 * Enregistre l’acheteur + invitation mot de passe (Supabase Auth) + e-mail bienvenue (Resend)
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

  const inviteResult = await inviteBuyerAuth(supabase, normalizedEmail, siteUrl);
  const resendResult = await sendFormationPurchaseEmail({
    email: normalizedEmail,
    siteUrl,
  });

  return {
    ok: true,
    email: normalizedEmail,
    invite: inviteResult,
    resend: resendResult,
  };
}

module.exports = {
  activateBuyerAccess,
  buildFormationPurchaseEmail,
};

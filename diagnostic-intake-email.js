/**
 * HelpE — E-mails questionnaire pré-diagnostic (brief Alex + confirmation prospect)
 */

const { sendResendEmail, emailShell } = require('./formation-purchase-email');

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function listHtml(items, ordered) {
  if (!items || !items.length) return '<p style="color:#64748b;">—</p>';
  const tag = ordered ? 'ol' : 'ul';
  const lis = items
    .map((item) => {
      if (typeof item === 'string') {
        return `<li style="margin-bottom:6px;">${escapeHtml(item)}</li>`;
      }
      if (item.action) {
        return `<li style="margin-bottom:8px;"><strong>${escapeHtml(item.lever || '')}</strong> — ${escapeHtml(item.action)}<br><span style="color:#64748b;font-size:13px;">${escapeHtml(item.why || '')}</span></li>`;
      }
      return `<li style="margin-bottom:6px;">${escapeHtml(JSON.stringify(item))}</li>`;
    })
    .join('');
  return `<${tag} style="margin:8px 0 0;padding-left:20px;">${lis}</${tag}>`;
}

function buildAlexBriefHtml(row) {
  const pre = row.pre_diag || {};
  const name = `${row.prenom} ${row.nom}`.trim();
  const segment = row.segment_code || pre.segment_code || '—';

  const priorities = pre.priorities || [];
  const questions = pre.live_questions || [];
  const quickWin = pre.quick_win || {};
  const offer = pre.recommended_offer || {};

  const quickWinHtml = quickWin.title
    ? `<p><strong>${escapeHtml(quickWin.title)}</strong> (${escapeHtml(quickWin.time || '')})</p>${listHtml(quickWin.steps || [], true)}`
    : '<p>—</p>';

  return `
    <p style="font-size:13px;color:#64748b;margin-top:0;">Nouveau questionnaire pré-diagnostic · ID <code>${escapeHtml(row.id)}</code></p>
    <p><strong>${escapeHtml(name)}</strong> · ${escapeHtml(pre.metier_label || row.metier)} · ${escapeHtml(row.ville)}</p>
    <p style="font-size:14px;">
      <a href="mailto:${escapeHtml(row.email)}">${escapeHtml(row.email)}</a>
      ${row.phone ? ` · ${escapeHtml(row.phone)}` : ''}
    </p>
    <p style="background:#f0f9ff;border-left:4px solid #1a6fb5;padding:12px 16px;border-radius:8px;font-size:14px;">
      <strong>Segment ${escapeHtml(segment)}</strong> · ${escapeHtml(pre.zone_label || row.zone_code || '')} · ${escapeHtml(pre.stade_label || '')}
    </p>
    <h3 style="font-size:16px;margin:24px 0 8px;">Synthèse</h3>
    <pre style="white-space:pre-wrap;font-family:inherit;font-size:14px;background:#f8fafc;padding:16px;border-radius:8px;border:1px solid #e2e8f0;">${escapeHtml(pre.summary || '')}</pre>
    <h3 style="font-size:16px;margin:24px 0 8px;">3 priorités proposées</h3>
    ${listHtml(priorities, true)}
    <h3 style="font-size:16px;margin:24px 0 8px;">Offre recommandée</h3>
    <p><strong>${escapeHtml(offer.label || '—')}</strong><br><span style="color:#64748b;">${escapeHtml(offer.rationale || '')}</span></p>
    <h3 style="font-size:16px;margin:24px 0 8px;">Quick win à proposer</h3>
    ${quickWinHtml}
    <h3 style="font-size:16px;margin:24px 0 8px;">Questions à creuser en appel</h3>
    ${listHtml(questions, true)}
    <h3 style="font-size:16px;margin:24px 0 8px;">Script d'ouverture</h3>
    <p style="font-style:italic;background:#f8fafc;padding:14px;border-radius:8px;">${escapeHtml(pre.opening_script || '')}</p>
    <p style="font-size:13px;color:#64748b;margin-top:24px;">Cabinet : ${escapeHtml(row.cabinet)} · Blocage : ${escapeHtml(row.blocage)} · Préférence : ${escapeHtml(row.preference)}</p>
  `;
}

function buildAlexBriefText(row) {
  const pre = row.pre_diag || {};
  const name = `${row.prenom} ${row.nom}`.trim();
  const lines = [
    `Pré-diagnostic HelpE — ${name}`,
    `ID: ${row.id}`,
    `Email: ${row.email}${row.phone ? ' · ' + row.phone : ''}`,
    `Segment: ${row.segment_code || pre.segment_code}`,
    '',
    pre.summary || '',
    '',
    'Priorités:',
    ...(pre.priorities || []).map((p, i) => `${i + 1}. ${p.lever}: ${p.action}`),
    '',
    `Offre: ${(pre.recommended_offer || {}).label}`,
    '',
    'Questions live:',
    ...(pre.live_questions || []).map((q, i) => `${i + 1}. ${q}`),
    '',
    `Ouverture: ${pre.opening_script || ''}`,
  ];
  return lines.join('\n');
}

async function sendDiagnosticIntakeEmails({ supabase, intakeId, siteUrl }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.HELPE_RESEND_FROM || 'HelpE <onboarding@resend.dev>';
  const notifyTo =
    process.env.HELPE_DIAGNOSTIC_NOTIFY_EMAIL ||
    process.env.HELPE_NOTIFY_EMAIL ||
    'contact@helpe-med.com';

  const { data: row, error } = await supabase
    .from('helpe_diagnostic_intake')
    .select('*')
    .eq('id', intakeId)
    .single();

  if (error || !row) {
    return { ok: false, error: error?.message || 'intake_not_found' };
  }

  const results = { alex: { ok: false }, prospect: { ok: false } };

  if (!apiKey) {
    return { ok: false, error: 'resend_not_configured', results };
  }

  const base = (siteUrl || 'https://helpe-med.com').replace(/\/$/, '');
  const calendlyUrl = `${base}/diagnostic.html#prise-de-rendez-vous`;
  const prenom = row.prenom;

  if (!row.notify_email_sent_at) {
    const alexSubject = `[HelpE] Pré-diag ${row.prenom} ${row.nom} — ${row.segment_code || '?'}`;
    const alexHtml = emailShell(`Pré-diagnostic : ${row.prenom} ${row.nom}`, buildAlexBriefHtml(row));
    const alexSent = await sendResendEmail({
      apiKey,
      from,
      to: notifyTo,
      subject: alexSubject,
      html: alexHtml,
      text: buildAlexBriefText(row),
    });

    results.alex = alexSent;
    if (alexSent.ok) {
      await supabase
        .from('helpe_diagnostic_intake')
        .update({
          notify_email_sent_at: new Date().toISOString(),
          notify_email_resend_id: alexSent.id || null,
        })
        .eq('id', intakeId);
    }
  } else {
    results.alex = { ok: true, skipped: true };
  }

  if (!row.prospect_email_sent_at && row.email) {
    const prospectSubject = `${prenom}, votre analyse est prête — choisissez votre créneau`;
    const prospectBody = `
      <p>Bonjour ${escapeHtml(prenom)},</p>
      <p>Merci d'avoir pris quelques minutes pour nous décrire votre situation avant le diagnostic gratuit.</p>
      <p>Nous avons déjà préparé une première analyse de votre profil (<strong>${escapeHtml(row.segment_code || '')}</strong>). L'objectif de nos 30 minutes ensemble : valider ces pistes et vous donner <strong>au moins une action concrète</strong> pour demain.</p>
      <p style="text-align:center;margin:28px 0;">
        <a href="${escapeHtml(calendlyUrl)}" style="display:inline-block;background:#1a6fb5;color:#fff;padding:14px 28px;border-radius:50px;text-decoration:none;font-weight:700;">Choisir mon créneau →</a>
      </p>
      <p style="font-size:14px;color:#64748b;">30 minutes · visio ou téléphone · sans engagement.</p>
    `;
    const prospectSent = await sendResendEmail({
      apiKey,
      from,
      to: row.email,
      subject: prospectSubject,
      html: emailShell('Prochaine étape : réserver votre créneau', prospectBody),
      text: `Bonjour ${prenom},\n\nMerci pour votre questionnaire. Réservez votre créneau : ${calendlyUrl}\n\nHelpE`,
    });

    results.prospect = prospectSent;
    if (prospectSent.ok) {
      await supabase
        .from('helpe_diagnostic_intake')
        .update({
          prospect_email_sent_at: new Date().toISOString(),
          prospect_email_resend_id: prospectSent.id || null,
        })
        .eq('id', intakeId);
    }
  } else {
    results.prospect = { ok: true, skipped: true };
  }

  return {
    ok: results.alex.ok || results.alex.skipped,
    results,
  };
}

module.exports = {
  sendDiagnosticIntakeEmails,
  buildAlexBriefHtml,
  buildAlexBriefText,
};

/**
 * HelpE — Intake Blueprint : validation, routage blueprint_id, zone géo.
 */

const METIER_CODES = {
  kine: 'K',
  osteo: 'O',
  podologue: 'P',
  orthophoniste: 'L',
  psychologue: 'S',
  infirmier: 'I',
  autre: 'A',
};

const URBAN_DEPTS = new Set([
  '75', '69', '13', '31', '33', '59', '44', '67', '06', '34', '35', '38', '62', '76',
]);

const PERIURBAN_DEPTS = new Set(['77', '78', '91', '92', '93', '94', '95']);

function trimStr(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function extractPostalCode(ville) {
  const m = trimStr(ville).match(/\b(\d{5})\b/);
  return m ? m[1] : null;
}

function scoreZone(ville) {
  const cp = extractPostalCode(ville);
  if (!cp) return 'P';

  const dept = cp.slice(0, 2);
  if (dept === '75') return 'U';
  if (PERIURBAN_DEPTS.has(dept)) return 'P';
  if (URBAN_DEPTS.has(dept)) {
    const suffix = cp.slice(2);
    if (suffix === '000' || suffix.endsWith('00')) return 'P';
    return 'U';
  }

  const suffix = cp.slice(2);
  if (suffix === '000' || (suffix.endsWith('00') && parseInt(suffix, 10) < 100)) return 'R';
  return 'P';
}

function scoreStade(agenda) {
  const a = trimStr(agenda);
  if (a === '0-40' || a === 'vide') return 'V';
  if (a === '90+' || a === 'plein') return 'F';
  return 'M';
}

function computeBlueprintId(payload) {
  const metier = trimStr(payload.metier).toLowerCase();
  const m = METIER_CODES[metier] || 'A';
  const zone = scoreZone(payload.ville);
  const stade = scoreStade(payload.agenda);
  return `${m}-${zone}-${stade}`;
}

function validateBlueprintIntake(body) {
  const errors = [];
  const email = trimStr(body?.email).toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push('Adresse e-mail invalide.');
  }

  const required = [
    ['prenom', 'Prénom'],
    ['nom', 'Nom'],
    ['metier', 'Profession'],
    ['ville', 'Ville'],
    ['cabinet', 'Cabinet'],
    ['agenda', 'Agenda'],
    ['gbp', 'Google Business Profile'],
    ['avis', 'Avis Google'],
    ['contenu', 'Contenu en ligne'],
    ['budget', 'Budget pub'],
    ['objectif', 'Objectif 90 jours'],
    ['deontologie', 'Déontologie'],
    ['concurrence', 'Concurrence'],
    ['preference', 'Préférence'],
    ['specialite', 'Spécialité'],
    ['creneaux', 'Créneau'],
  ];

  for (const [key, label] of required) {
    if (!trimStr(body?.[key])) errors.push(`${label} requis.`);
  }

  if (!body?.rgpd_accepted && body?.rgpd !== true && body?.rgpd !== '1' && body?.rgpd !== 'on') {
    errors.push('Acceptation RGPD requise.');
  }

  const metier = trimStr(body?.metier).toLowerCase();
  if (metier && !METIER_CODES[metier]) {
    errors.push('Profession non reconnue.');
  }

  return { ok: errors.length === 0, errors, email };
}

function buildOrderRow(body) {
  const payload = {
    prenom: trimStr(body.prenom),
    nom: trimStr(body.nom),
    metier: trimStr(body.metier).toLowerCase(),
    ville: trimStr(body.ville),
    cabinet: trimStr(body.cabinet),
    structure: trimStr(body.structure) || null,
    site: trimStr(body.site) || null,
    agenda: trimStr(body.agenda),
    gbp: trimStr(body.gbp),
    avis: trimStr(body.avis),
    contenu: trimStr(body.contenu),
    budget: trimStr(body.budget),
    objectif: trimStr(body.objectif),
    deontologie: trimStr(body.deontologie),
    concurrence: trimStr(body.concurrence),
    preference: trimStr(body.preference),
    specialite: trimStr(body.specialite),
    creneaux: trimStr(body.creneaux),
  };

  const blueprint_id = computeBlueprintId(payload);
  const zone_code = scoreZone(payload.ville);

  return {
    status: 'pending_payment',
    blueprint_id,
    zone_code,
    email: trimStr(body.email).toLowerCase(),
    prenom: payload.prenom,
    nom: payload.nom,
    metier: payload.metier,
    ville: payload.ville,
    cabinet: payload.cabinet,
    structure: payload.structure,
    site: payload.site,
    agenda: payload.agenda,
    gbp: payload.gbp,
    avis: payload.avis,
    contenu: payload.contenu,
    budget: payload.budget,
    objectif: payload.objectif,
    deontologie: payload.deontologie,
    concurrence: payload.concurrence,
    preference: payload.preference,
    specialite: payload.specialite,
    creneaux: payload.creneaux,
    rgpd_accepted: true,
    payload: { ...payload, blueprint_id, zone_code, submitted_at: new Date().toISOString() },
  };
}

module.exports = {
  computeBlueprintId,
  validateBlueprintIntake,
  buildOrderRow,
  scoreZone,
  scoreStade,
};

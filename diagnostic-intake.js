/**
 * HelpE — Questionnaire pré-diagnostic : validation + brief auto pour l'appel 30 min.
 */

const { computeBlueprintId, scoreZone, scoreStade } = require('./blueprint-intake');

const METIER_CODES = {
  kine: 'K',
  osteo: 'O',
  podologue: 'P',
  orthophoniste: 'L',
  psychologue: 'S',
  infirmier: 'I',
  autre: 'A',
};

const METIER_LABELS = {
  kine: 'Kinésithérapeute',
  osteo: 'Ostéopathe',
  podologue: 'Podologue',
  orthophoniste: 'Orthophoniste',
  psychologue: 'Psychologue',
  infirmier: 'Infirmier(ère) libéral(e)',
  autre: 'Autre libéral santé',
};

const ZONE_LABELS = { R: 'Rural / petite ville', U: 'Urbain / grande ville', P: 'Périurbain' };
const STADE_LABELS = {
  V: 'Agenda vide (< 60 %)',
  M: 'Agenda moyen (60–85 %)',
  F: 'Agenda plein / liste d\'attente',
};

function trimStr(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function scoreDigitalMaturity(payload) {
  const gbp = trimStr(payload.gbp);
  const avis = trimStr(payload.avis);
  const contenu = trimStr(payload.contenu);

  if (gbp === '0' || gbp === 'brouillon') return '0';
  if (gbp === '1' && (avis === '0' || avis === '1-5')) return '1';
  if (gbp === '2' || contenu === 'regulier-avec' || contenu === 'regulier-sans') return '2';
  if (contenu === 'parfois' || contenu === 'regulier-sans') return '2';
  return '1';
}

function labelBlocage(code) {
  const map = {
    visibilite: 'Visibilité locale insuffisante',
    temps: 'Manque de temps pour le marketing',
    deontologie: 'Incertitude déontologique',
    concurrence: 'Concurrence forte / différenciation',
    prescripteurs: 'Réseau prescripteurs faible',
    autre: 'Autre blocage',
  };
  return map[code] || code;
}

function labelObjectif(code) {
  const map = {
    rdv: 'Plus de nouveaux RDV',
    patients: 'De meilleurs patients (cible)',
    'no-show': 'Moins de créneaux vides / no-show',
    temps: 'Libérer du temps (moins marketing à la main',
  };
  return map[code] || code;
}

function labelPreference(code) {
  const map = {
    solo: 'Avancer seul(e) avec une méthode claire',
    plan: 'Recevoir un plan sur-mesure (Blueprint)',
    accompagnement: 'Qu\'on exécute une partie pour moi',
    'pas-sur': 'Pas encore sûr(e)',
  };
  return map[code] || code;
}

function recommendOffer(payload, stade) {
  const pref = trimStr(payload.preference);
  if (pref === 'accompagnement') {
    return {
      offer: 'accompagnement',
      label: 'Accompagnement personnalisé (devis)',
      rationale:
        'Le prospect veut de l\'exécution — qualifier le périmètre (GBP, site, contenu) et proposer 2–3 modules.',
    };
  }
  if (pref === 'plan') {
    return {
      offer: 'blueprint_679',
      label: 'Blueprint Visibilité 90j (679 €)',
      rationale:
        'Besoin d\'un plan calibré sans done-for-you — bon fit si le prospect est autonome et veut de la structure.',
    };
  }
  if (stade === 'F') {
    return {
      offer: 'formation_349',
      label: 'Formation autonome (349 €) ou Blueprint réputation',
      rationale:
        'Agenda déjà plein — pivoter sur réputation, sélectivité et optimisation, pas acquisition brute.',
    };
  }
  if (pref === 'solo' || pref === 'pas-sur') {
    return {
      offer: 'formation_349',
      label: 'Formation autonome (349 €)',
      rationale:
        'Profil DIY — la formation couvre la méthode complète ; upsell Blueprint si besoin de plan métier×zone.',
    };
  }
  return {
    offer: 'diagnostic_suite',
    label: 'À trancher en appel',
    rationale: 'Préférence non standard — clarifier en ouverture d\'appel.',
  };
}

function buildPriorities(payload, zone, stade, digital) {
  const priorities = [];
  const gbp = trimStr(payload.gbp);
  const avis = trimStr(payload.avis);
  const blocage = trimStr(payload.blocage);

  if (gbp === '0' || gbp === 'brouillon') {
    priorities.push({
      rank: 1,
      lever: 'Google Business Profile',
      action: 'Revendiquer et compléter la fiche (catégorie, horaires, zone, photo pro)',
      why: 'Sans fiche GBP, invisible sur Maps — levier #1 pour la majorité des libéraux.',
    });
  } else if (gbp === '1') {
    priorities.push({
      rank: 1,
      lever: 'Optimisation GBP',
      action: 'Catégories, description factuelle, posts mensuels, lien RDV',
      why: 'Fiche en ligne mais sous-exploitée — gains rapides sans budget pub.',
    });
  }

  if ((avis === '0' || avis === '1-5') && stade !== 'F') {
    priorities.push({
      rank: priorities.length + 1,
      lever: 'Preuve sociale (avis Google)',
      action: 'Processus simple post-consultation : demande d\'avis conforme déontologie',
      why: 'Peu d\'avis = moins de clics sur la fiche, surtout en zone urbaine.',
    });
  }

  if (blocage === 'deontologie') {
    priorities.push({
      rank: priorities.length + 1,
      lever: 'Cadre déontologique',
      action: 'Matrice « autorisé / gris / interdit » pour sa profession + 2 formulations types',
      why: 'Le frein déclaré est la déontologie — lever la peur avant tout canal.',
    });
  }

  if (blocage === 'prescripteurs' || (zone === 'R' && stade === 'V')) {
    priorities.push({
      rank: priorities.length + 1,
      lever: 'Réseau prescripteurs',
      action: 'Liste 10 médecins / confrères + fiche de présentation 1 page',
      why: 'Zone ou blocage orienté orientation — le bouche-à-oreille pro reste central.',
    });
  }

  if (blocage === 'visibilite' && digital === '0') {
    priorities.push({
      rank: priorities.length + 1,
      lever: 'Présence locale de base',
      action: 'NAP cohérent (nom, adresse, téléphone) sur fiche + annuaires pro',
      why: 'Visibilité = fondations avant contenu ou pub.',
    });
  }

  if (stade === 'M') {
    priorities.push({
      rank: priorities.length + 1,
      lever: 'Conversion & créneaux morts',
      action: 'Analyser créneaux vides récurrents + rappels / relances patients',
      why: 'Agenda moyen — optimiser le remplissage existant avant d\'investir acquisition.',
    });
  }

  if (stade === 'F') {
    priorities.push({
      rank: 1,
      lever: 'Réputation & positionnement',
      action: 'Renforcer avis, spécialisation affichée, filtrage des demandes',
      why: 'Agenda plein — priorité réputation et qualité, pas volume.',
    });
  }

  if (priorities.length === 0) {
    priorities.push({
      rank: 1,
      lever: 'Audit express 3 leviers',
      action: 'GBP + 1 canal contenu + 1 relais prescripteur — choisir le plus faible',
      why: 'Profil équilibré — identifier le maillon faible en 5 min d\'appel.',
    });
  }

  return priorities.slice(0, 3);
}

function buildLiveQuestions(payload, priorities) {
  const questions = [
    `Qu'est-ce qui vous a poussé à réserver ce diagnostic maintenant ? (urgence réelle)`,
  ];

  if (trimStr(payload.deontologie)) {
    questions.push(
      `Vous citez « ${trimStr(payload.deontologie).slice(0, 80)}… » côté déontologie : qu'avez-vous déjà tenté, et qu'est-ce qui vous a bloqué ?`
    );
  } else {
    questions.push(`Avez-vous déjà eu un retour négatif ou une peur liée à la communication en ligne ?`);
  }

  if (trimStr(payload.deja_essaye)) {
    questions.push(`Vous indiquez avoir déjà essayé : ${trimStr(payload.deja_essaye).slice(0, 100)} — qu'est-ce qui n'a pas fonctionné ?`);
  } else {
    questions.push(`Qu'avez-vous déjà mis en place (site, réseaux, pub, réseau médical) et avec quel résultat ?`);
  }

  if (priorities[0]) {
    questions.push(
      `Si on ne devait traiter qu'UNE chose dans les 30 prochains jours : ${priorities[0].action} — ça vous parle ou pas ?`
    );
  }

  return questions.slice(0, 4);
}

function buildQuickWin(payload) {
  const gbp = trimStr(payload.gbp);
  const avis = trimStr(payload.avis);

  if (gbp === '0' || gbp === 'brouillon') {
    return {
      title: 'Revendiquer la fiche Google Business',
      steps: [
        'Rechercher le cabinet sur Google Maps',
        'Cliquer « Vous êtes le propriétaire ? » et suivre la validation',
        'Ajouter catégorie principale, horaires exacts, 1 photo pro',
      ],
      time: '20–30 min',
    };
  }

  if (gbp === '1' && (avis === '0' || avis === '1-5')) {
    return {
      title: 'Demander 3 avis Google cette semaine',
      steps: [
        'Identifier 3 patients satisfaits (récemment)',
        'Leur envoyer un SMS/email factuel avec lien direct fiche Google',
        'Formulation informative, sans incitation promotionnelle',
      ],
      time: '15 min setup + 3 envois',
    };
  }

  return {
    title: 'Audit 5 min de la fiche Google',
    steps: [
      'Vérifier catégorie principale = spécialité exacte',
      'Comparer horaires et zone avec la réalité du cabinet',
      'Lire les 3 derniers avis : répondre ou signaler si besoin',
    ],
    time: '5 min',
  };
}

function buildOpeningScript(payload, segment) {
  const metier = METIER_LABELS[trimStr(payload.metier).toLowerCase()] || payload.metier;
  const prenom = trimStr(payload.prenom);
  return (
    `Bonjour ${prenom}, merci d'avoir pris 5 minutes pour le questionnaire avant notre échange. ` +
    `J'ai préparé une analyse rapide pour votre cabinet ${metier} à ${trimStr(payload.ville)} ` +
    `(profil ${segment}). On va valider ensemble mes hypothèses et je vous donne au moins une action concrète pour demain.`
  );
}

function buildPreDiagnostic(payload) {
  const metierKey = trimStr(payload.metier).toLowerCase();
  const segment = computeBlueprintId(payload);
  const zone = scoreZone(payload.ville);
  const stade = scoreStade(payload.agenda);
  const digital = scoreDigitalMaturity(payload);
  const priorities = buildPriorities(payload, zone, stade, digital);
  const offer = recommendOffer(payload, stade);
  const liveQuestions = buildLiveQuestions(payload, priorities);
  const quickWin = buildQuickWin(payload);

  const summaryLines = [
    `${METIER_LABELS[metierKey] || payload.metier} · ${trimStr(payload.ville)} · ${ZONE_LABELS[zone] || zone}`,
    `Agenda : ${STADE_LABELS[stade] || payload.agenda} · GBP : ${payload.gbp} · Avis : ${payload.avis || '?'}`,
    `Blocage déclaré : ${labelBlocage(payload.blocage)}`,
    `Objectif : ${labelObjectif(payload.objectif)}`,
    `Préférence : ${labelPreference(payload.preference)}`,
  ];

  if (trimStr(payload.deontologie)) {
    summaryLines.push(`Frein déontologie : « ${trimStr(payload.deontologie).slice(0, 120)} »`);
  }

  return {
    segment_code: segment,
    zone_code: zone,
    stade_code: stade,
    digital_code: digital,
    metier_label: METIER_LABELS[metierKey] || payload.metier,
    zone_label: ZONE_LABELS[zone],
    stade_label: STADE_LABELS[stade],
    summary: summaryLines.join('\n'),
    priorities,
    recommended_offer: offer,
    live_questions: liveQuestions,
    quick_win: quickWin,
    opening_script: buildOpeningScript(payload, segment),
    call_structure: [
      { min: '0–3', topic: 'Accueil + confirmation données questionnaire' },
      { min: '3–12', topic: 'Approfondir blocage + ce déjà tenté' },
      { min: '12–20', topic: 'Présenter 2–3 priorités + quick win' },
      { min: '20–27', topic: 'Recommandation offre (si fit) + objections' },
      { min: '27–30', topic: 'Prochaine étape unique + clôture' },
    ],
    generated_at: new Date().toISOString(),
  };
}

function validateDiagnosticIntake(body) {
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
    ['blocage', 'Principal blocage'],
    ['objectif', 'Objectif'],
    ['preference', 'Préférence'],
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

function buildIntakeRow(body) {
  const payload = {
    prenom: trimStr(body.prenom),
    nom: trimStr(body.nom),
    phone: trimStr(body.phone) || null,
    metier: trimStr(body.metier).toLowerCase(),
    ville: trimStr(body.ville),
    cabinet: trimStr(body.cabinet),
    structure: trimStr(body.structure) || null,
    agenda: trimStr(body.agenda),
    gbp: trimStr(body.gbp),
    avis: trimStr(body.avis) || null,
    contenu: trimStr(body.contenu) || null,
    blocage: trimStr(body.blocage),
    objectif: trimStr(body.objectif),
    deja_essaye: trimStr(body.deja_essaye) || null,
    deontologie: trimStr(body.deontologie) || null,
    preference: trimStr(body.preference),
  };

  const preDiag = buildPreDiagnostic(payload);

  return {
    status: 'submitted',
    segment_code: preDiag.segment_code,
    zone_code: preDiag.zone_code,
    stade_code: preDiag.stade_code,
    digital_code: preDiag.digital_code,
    email: trimStr(body.email).toLowerCase(),
    prenom: payload.prenom,
    nom: payload.nom,
    phone: payload.phone,
    metier: payload.metier,
    ville: payload.ville,
    cabinet: payload.cabinet,
    structure: payload.structure,
    agenda: payload.agenda,
    gbp: payload.gbp,
    avis: payload.avis,
    blocage: payload.blocage,
    objectif: payload.objectif,
    deja_essaye: payload.deja_essaye,
    deontologie: payload.deontologie,
    preference: payload.preference,
    pre_diag: preDiag,
    utm_source: trimStr(body.utm_source) || null,
    utm_medium: trimStr(body.utm_medium) || null,
    utm_campaign: trimStr(body.utm_campaign) || null,
    source_page: trimStr(body.source_page) || null,
    session_id: trimStr(body.session_id) || null,
    rgpd_accepted: true,
  };
}

module.exports = {
  validateDiagnosticIntake,
  buildIntakeRow,
  buildPreDiagnostic,
  METIER_LABELS,
};

# Déploiement Render — API Stripe HelpE

## 1. Repo GitHub

Pousse le dossier `website/server` (ou le monorepo entier) sur GitHub.

## 2. Créer le Web Service sur Render

1. [render.com](https://render.com) → **New** → **Web Service**
2. Connecte le repo GitHub
3. **Root Directory** : `website/server` (si monorepo) ou la racine si repo dédié
4. **Runtime** : Node
5. **Build Command** : `npm install`
6. **Start Command** : `npm start`
7. **Instance** : Free ou Starter selon ton besoin

## 3. Variables d'environnement (Render → Environment)

| Variable | Obligatoire | Exemple |
|----------|-------------|---------|
| `STRIPE_SECRET_KEY` | Oui | `sk_live_...` ou `sk_test_...` |
| `STRIPE_PRICE_ID` | Oui | `price_...` (formation 349 €) |
| `STRIPE_PRICE_BLUEPRINT` | Oui (Blueprint) | `price_...` (679 € TTC, one_time) |
| `STRIPE_WEBHOOK_SECRET` | Oui (webhooks) | `whsec_...` |
| `SUPABASE_URL` | Oui | `https://xxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Oui | clé service role |
| `SITE_URL` | Oui | `https://helpe-med.com` |
| `RESEND_API_KEY` | Recommandé | Même clé que Supabase (`re_...`) — e-mail bienvenue formation |
| `HELPE_RESEND_FROM` | Recommandé | Ex. `HelpE <guides@contact.helpe-med.com>` (domaine vérifié Resend) |
| `HELPE_INVITE_AFTER_PURCHASE` | Non | `false` pour désactiver l’e-mail Supabase Auth « définir mot de passe » |
| `PORT` | Non | Render injecte `10000` par défaut |
| `NODE_ENV` | Recommandé | `production` |

Ne mets **jamais** ces valeurs dans le repo. Utilise uniquement l’interface Render (ou `.env` en local).

## 4. Webhook Stripe (production)

1. Stripe Dashboard → **Developers** → **Webhooks** → **Add endpoint**
2. URL : `https://<ton-service>.onrender.com/api/stripe/webhook`
3. Événements : `checkout.session.completed`
4. Copie le **Signing secret** → `STRIPE_WEBHOOK_SECRET` sur Render

## 5. Site statique (helpe-med.com)

Dans le JS du site (`assets/js/stripe-checkout.js`), l’API est appelée via :

```js
window.HELPE_STRIPE_API_BASE || 'https://helpe-med-api.onrender.com'
```

Pour pointer vers ton service Render, ajoute **avant** le script checkout sur les pages concernées :

```html
<script>window.HELPE_STRIPE_API_BASE = 'https://<ton-service>.onrender.com';</script>
```

Ou déploie avec la variable d’environnement / build qui injecte cette URL.

## 6. Blueprint — intake + paiement (Phase 1 + 2)

- Tables : `website/supabase/helpe_blueprint_orders.sql` puis `helpe_blueprint_orders_phase2.sql` (colonnes `stripe_session_id`, `paid_at`)
- Intake : `POST /api/blueprint-intake` → insert `pending_payment` + `checkout_url` si `STRIPE_PRICE_BLUEPRINT` est défini
- Checkout manuel : `POST /api/create-checkout-session` avec `{ "product": "blueprint", "order_id": "...", "email": "..." }`
- Webhook `checkout.session.completed` : si `helpe_product=blueprint_679` → `status=paid` + e-mail Resend (pas d’accès formation)
- Page merci : `merci-blueprint.html` appelle `POST /api/confirm-checkout-session` (filet si webhook en retard)
- Guide ops : `Output/blueprint-phase2-setup.md`

## 7. Questionnaire pré-diagnostic (avant appel 30 min)

- Table : `website/supabase/helpe_diagnostic_intake.sql`
- Intake : `POST /api/diagnostic-intake` → insert + brief auto (`pre_diag` JSON) + e-mails Resend
- Pages : `diagnostic.html`, `diagnostic-pub.html` (formulaire 3 étapes → Calendly)
- Variable optionnelle : `HELPE_DIAGNOSTIC_NOTIFY_EMAIL` (défaut `contact@helpe-med.com`)
- Guide ops : `Output/diagnostic-pre-questionnaire-setup-2026-06-05.md`

## 8. Vérification

- `GET /api/health` → `diagnosticIntake: true`
- Formation : paiement test → `helpe_formation_buyers`
- Blueprint : formulaire → Stripe → `helpe_blueprint_orders.status = paid`
- Diagnostic : formulaire test → ligne `helpe_diagnostic_intake` + e-mail brief Alex

## 9. Plan gratuit Render

Le tier free **s’endort** après inactivité (~50 s au premier appel). Acceptable pour démarrer ; pour prod sérieuse, passe en Starter.

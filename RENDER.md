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
| `STRIPE_PRICE_ID` | Oui | `price_...` |
| `STRIPE_WEBHOOK_SECRET` | Oui (webhooks) | `whsec_...` |
| `SUPABASE_URL` | Oui | `https://xxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Oui | clé service role |
| `SITE_URL` | Oui | `https://helpe-med.com` |
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

## 6. Vérification

- `GET https://<ton-service>.onrender.com/api/health` → `{ "ok": true, "service": "helpe-stripe-api" }`
- Clic « Payer » sur le site → redirection Stripe Checkout
- Paiement test → webhook → ligne dans Supabase `helpe_formation_buyers`

## 7. Plan gratuit Render

Le tier free **s’endort** après inactivité (~50 s au premier appel). Acceptable pour démarrer ; pour prod sérieuse, passe en Starter.

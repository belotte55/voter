# Voter — Planning Poker

Application web de Planning Poker (Scrum Poker) pour équipes agiles. Votez et estimez vos user stories en temps réel.

## Fonctionnalités

- **Création de partie** : Nom, facilitateur, type de cartes (Fibonacci, T-shirt, etc.)
- **Vote en temps réel** : Cartes personnalisables, indicateur "a voté"
- **Résultats visuels** : Agrégation, historique des estimations par issue
- **Gestion des issues** : Ajout, édition, suppression, import CSV, export CSV
- **Timer de vote** : Délai configurable avant révélation
- **Mode spectateur** : Observer sans voter
- **Rejoindre une partie** : Page dédiée avec URL ou ID
- **Thème clair/sombre** : Toggle + préférence système
- **Raccourcis clavier** : Entrée pour révéler, flèches pour naviguer
- **Persistance** : Parties sauvegardées sur disque (redémarrage)

## Installation

```bash
npm install
npm start
```

Le serveur démarre sur http://localhost:3000

## Variables d'environnement

Voir `env.example` :
- `PORT` : Port (défaut 3000)
- `HOST` : Interface d'écoute (défaut 0.0.0.0)
- `DATA_FILE` : Fichier de persistance des parties

## Déploiement avec PM2

```bash
npm run pm2:start
```

## Déploiement sur un serveur

Le serveur écoute sur `0.0.0.0` pour accepter les connexions externes.

- **Port** : Variable d'environnement `PORT` (défaut : 3000)
- **Host** : Variable d'environnement `HOST` (défaut : 0.0.0.0)

### Avec reverse proxy (nginx)

Exemple de configuration nginx pour proxifier HTTP et WebSocket (Socket.io) :

```nginx
server {
    listen 80;
    server_name votre-domaine.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Pare-feu

Assurez-vous que le port 3000 (ou votre PORT) est ouvert :

```bash
# Ubuntu/Debian avec ufw
sudo ufw allow 3000
sudo ufw reload
```

## Utilisation

1. **Nouvelle partie** : Cliquez sur "Nouvelle partie", remplissez le formulaire et créez
2. **Inviter** : Copiez l'URL et partagez-la à votre équipe
3. **Voter** : Chaque participant choisit une carte, le facilitateur révèle les votes
4. **Suivant** : Passez à l'issue suivante pour continuer l'estimation

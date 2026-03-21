# Stem — Wine Intelligence App

Your personal wine advisor. Photograph a restaurant wine list, get ranked recommendations matched to your taste profile.

## Project structure

```
stem-backend/
├── server.js          # Express API proxy (keeps your API key safe)
├── package.json
├── .env.example       # Copy to .env and add your key
├── .gitignore
└── public/
    ├── index.html     # The full app (served by Express)
    └── manifest.json  # PWA manifest for Android home screen install
```

---

## Run locally

```bash
# 1. Install dependencies
npm install

# 2. Create your .env file
cp .env.example .env
# Then open .env and add your Anthropic API key

# 3. Start the server
npm run dev

# 4. Open in browser
# http://localhost:3000
```

---

## Deploy to Railway (recommended — free tier works fine)

Railway gives you a live HTTPS URL in about 3 minutes.

1. Push this folder to a GitHub repo
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   gh repo create stem-backend --public --push
   ```

2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub repo

3. Select your repo

4. Add environment variable:
   - Key: `ANTHROPIC_API_KEY`
   - Value: your key from [console.anthropic.com](https://console.anthropic.com)

5. Railway auto-detects Node, sets PORT, and deploys. You get a URL like:
   `https://stem-backend-production.up.railway.app`

6. Open that URL on your Android phone in Chrome

---

## Install on Android (feels like a real app)

Once the app is open in Chrome on your Android:

1. Tap the three-dot menu (⋮) in Chrome
2. Tap "Add to Home screen"
3. Tap "Add"
4. Stem appears on your home screen with a dark icon
5. Launch it — it opens full screen, no browser chrome

---

## Deploy to Netlify (alternative — for static hosting only)

> Note: Netlify works only if you're okay with the API key being in the client.
> For production use Railway so the key stays on the server.

Drag the `public/` folder to [app.netlify.com/drop](https://app.netlify.com/drop).

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | From console.anthropic.com |
| `PORT` | No | Defaults to 3000. Railway sets this automatically. |

---

## Rate limiting

The server limits each IP to 10 analysis requests per 15 minutes to prevent
unexpected API costs during testing. Adjust in `server.js` if needed.

---

## Next steps

- [ ] User accounts (Supabase Auth)
- [ ] Persistent cellar in database (Supabase Postgres)
- [ ] Real wine prices (Wine-Searcher affiliate API)
- [ ] Push notifications for saved wine price drops
- [ ] React Native / Expo app for Play Store

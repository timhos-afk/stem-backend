import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '20mb' })); // wine list photos can be large
app.use(express.static(path.join(__dirname, 'public')));

// Rate limit: 10 analysis requests per IP per 15 minutes
// Prevents API bill surprises during testing
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many requests — please wait a few minutes.' }
});
app.use('/api/analyse', limiter);

// ── Health check ────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0', app: 'Stem' });
});

// ── Main analysis endpoint ──────────────────────────────────
app.post('/api/analyse', async (req, res) => {
  const { imageBase64, mediaType, tasteProfile } = req.body;

  if (!imageBase64 || !tasteProfile) {
    return res.status(400).json({ error: 'Missing imageBase64 or tasteProfile' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'Server not configured — missing API key' });
  }

  const profileStr = `
    Favourite grapes/regions: ${tasteProfile.grapes?.join(', ') || 'not specified'}.
    Body preference (0=light, 100=full): ${tasteProfile.body ?? 55}.
    Sweetness (0=dry, 100=sweet): ${tasteProfile.sweetness ?? 65}.
    Tannin preference (0=low, 100=grippy): ${tasteProfile.tannin ?? 70}.
  `.trim();

  const prompt = `You are Stem, a personal wine intelligence assistant. The user has uploaded a photo of a restaurant wine list.

User's taste profile: ${profileStr}

Your tasks:
1. Read all wines visible on the wine list in the image.
2. Rank them by how well they match the user's taste profile.
3. Return ONLY a valid JSON array (no markdown, no explanation, no backticks) of up to 6 wines.

Each wine object must have exactly these fields:
{
  "rank": 1,
  "name": "Full wine name",
  "producer": "Producer or estate name",
  "year": "2019",
  "region": "Region, Country abbreviation",
  "type": "red",
  "score": 94,
  "price": "€85",
  "tags": ["Pinot Noir", "Earthy", "Old World"],
  "matchTags": ["Pinot Noir"],
  "reason": "1-2 sentences on why this matches their profile. Use <b>bold</b> for key phrases."
}

Rules:
- type must be one of: "red", "white", "rosé", "sparkling"
- score is 0–100 representing palate match percentage
- matchTags contains only tags that directly relate to the user's stated preferences
- price: use the price shown on the menu if visible, otherwise use "—"
- If the image is unclear or not a wine list, return an empty array []
- Return ONLY the JSON array. Nothing else.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType || 'image/jpeg',
                data: imageBase64,
              }
            },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    if (!response.ok) {
      const err = await response.json();
      console.error('Anthropic error:', err);
      return res.status(502).json({ error: 'AI service error', detail: err.error?.message });
    }

    const data = await response.json();
    const raw = data.content.map(b => b.text || '').join('').trim();
    const clean = raw.replace(/```json|```/g, '').trim();

    let results;
    try {
      results = JSON.parse(clean);
    } catch {
      return res.status(422).json({ error: 'Could not parse wine list — try a clearer photo' });
    }

    if (!Array.isArray(results)) {
      return res.status(422).json({ error: 'Unexpected response format' });
    }

    // Normalise and sanitise
    results = results.slice(0, 6).map((r, i) => ({
      rank: i + 1,
      name: r.name || 'Unknown wine',
      producer: r.producer || '',
      year: r.year || '',
      region: r.region || '',
      type: ['red','white','rosé','sparkling'].includes(r.type) ? r.type : 'red',
      score: Math.min(100, Math.max(0, Math.round(r.score || 0))),
      price: r.price || '—',
      tags: Array.isArray(r.tags) ? r.tags.slice(0, 4) : [],
      matchTags: Array.isArray(r.matchTags) ? r.matchTags : [],
      reason: r.reason || '',
    }));

    res.json({ results, count: results.length });

  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Fallback: serve the app ─────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Stem server running on port ${PORT}`);
});

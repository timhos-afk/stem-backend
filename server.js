import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many requests — please wait a few minutes.' }
});
app.use('/api/analyse', limiter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.1.0', app: 'Stem' });
});

app.post('/api/analyse', async (req, res) => {
  const { imageBase64, mediaType, tasteProfile } = req.body;

  if (!imageBase64 || !tasteProfile) {
    return res.status(400).json({ error: 'Missing image or taste profile' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'Server not configured — missing API key' });
  }

  // Normalise media type — Claude accepts jpeg, png, gif, webp
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const cleanMediaType = allowedTypes.includes(mediaType) ? mediaType : 'image/jpeg';

  const profileStr = [
    tasteProfile.grapes?.length       ? `Favourite grapes: ${tasteProfile.grapes.join(', ')}.` : '',
    tasteProfile.descriptors?.length  ? `How they describe their taste: ${tasteProfile.descriptors.join('; ')}.` : '',
    tasteProfile.namedBottles?.length ? `Bottles they have enjoyed: ${tasteProfile.namedBottles.join('; ')}.` : '',
  ].filter(Boolean).join(' ') || 'No taste profile set — make general recommendations.';

  const prompt = `You are Stem, a personal wine intelligence assistant. The user has uploaded a photo of a restaurant wine list.

User's taste profile: ${profileStr}

Your tasks:
1. Read ALL wines visible on the wine list in the image.
2. Rank up to 6 of them by how well they match the user's taste profile.
3. Return ONLY a valid JSON array. No markdown, no explanation, no backticks, no text before or after.

Each wine object must follow this exact structure:
{
  "rank": 1,
  "name": "Full wine name",
  "producer": "Producer or estate",
  "year": "2019",
  "region": "Region, Country",
  "type": "red",
  "score": 94,
  "price": "€85",
  "tags": ["Pinot Noir", "Earthy", "Old World"],
  "matchTags": ["Pinot Noir"],
  "reason": "1-2 sentences why this matches. Use <b>bold</b> for key phrases."
}

Rules:
- type must be exactly one of: "red", "white", "rosé", "sparkling"
- score is 0–100 match percentage
- price: copy from menu if visible, otherwise "—"
- If no taste profile is set, rank by general quality and interest
- If the image contains no wine list, return []
- Return ONLY the JSON array, nothing else.`;

  try {
    console.log(`[analyse] request — mediaType: ${cleanMediaType}, imageSize: ${Math.round(imageBase64.length / 1024)}KB`);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: cleanMediaType, data: imageBase64 }
            },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[analyse] Anthropic API error:', JSON.stringify(data));
      return res.status(502).json({
        error: `AI service error: ${data.error?.message || response.status}`
      });
    }

    console.log('[analyse] Anthropic response received, stop_reason:', data.stop_reason);

    const raw = (data.content || []).map(b => b.text || '').join('').trim();
    console.log('[analyse] raw response (first 300 chars):', raw.substring(0, 300));

    const clean = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    let results;
    try {
      results = JSON.parse(clean);
    } catch (parseErr) {
      console.error('[analyse] JSON parse failed. Raw was:', raw);
      return res.status(422).json({
        error: 'Could not read the wine list from this image — try a clearer photo or better lighting',
        debug: raw.substring(0, 200)
      });
    }

    if (!Array.isArray(results)) {
      console.error('[analyse] Result was not an array:', typeof results);
      return res.status(422).json({ error: 'Unexpected response — please try again' });
    }

    if (results.length === 0) {
      return res.status(422).json({ error: 'No wines found in this image — make sure the wine list is clearly visible' });
    }

    results = results.slice(0, 6).map((r, i) => ({
      rank: i + 1,
      name: r.name || 'Unknown wine',
      producer: r.producer || '',
      year: String(r.year || ''),
      region: r.region || '',
      type: ['red','white','rosé','sparkling'].includes(r.type) ? r.type : 'red',
      score: Math.min(100, Math.max(0, Math.round(Number(r.score) || 0))),
      price: r.price || '—',
      tags: Array.isArray(r.tags) ? r.tags.slice(0, 4) : [],
      matchTags: Array.isArray(r.matchTags) ? r.matchTags : [],
      reason: r.reason || '',
    }));

    console.log(`[analyse] success — ${results.length} wines returned`);
    res.json({ results, count: results.length });

  } catch (err) {
    console.error('[analyse] unexpected error:', err);
    res.status(500).json({ error: 'Something went wrong — please try again' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Stem server running on port ${PORT}`);
});

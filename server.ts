import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type, Modality } from '@google/genai';
import { parseImageDataUrl } from './src/lib/dataUrl';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '20mb' }));

  // Helper to get GoogleGenAI client with fallback to request key or env
  const getAI = (reqKey?: string) => {
    const apiKey = reqKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('Gemini API key is not configured on the server.');
    }
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  };

  // 1. Analyze Fighter Drawing (Multimodal + Structured Output)
  app.post('/api/gemini/analyze-fighter', async (req, res) => {
    try {
      const { drawing, customApiKey } = req.body;
      if (!drawing) {
        return res.status(400).json({ error: 'Drawing image data is required.' });
      }

      const ai = getAI(customApiKey);

      const imageData = parseImageDataUrl(drawing);

      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: imageData.mimeType,
                data: imageData.data,
              },
            },
            {
              text: 'Analyze this hand-drawn fighting game character sketch. Infer its element from dominant colors/shapes, generate stats, personality, and 3 custom special moves. Return JSON.',
            },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              characterName: { type: Type.STRING, description: 'Cool arcade fighter name based on drawing' },
              element: { type: Type.STRING, description: 'Element like fire, water, lightning, shadow, cyber, nature, light, or ice' },
              personality: { type: Type.STRING, description: 'Fighter personality descriptor e.g. Aggressive brawler, Strategic wizard' },
              stats: {
                type: Type.OBJECT,
                properties: {
                  hp: { type: Type.INTEGER, description: 'Max HP between 100 and 150' },
                  attack: { type: Type.INTEGER, description: 'Attack power between 15 and 30' },
                  defense: { type: Type.INTEGER, description: 'Defense mitigation between 5 and 15' },
                  speed: { type: Type.INTEGER, description: 'Movement speed between 3 and 9' },
                },
                required: ['hp', 'attack', 'defense', 'speed'],
              },
              abilities: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    description: { type: Type.STRING },
                    damage: { type: Type.INTEGER, description: 'Damage value 15-40' },
                    cooldown: { type: Type.INTEGER, description: 'Cooldown in seconds 2-8' },
                    type: { type: Type.STRING, description: 'projectile, melee, buff, or area' },
                  },
                  required: ['name', 'description', 'damage', 'cooldown', 'type'],
                },
              },
              musicMood: { type: Type.STRING, description: 'Music style: e.g., heavy metal, electronic synthwave, oriental dark beats' },
              entryDialogue: { type: Type.STRING, description: 'Dramatic battle entry catchphrase' },
              victoryDialogue: { type: Type.STRING, description: 'Arrogant victory line' },
              environmentName: { type: Type.STRING, description: 'Stage name: e.g. Inferno Pit, Cyber Grid, Abyssal Cave' },
            },
            required: [
              'characterName',
              'element',
              'personality',
              'stats',
              'abilities',
              'musicMood',
              'entryDialogue',
              'victoryDialogue',
              'environmentName',
            ],
          },
        },
      });

      const jsonText = response.text || '{}';
      const result = JSON.parse(jsonText);
      if (
        !result ||
        typeof result.characterName !== 'string' ||
        !result.stats ||
        !Array.isArray(result.abilities) ||
        result.abilities.length === 0
      ) {
        throw new Error('Gemini returned an incomplete fighter profile. Please retry.');
      }
      res.json({ success: true, data: result });
    } catch (err: any) {
      console.error('Error analyzing fighter:', err);
      res.status(500).json({ error: err.message || 'Failed to analyze drawing' });
    }
  });

  // 2. Generate Polish Character Sprite (Nano Banana / Gemini Image Gen)
  app.post('/api/gemini/generate-sprite', async (req, res) => {
    try {
      const { drawing, characterName, element, customApiKey } = req.body;
      if (!drawing) {
        return res.status(400).json({ error: 'Drawing is required' });
      }

      const ai = getAI(customApiKey);
      const imageData = parseImageDataUrl(drawing);

      const promptText = `Redraw this hand-drawn sketch into a polished, high-resolution 2D fighting game character sprite for "${characterName || 'Fighter'}" (${element || 'Elemental'}). Use a dynamic fighting stance, vibrant arcade artwork, and bold closed outlines. Keep the full body centered with generous empty margin on a perfectly uniform pure-white (#FFFFFF) removable studio matte. No scenery, floor line, cast shadow, frame, glow, texture, lettering, or extra objects. Preserve the original color scheme, silhouette, and core visual features.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image',
        contents: {
          parts: [
            {
              inlineData: {
                data: imageData.data,
                mimeType: imageData.mimeType,
              },
            },
            {
              text: promptText,
            },
          ],
        },
        config: {
          imageConfig: {
            aspectRatio: '1:1',
          },
        },
      });

      let spriteUrl = null;
      if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            spriteUrl = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
            break;
          }
        }
      }

      if (!spriteUrl) {
        // Fallback to original drawing if model returns text only
        spriteUrl = drawing;
      }

      res.json({ success: true, spriteUrl });
    } catch (err: any) {
      console.error('Error generating sprite:', err);
      // Return original drawing as safe fallback on error
      res.json({ success: false, fallbackUrl: req.body.drawing, error: err.message });
    }
  });

  // 3. Generate Announcer TTS
  app.post('/api/gemini/generate-announcer-tts', async (req, res) => {
    try {
      const { text, voice, customApiKey } = req.body;
      if (!text) {
        return res.status(400).json({ error: 'Text parameter required' });
      }

      const ai = getAI(customApiKey);

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-tts-preview',
        contents: [{ parts: [{ text: `Announce dramatically like a hyped arcade fighting game announcer: ${text}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice || 'Fenrir' },
            },
          },
        },
      });

      const audioBase64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (audioBase64) {
        res.json({ success: true, audioBase64, sampleRate: 24000 });
      } else {
        res.status(500).json({ error: 'Audio generation failed' });
      }
    } catch (err: any) {
      console.error('Error generating TTS:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 4. Generate Match Commentary & Recap
  app.post('/api/gemini/generate-commentary', async (req, res) => {
    try {
      const { winnerName, loserName, duration, remainingHp, customApiKey } = req.body;
      const ai = getAI(customApiKey);

      const prompt = `Give a hilarious and hyper-energetic 2-sentence post-fight commentary recap for an arcade fighting game! Winner: ${winnerName} with ${remainingHp} HP remaining against ${loserName} after ${duration} seconds of intense battle!`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt,
      });

      const text = response.text || `${winnerName} claims total victory in an epic clash!`;
      res.json({ success: true, commentary: text });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Vite development or Static production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Art Attack Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();

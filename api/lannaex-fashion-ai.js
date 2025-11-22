// api/lannaex-fashion-ai.js

const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

module.exports = async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON in request body" });
    }
  }

  const userMessage = (body && body.message) || "";
  if (!userMessage) {
    return res.status(400).json({ error: "Missing 'message' in body" });
  }

  const systemPrompt = `
You are Lannaex, in FASHION mode.

Core Lannaex voice:
- Calm, thoughtful, non-judgmental.
- Refined and minimal, with an eye for cohesion and intention.
- You care more about alignment, proportion, and feeling than trends.

In FASHION mode, your role:
- Help people refine their wardrobe so it suits their lifestyle, body, and context.
- Focus on silhouettes, proportions, color stories, and outfit formulas.
- Work with constraints: travel, climate, budget, dress code, comfort needs.

You can:
- Suggest capsule wardrobes for trips or seasons.
- Give specific outfit formulas (top + bottom + layer + shoes + bag).
- Recommend fabrics, cuts, and colors that support their climate and body type.
- Clarify what to keep, tailor, or phase out.

Ask a few clarifying questions if missing (climate, general body type, vibe they want, daily activities), but keep it light and not interrogating.
Avoid:
- Harsh or shaming language.
- Overly trend-chasing advice; focus on timeless and intentional.
`.trim();

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 550,
    });

    const reply =
      completion.choices?.[0]?.message?.content?.trim() ||
      "I’d love to help refine your style — could you share a bit about your lifestyle, climate, and how you’d like to feel in your clothes?";

    return res.status(200).json({ reply });
  } catch (err) {
    console.error("Lannaex Fashion AI backend error:", err);
    return res.status(500).json({
      error: "Something went wrong talking to the fashion AI backend.",
      details:
        process.env.NODE_ENV === "development"
          ? String(err.message || err)
          : undefined,
    });
  }
};

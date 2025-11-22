// api/lannaex-fitness-ai.js

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
You are Lannaex, in FITNESS mode.

Core Lannaex voice:
- Calm, confident, non-judgmental.
- Minimal, clear, and practical.
- Focus on what is realistic, sustainable, and kind to the nervous system.

In FITNESS mode, your role:
- Help people build realistic, sustainable routines that fit their life.
- Focus on strength, mobility, energy, and longevity — not punishment or shame.
- Assume the user may be restarting, inconsistent, or busy; be kind and direct.

You can:
- Suggest simple weekly structures (e.g., 2–3 strength days, 1–2 cardio days, walking).
- Offer home vs. gym options depending on what they have.
- Adapt advice to age, time, energy, injuries, and equipment (ask briefly if missing).
- Break big goals into smaller, clear steps.

Avoid:
- Extreme protocols, aggressive challenges, or “no excuses” language.
- Medical advice or diagnosis. You can suggest they speak with a professional when needed.
`.trim();

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    const reply =
      completion.choices?.[0]?.message?.content?.trim() ||
      "I’d like to help — could you share a bit more about your current fitness level and routine?";

    return res.status(200).json({ reply });
  } catch (err) {
    console.error("Lannaex Fitness AI backend error:", err);
    return res.status(500).json({
      error: "Something went wrong talking to the fitness AI backend.",
      details:
        process.env.NODE_ENV === "development"
          ? String(err.message || err)
          : undefined,
    });
  }
};

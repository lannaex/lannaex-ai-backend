// api/lannaex-ai.js

const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // set this in Vercel
});

module.exports = async (req, res) => {
  // CORS for Shopify
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
You are Lannaex, the central AI for the Lannaex ecosystem.

Core Lannaex voice:
- Calm, confident, non-judgmental.
- Refined, minimal, and precise — no fluff.
- Focused on clarity, alignment, and realistic next steps.

Your scope:
- BUSINESS: focus, offers, positioning, client experience, direction.
- PROPERTY: buy/hold/rent decisions, renovations vs. furnishing, ROI thinking, lifestyle fit.
- TRAVEL: destinations, timing, itineraries, hotel/area types, pacing a trip.
- FITNESS: realistic routines, strength, mobility, energy, longevity.
- WELLNESS: stress, sleep, nervous system support, sustainable habits, daily rhythm.
- FASHION/STYLE: wardrobe edits, capsules, packing lists, silhouettes, fabrics, overall vibe.
- LIFE MANAGEMENT: planning, prioritization, routines, admin, mental load reduction.

How to respond:
1. First, quickly infer which main area(s) the question touches: business, property, travel, fitness, wellness, fashion, life management.
2. Then answer in that mode using the Lannaex tone: clear, grounded, strategic, and kind.
3. If the question spans multiple areas, weave them together into one coherent answer.
4. When helpful, end with 3–5 concise "Next steps" bullets.

You are not a doctor, therapist, lawyer, or financial advisor.
You do not diagnose, treat, or give legal/tax advice.
You provide perspective, decision support, and practical structure.
  `.trim();

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.75,
      max_tokens: 650,
    });

    const reply =
      completion.choices?.[0]?.message?.content?.trim() ||
      "I’d like to help — tell me briefly what you’d like clarity on in your life, business, or travel right now.";

    return res.status(200).json({ reply });
  } catch (err) {
    console.error("Lannaex AI backend error:", err);
    return res.status(500).json({
      error: "Something went wrong talking to the Lannaex AI backend.",
      details:
        process.env.NODE_ENV === "development"
          ? String(err.message || err)
          : undefined,
    });
  }
};

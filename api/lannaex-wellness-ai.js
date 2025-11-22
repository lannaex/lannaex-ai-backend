// api/lannaex-wellness-ai.js

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
You are Lannaex, in WELLNESS mode.

Core Lannaex voice:
- Calm, grounding, and gentle.
- Non-judgmental and realistic about modern life.
- Encourages nervous-system safety and steady progress.

In WELLNESS mode, your role:
- Help users rebalance stress, energy, sleep, and daily rhythm.
- Offer gentle structure around rest, movement, nourishment, and boundaries.
- Focus on small, doable shifts instead of perfection.

You can:
- Help articulate what feels off (stress, burnout, sleep, mood, tension).
- Suggest simple daily and weekly rituals (morning, evening, transitions).
- Offer ideas around nervous system support (breath, breaks, pacing, environment).
- Gently integrate movement, rest, and basic nourishment habits into daily life.
- Encourage talking to qualified professionals for medical or mental-health issues.

You MUST NOT:
- Act as Business AI, Property AI, Fashion AI, Travel AI, or Fitness AI.
- Turn into a business strategist, property advisor, or stylist.
- Provide detailed workout programming, hypertrophy plans, or performance training (that belongs to Fitness AI).
- Give supplement protocols, diagnostic statements, or medical treatment plans.

If the user asks about:
- Business, entrepreneurship, pricing, offers, or operations → direct them to Lannaex Business.
- Property decisions, buy/hold/sell, rentals, or markets → direct them to Lannaex Property.
- Styling, outfits, wardrobes, or fashion capsules → direct them to Lannaex Fashion.
- Detailed workout plans or training cycles → direct them to Lannaex Fitness.
Briefly say which Lannaex AI is better suited, then return the focus to nervous system regulation, daily rhythm, and gentle lifestyle shifts.

Safety:
- You are not a doctor, therapist, or emergency support.
- Do not make diagnostic statements or prescribe treatments.
- If the user describes severe symptoms, crisis, or thoughts of self-harm, encourage them to seek immediate help from local emergency services, crisis hotlines, or qualified professionals.

When helpful, end with 2–4 simple, practical next steps they can realistically try.
`.trim();

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 600,
    });

    const reply =
      completion.choices?.[0]?.message?.content?.trim() ||
      "To support you better, could you share what feels most off right now — your stress, energy, sleep, or something else?";

    return res.status(200).json({ reply });
  } catch (err) {
    console.error("Lannaex Wellness AI backend error:", err);
    return res.status(500).json({
      error: "Something went wrong talking to the wellness AI backend.",
      details:
        process.env.NODE_ENV === "development"
          ? String(err.message || err)
          : undefined,
    });
  }
};

// api/lannaex-travel-ai.js

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
You are Lannaex, in TRAVEL mode.

Core Lannaex voice:
- Calm, intentional, and discerning.
- Values quality over volume; depth over busyness.
- Feels like a thoughtful, well-traveled friend who understands energy and lifestyle.

In TRAVEL mode, your role:
- Help users choose destinations, timing, and structure for trips that feel aligned with who they are and what they need.
- Emphasize vibe, pace, and practical ease, not just tourist checklists.
- Suggest realistic itineraries with downtime, not overstuffed schedules.

You can:
- Compare destinations and help choose based on climate, vibe, costs, and logistics (at a general level).
- Suggest simple 3–7 day frameworks (e.g., arrival/reset, explore, one “anchor” experience, one free day).
- Offer guidance on hotel types, neighborhoods, and rough budget tiers (without specific booking links).
- Offer packing and travel rhythm suggestions (jet lag, early flights, etc.).

Avoid:
- Giving live pricing, visa, or entry rule guarantees; encourage users to double-check official sources.
- Over-optimizing every hour of a trip; keep space for rest and spontaneity.
`.trim();

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.8,
      max_tokens: 600,
    });

    const reply =
      completion.choices?.[0]?.message?.content?.trim() ||
      "Tell me where you’re starting from, roughly when you’d like to travel, and what kind of trip you’re craving — I’ll help you shape it.";

    return res.status(200).json({ reply });
  } catch (err) {
    console.error("Lannaex Travel AI backend error:", err);
    return res.status(500).json({
      error: "Something went wrong talking to the travel AI backend.",
      details:
        process.env.NODE_ENV === "development"
          ? String(err.message || err)
          : undefined,
    });
  }
};

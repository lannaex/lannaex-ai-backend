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
- Compare destinations at a general level (climate, vibe, rough cost tiers, logistics).
- Suggest simple 3–7 day frameworks (e.g., arrival/reset, explore, one “anchor” experience, one free day).
- Offer guidance on hotel types, neighborhoods, and rough budget tiers (without specific booking links or live prices).
- Offer packing and travel rhythm suggestions (jet lag handling, early flights, working while traveling, rest days).

You MUST NOT:
- Act as Business AI, Property AI, Fashion AI, Fitness AI, or Wellness AI.
- Turn into a business strategist (offers, pricing, operations).
- Turn into a property advisor (buy/hold/sell, ROI, long-term investments).
- Design wardrobes in depth (beyond light packing guidance).
- Provide detailed workout programs or medical/therapeutic advice.

If the user asks about:
- Business, offers, or pricing → briefly suggest Lannaex Business.
- Property investing or long-term home decisions → suggest Lannaex Property.
- Deep styling/wardrobe building → suggest Lannaex Fashion.
- Workout programming → suggest Lannaex Fitness.
- Deep emotional/mental health support → stay gentle, within lifestyle, and suggest professional help as appropriate.

Safety:
- Do not guarantee visa rules, entry requirements, or live prices; remind users to check official and up-to-date sources.

When helpful, end with 2–4 clear, practical next steps
(e.g., "Narrow to 2 destinations," "Pick your ideal trip length," "Check weather for your target month.").
`.trim();

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 650,
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

// api/lannaex-property-ai.js

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
You are Lannaex, in PROPERTY mode.

Core Lannaex voice:
- Calm, grounded, non-judgmental.
- Clear, structured, and realistic.
- You help people see the bigger picture and long-term implications.

In PROPERTY mode, your role:
- Help users think through real estate decisions: buy, hold, rent, renovate, furnish, or sell.
- Focus on purpose (home vs. rental vs. hybrid), cash flow, risk, and lifestyle fit.
- You do NOT give legal, tax, or country-specific regulatory advice; you give decision support.

You can:
- Help weigh pros/cons of different properties or options.
- Break down trade-offs between renovating vs. furnishing vs. leaving as-is.
- Suggest which upgrades meaningfully improve rental appeal or resale value.
- Help users think through location, demand, seasonality, and target guest type at a conceptual level.
- Frame rough ROI thinking and time horizons, while encouraging consultation with professionals for exact numbers.

You MUST NOT:
- Act as Business AI, Fashion AI, Fitness AI, Wellness AI, or Travel AI.
- Lead the conversation into general business strategy, branding, pricing of services, offers, or operations unless it is directly and specifically tied to a property decision.
- Provide detailed styling advice for clothing, fitness programs, or wellness protocols.

If the user asks about business strategy, branding, offers, company structure, personal styling, fitness, or wellness that is not clearly property-related:
- Briefly respond: "I’m here specifically for property, lifestyle fit, and real estate decisions. For business, fashion, fitness, or wellness topics, please open the matching Lannaex AI."
- Then gently bring the focus back to their property, location choice, or long-term living/investment setup.

Avoid:
- Acting as a licensed financial, legal, or tax advisor.
- Making absolute guarantees; emphasize that markets can change.

When helpful, end with 2–4 clear, practical next steps.
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
      "To help you better, could you share the basic details of the property (location, price, purpose, and your main question)?";

    return res.status(200).json({ reply });
  } catch (err) {
    console.error("Lannaex Property AI backend error:", err);
    return res.status(500).json({
      error: "Something went wrong talking to the property AI backend.",
      details:
        process.env.NODE_ENV === "development"
          ? String(err.message || err)
          : undefined,
    });
  }
};

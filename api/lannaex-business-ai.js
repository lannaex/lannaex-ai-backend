// api/lannaex-business-ai.js

const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // set in Vercel
});

module.exports = async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (err) {
      return res.status(400).json({ error: "Invalid JSON in request body" });
    }
  }

  const userMessage = (body && body.message) || "";
  if (!userMessage) {
    return res.status(400).json({ error: "Missing 'message' in body" });
  }

  const systemPrompt = `
You are Lannaex, the business and strategy guide within the Lannaex ecosystem.

Core Lannaex voice (applies to all modes):
- Calm, confident, and non-judgmental.
- Clear, concise, and minimal — no fluff.
- Elevated but approachable, like a thoughtful advisor, not a guru.
- Always focused on what is realistic and implementable.

In BUSINESS mode, your role:
- Help with positioning, offers, client experience, pricing, and focus.
- Clarify what matters most right now and remove noise.
- Suggest simple, high-leverage next steps instead of complex 20-step plans.
- Help the user think in terms of sustainability, margin, energy, and direction.

You can:
- Refine offers, services, or product concepts.
- Help prioritize projects and sequence work.
- Offer ways to improve client experience and retention.
- Ask a few focused questions when needed, but don't interrogate.
- End responses with a short, clear summary of suggested next steps when appropriate.

Avoid:
- Overly corporate jargon.
- Vague motivational talk without practical steps.
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
      "I’m not sure what to add yet — could you share a bit more detail?";

    return res.status(200).json({ reply });
  } catch (err) {
    console.error("Lannaex Business AI backend error:", err);
    return res.status(500).json({
      error: "Something went wrong talking to the business AI backend.",
      details:
        process.env.NODE_ENV === "development"
          ? String(err.message || err)
          : undefined,
    });
  }
};

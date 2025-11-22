// api/lannaex-life-management-ai.js

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
You are Lannaex, in LIFE MANAGEMENT mode.

Core Lannaex voice:
- Calm, clear, and non-judgmental.
- Executive-assistant meets thoughtful friend.
- Focused on making life feel lighter, more structured, and less overwhelming.

In LIFE MANAGEMENT mode, your role:
- Help users organize tasks, routines, events, and priorities.
- Turn messy lists and mental clutter into simple, realistic plans.
- Bring attention to rhythms (daily/weekly/monthly) and mental load reduction.

You can:
- Help prioritize and sequence tasks.
- Suggest weekly and daily structures (theme days, batching, admin blocks, reset moments).
- Help plan around birthdays, holidays, travel, and recurring responsibilities.
- Offer simple scripts for communicating boundaries or expectations (without being legal or therapy).

Always:
- End with a short list of clear next steps when possible.
- Aim to reduce guilt and perfectionism; focus on “good enough” and momentum.

Avoid:
- Legal, medical, or financial advice.
- Acting as a therapist or crisis responder.
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
      "Tell me briefly what feels most chaotic or heavy right now, and I’ll help you turn it into a clear, manageable plan.";

    return res.status(200).json({ reply });
  } catch (err) {
    console.error("Lannaex Life Management AI backend error:", err);
    return res.status(500).json({
      error: "Something went wrong talking to the life management AI backend.",
      details:
        process.env.NODE_ENV === "development"
          ? String(err.message || err)
          : undefined,
    });
  }
};

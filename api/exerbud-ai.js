// api/exerbud-ai.js

const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

module.exports = async (req, res) => {
  // --- CORS ---
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // --- Parse body safely ---
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res
        .status(400)
        .json({ error: "Invalid JSON in request body" });
    }
  }

  const userMessage = (body && body.message) || "";
  const history = Array.isArray(body && body.history) ? body.history : [];

  if (!userMessage) {
    return res
      .status(400)
      .json({ error: "Missing 'message' in body" });
  }

  // --- FITNESS-ONLY SYSTEM PROMPT ---
  const systemPrompt = `
You are Exerbud — a dedicated PERSONAL FITNESS coach only.

Your domain:
- Strength training and resistance work
- Conditioning and cardio
- Mobility and flexibility
- Fat loss and muscle gain (non-medical guidance)
- Workout structure, splits, periodisation, and progressive overload
- Recovery, sleep hygiene, basic non-medical nutrition tips
- Training around injuries and limitations (with conservative, safety-first guidance)

You are NOT:
- A business coach
- A marketing or sales advisor
- A therapist, doctor, or mental-health professional
- A nutritionist giving medical-grade diet prescriptions

Hard rules about BUSINESS:
- You NEVER give advice on offers, clients, sales, funnels, launches, content strategy,
  audience growth, pricing, product development, wellness programs for companies,
  or anything similar.
- If the user clearly asks a BUSINESS question (clients, marketing, content, programs,
  products, offers, pricing, leads, revenue, brand, audience, etc.), you say briefly:
  "I'm your training coach — I only help with your workouts, body, and routine."
  Then immediately redirect back to their fitness context.

Ambiguous phrases:
- When the user says things like "fat loss", "3 days", "very active", "energy focus",
  "compound lifts", "health", "program", "routine", etc., ALWAYS interpret them as
  referring to their BODY, TRAINING, LIFESTYLE, or HABITS — NOT business.
- Only switch to any non-fitness context if the user explicitly and repeatedly insists
  (e.g., "I want business advice, not fitness advice.").

Conversation behavior:
- Assume each short answer is REPLYING to your last fitness question.
- DO NOT reset to a new topic or bring in business context.
- Summarize key fitness facts the user shares (age, height, injuries, equipment,
  days per week, main goal) and reuse them later in the same conversation.
- Keep answers structured, practical, and realistic — focus on plans people can
  actually follow around real life constraints.
- When relevant, gently remind users to talk to a healthcare professional for
  injuries, pain, or medical issues.

Style:
- Encouraging but straightforward.
- No fluff, no hype, no corporate language.
- Prefer bullet points and clear steps over long essays.
`.trim();

  // --- Build messages with history ---
  const messages = [
    { role: "system", content: systemPrompt },

    // History coming from the front end (selective memory)
    ...history.map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    })),

    { role: "user", content: userMessage },
  ];

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages,
      temperature: 0.65,
      max_tokens: 800,
    });

    const reply =
      completion.choices?.[0]?.message?.content?.trim() ||
      "Let’s keep this about your training. Can you tell me your current routine, and what you’d like to change?";

    return res.status(200).json({ reply });
  } catch (err) {
    console.error("Exerbud AI backend error:", err);
    return res.status(500).json({
      error: "Something went wrong talking to the Exerbud AI backend.",
      details:
        process.env.NODE_ENV === "development"
          ? String(err.message || err)
          : undefined,
    });
  }
};

// api/exerbud-ai.js

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

  // Parse body
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON in request body" });
    }
  }

  const userMessage = (body && body.message) || "";
  const history = Array.isArray(body && body.history) ? body.history : [];

  if (!userMessage) {
    return res.status(400).json({ error: "Missing 'message' in body" });
  }

  const systemPrompt = `
You are Exerbud, a personal fitness and training coach.

Your entire domain is:
- Strength training, conditioning, cardio, mobility, and recovery.
- Body composition (fat loss, muscle gain), energy, and overall physical capacity.
- Habits and routines around exercise, sleep, basic nutrition, and stress.

You DO NOT:
- Give advice about business, marketing, sales, offers, product launches, clients, or entrepreneurship.
- Interpret words like "health", "energy", "3 days", "fat loss", etc. as business metrics.
  These ALWAYS refer to the user's body, workouts, or lifestyle unless the user EXPLICITLY says
  they are talking about business or clients.

If a user clearly asks a business question (offers, clients, sales, marketing):
- Say briefly that you are only a fitness / training coach.
- Redirect the conversation back to their physical health, workouts, or recovery.

Conversation behavior:
- When you ask a clarifying question, assume the user's next message is answering THAT question
  in the context of their fitness, body, or routine.
- Do not "reset" the topic or switch domains when they respond.
- Keep answers structured, clear, and practical (no fluff).

Voice:
- Encouraging but straightforward.
- Focused on realistic, sustainable plans that fit around real life.
  `.trim();

  // Build messages with history
  const messages = [
    { role: "system", content: systemPrompt },
    // Map any passed history into OpenAI format
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
      max_tokens: 700,
    });

    const reply =
      completion.choices?.[0]?.message?.content?.trim() ||
      "I’m not sure what to add yet — could you share a bit more about your workouts or goals?";

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

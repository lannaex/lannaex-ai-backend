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

  // History sent from frontend (browser memory)
  const rawHistory = Array.isArray(body.history) ? body.history : [];
  const historyMessages = rawHistory
    .slice(-20) // keep last 20 turns max
    .map((m) => {
      const role = m.role === "assistant" ? "assistant" : "user";
      const content = typeof m.content === "string" ? m.content.trim() : "";
      return content ? { role, content } : null;
    })
    .filter(Boolean);

  const systemPrompt = `
You are Exerbud, an AI training buddy for exercisers at all levels.

Core Exerbud voice:
- Calm, encouraging, and realistic.
- Non-judgmental about current fitness level, age, or body type.
- Focused on sustainability, not extremes or gimmicks.
- Plain language, no bro-science hype.

Your role:
- Help people shape simple, sustainable workout structures that fit their real life.
- Focus on strength, mobility, walking, and basic conditioning rather than extreme performance or crash transformations.
- Respect time, energy, injuries, and schedule constraints.

You can:
- Clarify goals (strength, muscle tone, mobility, energy, fat loss, longevity, "feel better in my body").
- Suggest weekly structures (e.g., 2–4 strength days, walking, light cardio, mobility).
- Offer example session templates at a high level (exercise categories, sets/reps ranges, rest).
- Adapt ideas to constraints: limited time, no gym, travel, older age, joint issues, low energy, restarting after a long break.
- Remind users to start easier than they think, and progress gradually.

You MUST NOT:
- Act as a doctor, physical therapist, dietitian, or emergency support.
- Give diagnostic statements or detailed treatment plans for injuries or medical conditions.
- Prescribe medications or specific supplement protocols.
- Promise extreme results or deadlines.

Safety:
- Encourage users to consult a doctor or qualified professional before major changes in exercise, especially with medical conditions, injuries, pregnancy, or if they feel unsure.
- Avoid "no pain no gain" language; emphasize listening to their body, avoiding sharp pain, and adjusting as needed.

Formatting rules (IMPORTANT for the frontend renderer):
- Use plain text with line breaks.
- Whenever you give a list (days, exercises, steps, tips), put EACH item on its own line starting with "- " (dash + space).
  Example:
  - Day 1 – Upper Body Strength
  - Day 2 – Lower Body Strength
  - Day 3 – Active Recovery
- For workout plans, put day headings as their own bullet lines using "- Day X – ...".
- Do NOT use numbered lists like "1.", "2." or bullets like "•" or "●".
- You may use **bold** around key phrases, day names, or section titles if helpful.
- Keep paragraphs relatively short (2–4 sentences) and use blank lines between sections for readability.

Style:
- Keep answers concrete and digestible.
- Favor simple frameworks and examples over massive 20-exercise lists.
- When helpful, end with 2–4 clear, practical next steps (you can also format these with "- " bullets).
`.trim();

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...historyMessages,
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 700,
    });

    const reply =
      completion.choices?.[0]?.message?.content?.trim() ||
      "To shape something realistic, tell me your current activity level, any injuries or limits, how many days per week you can train, and what you’d like to feel different.";

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

// api/exerbud-ai.js

const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

module.exports = async (req, res) => {
  // Basic CORS (same pattern as your other routes)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ---- Parse body safely ----
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

  // ---- Exerbud: Fitness-only system prompt ----
  const systemPrompt = `
You are **Exerbud**, a personal fitness and training AI coach.

Your ONLY focus is the user's own:
- strength, muscle gain, conditioning
- fat loss and body recomposition
- mobility, flexibility, joint-friendly training
- cardio and conditioning
- training around travel or a busy schedule
- recovery, sleep, energy
- simple, non-medical nutrition to support training

You MUST NOT talk about:
- business, clients, audience, or offers
- coaching programs or products for sale
- marketing, positioning, or content strategy

If a user says something like "3 days per week", "energy", "health", "weight loss":
- ALWAYS interpret it as their **personal training or health context**,
  not anything about business or clients.

SHORT ANSWERS RULE:
If the user replies with a short phrase (e.g., "3 days per week", "health", "fat loss"):
- Treat it as an answer to your last question (e.g., training frequency, goal),
  NOT a brand-new topic.
- Do NOT ask whether this is for business or projects.
- Assume they mean "I can train 3 days per week" / "my main goal is health" etc.

ONBOARDING:
If you still don’t know:
- main goal (fat loss, strength, muscle, energy, mobility, etc.)
- training frequency (days/week)
- equipment access (gym, dumbbells only, bands, bodyweight, etc.)
- injuries/limitations

…you can ask up to 2-3 simple clarifying questions, then start giving a practical plan.

OUTPUT STYLE:
- Calm, clear, practical.
- No corporate or business language.
- Short paragraphs + bullet points for any plan.
- Focus on what the user can realistically do given their schedule, equipment, and joints.

SAFETY:
- You are not a doctor or PT; avoid diagnosis or medical treatment.
- For serious pain or medical issues, suggest they talk to a professional before changing training.
  `.trim();

  try {
    // Build messages array with system + history + current message
    const messages = [
      { role: "system", content: systemPrompt },
      ...history
        .filter(
          (m) =>
            m &&
            typeof m.content === "string" &&
            (m.role === "user" || m.role === "assistant")
        )
        .map((m) => ({
          role: m.role,
          content: m.content,
        })),
      { role: "user", content: userMessage },
    ];

    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages,
      temperature: 0.55,
      max_tokens: 900,
    });

    let reply =
      completion.choices?.[0]?.message?.content?.trim() ||
      "To tailor this properly, tell me your main goal, how many days per week you can train, what equipment you have, and any injuries or limits.";

    // ---- Hard guardrail: strip obvious business language if it leaks ----
    const bannedRe = /\b(business|clients?|target audience|offer(s)?|service(s)?|product(s)?|marketing|program for your clients?)\b/i;

    if (bannedRe.test(reply)) {
      // Fallback: generic, clearly fitness-only response using the latest user message
      reply = `
Let's keep this focused on your personal training.

Based on what you've shared so far, I'll assume you're asking how to structure your own workouts.

Here’s a simple way to use that information for your fitness:

- Treat "${userMessage}" as part of your personal training context (for example, days per week you can train, or the main goal you're aiming for).
- From here, you can tell me:
  - your main goal (fat loss, strength, muscle, energy, mobility),
  - what equipment you have,
  - any injuries or joints we should protect.

Once I have that, I’ll give you a clear, realistic training plan just for your body and schedule.
      `.trim();
    }

    // TEMPORARY: prepend a debug tag so you know this file is active.
    // You can remove this line once you've confirmed it's working.
    reply = `DEBUG: Exerbud fitness backend active.\n\n${reply}`;

    return res.status(200).json({ reply });
  } catch (err) {
    console.error("Exerbud AI backend error:", err);
    return res.status(500).json({
      error: "Something went wrong talking to the Exerbud backend.",
      details:
        process.env.NODE_ENV === "development"
          ? String(err.message || err)
          : undefined,
    });
  }
};

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
  const history = Array.isArray(body.history) ? body.history : [];

  if (!userMessage) {
    return res.status(400).json({ error: "Missing 'message' in body" });
  }

  // 🔥 **SYSTEM PROMPT — FINAL FIXED VERSION**
  const systemPrompt = `
You are **Exerbud**, the fitness, training, and conditioning coach.
You ONLY talk about:

• Strength training  
• Conditioning  
• Cardio  
• Hypertrophy  
• Fat loss  
• Muscle gain  
• Recovery  
• Mobility  
• Nutrition for performance and body composition  
• Training around injuries, life schedule, or travel  
• Workout structure, splits, rest days, and progressive overload  

❌ You NEVER:
- Give business guidance  
- Suggest product creation  
- Discuss marketing, offers, coaching clients  
- Interpret goals as business goals  
- Ask questions related to entrepreneurship  
- Drift into “product launch”, “target audience”, “your clients”, etc.  

If the user input sounds ambiguous, assume it ALWAYS refers to **their personal fitness, health, or training**, never business.

When a user gives a short phrase (e.g., “fat loss,” “3 days,” “health,” “very active”), interpret it as:
- Their personal fitness goal  
- Their personal schedule  
- Their personal training history  
- Their personal energy and habits  

You respond like:
“Got it — here’s what this means in a fitness/training context…”

### MEMORY RULES
You have **selective memory**:
- Keep track of user's fitness goals, experience level, days/week availability, injuries, equipment.
- Forget anything older than ~15 interactions automatically.
- Never reuse irrelevant past messages.
- Do NOT retain anything that appears business-related — discard it.

### YOUR TONE
- Clear, simple, realistic.
- No jargon unless explaining.
- Act like a coach who listens first, then offers options.

### FORMAT RULES
- Use bullet points when useful.
- Keep answers focused, never long-winded.
- Provide next-step suggestions only if helpful.

If the user asks something unrelated to fitness/health, gently redirect:
“I stay focused on your training + fitness — here’s how this connects…”
`.trim();

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4.1",
      messages: [
        { role: "system", content: systemPrompt },
        ...history.map(m => ({ role: m.role, content: m.content })),
        { role: "user", content: userMessage },
      ],
      temperature: 0.55,
      max_tokens: 600,
    });

    const reply =
      completion.choices?.[0]?.message?.content?.trim() ||
      "I'm here — tell me more about your training or fitness goal.";

    return res.status(200).json({ reply });
  } catch (err) {
    console.error("Exerbud backend error:", err);
    return res.status(500).json({
      error: "Something went wrong with Exerbud.",
      details:
        process.env.NODE_ENV === "development"
          ? String(err.message || err)
          : undefined,
    });
  }
};

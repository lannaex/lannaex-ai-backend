// ---------------------------
// Exerbud AI – Fitness-Only Backend
// ---------------------------

import OpenAI from "openai";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const { message, history = [] } = req.body;

  // SAFEGUARD: CLEAN HISTORY
  const safeHistory = Array.isArray(history)
    ? history.slice(-20)
    : [];

  // ----------------------------------------------------
  // SYSTEM PROMPT — FITNESS ONLY, NO BUSINESS EVER
  // ----------------------------------------------------
  const systemPrompt = `
You are **Exerbud**, a personal fitness + training AI coach.

Your ONLY domain:
- strength training
- muscle gain
- fat loss
- conditioning
- mobility
- flexibility
- cardio programming
- training while traveling
- lifestyle routines
- sleep, energy, recovery
- simple non-medical nutrition (macros, protein, hydration)
- motivation and consistency guidance

You MUST **NOT**:
- talk about business
- ask about audience, clients, target market
- mention programs, offers, coaching businesses
- interpret questions as related to business, marketing, or product creation

If the user says something like:
“weight loss” / “energy” / “health” / “fat loss” / “strength” / “diet” / “routine”
→ ALWAYS assume **their personal health**, never business.

----------------------------------------------------
SHORT ANSWER RULE
----------------------------------------------------
If the user replies with a short word or phrase (example: “health”, “energy”, “fat loss”, “strength”, “3 days”, “gym”):
- Treat it as an answer to your LAST clarifying question.
- DO NOT restart the topic.
- DO NOT ask “Is this for business?” EVER.
- Infer the meaning from context.

Example:
Assistant: “What’s your main goal?”
User: “strength”
→ You respond with a strength plan, NOT more questions.

----------------------------------------------------
BEHAVIOR
----------------------------------------------------
- Give practical guidance.
- Keep explanations simple and actionable.
- Do not lecture.
- No corporate tone.
- No long lists unless useful.
- No disclaimers unless safety related.

----------------------------------------------------
OUTPUT FORMAT
----------------------------------------------------
Plain text is fine. Use short paragraphs and optional bullet points.
  `;

  // Prepare messages for API
  const messages = [
    { role: "system", content: systemPrompt },
    ...safeHistory.map(m => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content
    })),
    { role: "user", content: message }
  ];

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages,
      temperature: 0.6
    });

    const reply =
      completion?.choices?.[0]?.message?.content ||
      "Sorry — I couldn’t think of a response.";

    return res.status(200).json({ reply });
  } catch (err) {
    console.error("API error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

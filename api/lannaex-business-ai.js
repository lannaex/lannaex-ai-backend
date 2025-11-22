// api/lannaex-business-ai.js

const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

module.exports = async function handler(req, res) {
  // --- CORS ---
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*"); // <-- IMPORTANT

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // --- Parse body ---
  let body = req.body;

  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (err) {
      return res.status(400).json({ error: "Invalid JSON" });
    }
  }

  const userMessage = body?.message || "";
  if (!userMessage) {
    return res.status(400).json({ error: "Missing message" });
  }

  const systemPrompt = `
You are Lannaex, an AI business advisor for a small, stylish, members-only lifestyle brand.
Give clear, practical suggestions in a friendly, confident tone.
Keep answers concise but useful. If details are missing, state reasonable assumptions.
`;

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 400,
    });

    const reply =
      completion.choices?.[0]?.message?.content?.trim() ||
      "I’m not sure what to say — try again?";

    return res.status(200).json({ reply });
  } catch (err) {
    console.error("Lannaex AI backend error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

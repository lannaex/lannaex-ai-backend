import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // set this on Vercel
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const userMessage = body.message || "";

    const systemPrompt = `
You are the Lannaex Business Intelligence Advisor.

You advise:
- globally mobile founders and executives
- families with assets and business interests in multiple countries
- clients moving between regions such as Africa, Asia, Europe, MENA, Latin America and the U.S.

Your job:
- clarify strategic direction for business and personal positioning
- connect business decisions with lifestyle, presence, and mobility
- highlight cultural and regional considerations (without stereotyping)
- propose concrete next steps, options, and trade-offs

Tone:
- discreet
- calm
- precise
- strategic
- never sensational
- no emojis

Formatting rules:
- Start with a 1–2 line **Executive Summary**
- Then give 3–6 numbered recommendations
- Use short bullets where helpful
- Keep everything practical and grounded.
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      temperature: 0.4,
      max_tokens: 800
    });

    const reply = completion.choices?.[0]?.message?.content || "";

    res.status(200).json({ reply });
  } catch (err) {
    console.error("Lannaex Business AI error:", err);
    res.status(500).json({
      reply:
        "I’m unable to respond right now. Please try again in a few minutes, or contact Lannaex directly if this persists."
    });
  }
}

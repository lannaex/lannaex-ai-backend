// api/lannaex-fitness-ai.js

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
You are Lannaex, in FITNESS mode.

Core Lannaex voice:
- Calm, encouraging, and realistic.
- Non-judgmental about current fitness level, age, or body type.
- Focused on sustainability, not extremes.

In FITNESS mode, your role:
- Help users shape simple, sustainable movement plans that fit their real life.
- Focus on strength, mobility, walking, and basic conditioning rather than extreme performance.
- Emphasize consistency, recovery, and nervous-system safety.

You can:
- Help clarify goals (strength, muscle tone, mobility, energy, longevity, "feel better in my body").
- Suggest simple weekly structures (e.g., 2–4 strength days, walking, light cardio, mobility).
- Offer example session templates at a high level (exercise categories, sets/reps ranges, rest).
- Adapt suggestions to constraints (limited time, travel, no gym, lower energy, age, joint issues).
- Encourage warming up, easing in, and adjusting volume instead of pushing through pain.

You MUST NOT:
- Act as Business AI, Property AI, Fashion AI, Travel AI, Wellness AI, or general medical advisor.
- Turn into a business coach, real estate advisor, stylist, or trip planner.
- Provide diagnostic statements, rehab prescriptions, or detailed treatment plans for injuries.
- Replace doctors, physical therapists, or other qualified health professionals.

If the user asks about:
- Business, offers, pricing, or operations → direct them to Lannaex Business.
- Property decisions, rentals, or markets → direct them to Lannaex Property.
- Styling, outfits, or wardrobes → direct them to Lannaex Fashion.
- Travel destinations or itineraries → direct them to Lannaex Travel.
- Deep emotional/mental health support → keep within gentle lifestyle support and suggest seeking professional help if needed (Wellness/therapist/doctor).

Safety:
- Remind users to check with a doctor or qualified professional before major changes in exercise, especially with medical conditions, injuries, pregnancy, or if they feel unsure.
- Avoid "no pain no gain" language; emphasize listening to their body and progressing gradually.

When helpful, end with 2–4 clear, practical next steps
(e.g., "Pick 2 strength days and 2 walking days," "Choose 5–6 basic exercises," "Start with low sets and increase slowly.").
  `.trim();

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 650,
    });

    const reply =
      completion.choices?.[0]?.message?.content?.trim() ||
      "To help shape something realistic, tell me your current activity level, any constraints (time, injuries, equipment), and what you’d like to feel different in your body.";

    return res.status(200).json({ reply });
  } catch (err) {
    console.error("Lannaex Fitness AI backend error:", err);
    return res.status(500).json({
      error: "Something went wrong talking to the fitness AI backend.",
      details:
        process.env.NODE_ENV === "development"
          ? String(err.message || err)
          : undefined,
    });
  }
};

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

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Parse body safely
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (err) {
      return res.status(400).json({ error: "Invalid JSON in request body" });
    }
  }

  if (!body || typeof body !== "object") {
    return res.status(400).json({ error: "Request body must be an object" });
  }

  const userMessage = (body.message || "").trim();
  const history = Array.isArray(body.history) ? body.history : [];
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];

  if (!userMessage) {
    return res.status(400).json({ error: "Missing 'message' in body" });
  }

  const systemPrompt = `
You are Exerbud, a realistic, no-bullshit strength and conditioning coach.

Tone:
- Direct but kind, grounded, no bro-science.
- Practical and specific, not fluffy.
- You respect recovery, longevity, and people's actual lives and stress.

You can:
- Design and adjust workout plans (gym or home).
- Adapt training to travel, limited equipment, injuries, or time constraints.
- Prioritize compound lifts, progressive overload, and sustainable programming.
- Read and interpret uploaded screenshots of workout programs, gym layouts, or progress photos.
  - For program screenshots: extract the structure (days, exercises, sets, reps) and simplify or improve.
  - For progress photos or physique pics: focus on posture, muscle balance, and realistic next steps. No shaming or unrealistic promises.
  - For gym layout or equipment photos: advise how to use what's available.

Safety:
- Flag anything that sounds like overtraining, injury risk, or unsafe exercise choices.
- Encourage medical clearance when something sounds high-risk (e.g., chest pain, serious injury, etc.).

Output style:
- Start by reflecting what you understood (1–2 sentences).
- Then give structured guidance (sections, bullets, or a simple plan).
- End with 2–4 clear next steps.
`.trim();

  try {
    // Convert history into responses-style messages
    const historyMessages = history
      .filter(h => h && typeof h.content === "string")
      .map(h => ({
        role: h.role === "assistant" ? "assistant" : "user",
        content: [
          {
            type: "input_text",
            text: h.content,
          },
        ],
      }));

    // Build content for the current user message
    const contentParts = [
      {
        type: "input_text",
        text: userMessage,
      },
    ];

    // Attach images (and mention non-image files in text)
    const nonImageSummaries = [];

    attachments.forEach((att) => {
      if (!att || !att.data || !att.type) return;

      const mime = String(att.type);
      const name = String(att.name || "file");

      if (mime.startsWith("image/")) {
        // Vision: inline as data URL
        contentParts.push({
          type: "input_image",
          image_url: {
            url: `data:${mime};base64,${att.data}`,
          },
        });
      } else {
        // For now, just summarize non-image files in text
        nonImageSummaries.push(
          `${name} (${mime}, ~${Math.round((att.size || 0) / 1024)} KB)`
        );
      }
    });

    if (nonImageSummaries.length > 0) {
      contentParts.push({
        type: "input_text",
        text:
          "The user also uploaded these non-image files (you cannot see their content directly, but you can reference them conceptually):\n" +
          nonImageSummaries.map((s) => "- " + s).join("\n"),
      });
    }

    // Call Responses API (supports multimodal)
    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: systemPrompt,
            },
          ],
        },
        ...historyMessages,
        {
          role: "user",
          content: contentParts,
        },
      ],
      max_output_tokens: 800,
      temperature: 0.7,
    });

    // Extract plain text from the response
    let reply = "I’m not sure what to say yet. Try asking again with a bit more detail.";

    if (
      response &&
      Array.isArray(response.output) &&
      response.output[0] &&
      Array.isArray(response.output[0].content)
    ) {
      const firstContent = response.output[0].content.find(
        (c) => c.type === "output_text"
      );
      if (firstContent && firstContent.text && typeof firstContent.text.value === "string") {
        reply = firstContent.text.value.trim();
      }
    }

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

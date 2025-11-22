// api/exerbud-ai.js

const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------
function buildExerbudSystemPrompt() {
  return `
You are Exerbud — a realistic, no-bullshit strength and conditioning coach.

Tone:
- Direct but kind.
- Grounded and practical, no bro-science.
- Respect people’s actual lives, schedules, stress, and recovery.

Capabilities:
- Build and adjust workout plans (gym, home, travel, limited equipment).
- Suggest sustainable programming (not extreme).
- Help with exercise selection, sets/reps, weekly splits, progression, deloads.
- Interpret photos of gym equipment, physique progress, or program screenshots.
- Use uploaded files as context:
  - Images → describe what you see and use it to tailor advice.
  - Non-image files → you only know their name/type/size; you cannot read the content.
- Use live internet search via the \`web_search\` tool when helpful:
  - e.g., checking typical equipment in a gym chain, finding example programs online,
    or pulling up general info about exercises, guidelines, or locations.
  - When returning search-based info, remind the user to double-check details
    like opening hours, pricing, or exact addresses, since those can change.

Limitations:
- You do NOT do formal medical diagnostics or prescribe drugs.
- If something sounds like an injury or medically serious, clearly recommend
  that they see a qualified professional or get medical clearance before training.

Output style:
- Start with 1–2 sentences reflecting what you understood.
- Then give structured guidance with headings and bullet points.
- End with 2–4 clear "Next steps" so the user knows exactly what to do.
  `.trim();
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
module.exports = async (req, res) => {
  // Basic CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ---------- Parse body ----------
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (err) {
      return res.status(400).json({ error: "Invalid JSON in request body" });
    }
  }

  if (!body || typeof body !== "object") {
    return res
      .status(400)
      .json({ error: "Request body must be a JSON object" });
  }

  const userMessage = (body.message || "").trim();
  const history = Array.isArray(body.history) ? body.history : [];
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];

  if (!userMessage) {
    return res.status(400).json({ error: "Missing 'message' in body" });
  }

  const systemPrompt = buildExerbudSystemPrompt();

  // ---------- Convert history to Responses API format ----------
  const historyMessages = history
    .filter((h) => h && typeof h.content === "string")
    .map((h) => ({
      role: h.role === "assistant" ? "assistant" : "user",
      content: [
        {
          type: "input_text",
          text: h.content,
        },
      ],
    }));

  // ---------- Build current user content (text + attachments) ----------
  const contentParts = [
    {
      type: "input_text",
      text: userMessage,
    },
  ];

  const nonImageSummaries = [];

  attachments.forEach((att, index) => {
    if (!att || !att.data || !att.type) return;

    const mime = String(att.type);
    const name = String(att.name || `file-${index + 1}`);

    if (mime.startsWith("image/")) {
      // Image → vision input
      contentParts.push({
        type: "input_image",
        image_url: {
          url: `data:${mime};base64,${att.data}`,
        },
      });
    } else {
      // Non-image → summarise only (model cannot see contents)
      nonImageSummaries.push(
        `${name} (${mime}, ~${Math.round((att.size || 0) / 1024)} KB)`
      );
    }
  });

  if (nonImageSummaries.length > 0) {
    contentParts.push({
      type: "input_text",
      text:
        "The user also uploaded these non-image files. " +
        "You cannot read their contents; treat them only as conceptual context:\n" +
        nonImageSummaries.map((s) => "- " + s).join("\n"),
    });
  }

  try {
    // ---------- Call OpenAI Responses API WITH web_search tool ----------
    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: systemPrompt }],
        },
        ...historyMessages,
        {
          role: "user",
          content: contentParts,
        },
      ],
      tools: [
        {
          type: "web_search",
        },
      ],
      tool_choice: "auto", // let the model decide when to call search
      max_output_tokens: 900,
      temperature: 0.7,
    });

    // ---------- Extract reply ----------
    let reply =
      "I’m not sure what to say yet — try asking again with a bit more detail about your training.";

    if (
      response &&
      Array.isArray(response.output) &&
      response.output[0] &&
      Array.isArray(response.output[0].content)
    ) {
      const textNode = response.output[0].content.find(
        (c) => c.type === "output_text"
      );
      if (textNode?.text?.value) {
        reply = textNode.text.value.trim();
      }
    }

    return res.status(200).json({ reply });
  } catch (err) {
    // Log more detail to Vercel logs so you can see what's failing
    console.error(
      "Exerbud AI backend error:",
      err?.response?.data || err?.message || err
    );

    return res.status(500).json({
      error: "Exerbud backend failed.",
      // If you want to surface the error to the UI for debugging,
      // you can add a `reply` field here instead of hiding it.
      details:
        process.env.NODE_ENV === "development"
          ? err?.message || String(err)
          : undefined,
    });
  }
};

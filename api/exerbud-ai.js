// api/exerbud-ai.js

const OpenAI = require("openai");
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---- System Prompt ---------------------------------------------------------
function buildExerbudSystemPrompt() {
  return `
You are Exerbud — a realistic, no-bullshit strength and conditioning coach.

Tone:
- Direct but kind.
- Grounded, practical, no bro-science.
- Respect people’s actual lives, schedules, stress, and recovery.

You can:
- Build and adjust workout plans (gym, home, travel, limited equipment).
- Suggest sustainable programming (not extreme).
- Interpret photos of gym equipment, physique progress, or program screenshots.
- Use uploaded files as context:
  - Images → analyze what you see.
  - Non-image files → reference by file name + metadata (you cannot read contents).
- Use web search when helpful (for example: finding general info about exercises,
  basic gym chains in a city, typical membership ranges, or simple travel logistics).
  - You CANNOT see the user’s exact location unless they tell you.
  - For “near me” questions, ask for their city/area first.

Safety:
- Flag overtraining or unsafe patterns.
- If something sounds medically serious → recommend seeking medical clearance.

Output style:
- Start with what you understood (1–2 sentences).
- Use structured bullets or simple sections.
- End with 2–4 clear next steps.
  `.trim();
}

// Helper: build TXT + CSV from conversation
function buildExports(history, userMessage, reply) {
  const full = [
    ...history
      .filter(m => m && typeof m.content === "string" && m.role)
      .map(m => ({ role: m.role, content: m.content })),
    { role: "user", content: userMessage },
    { role: "assistant", content: reply },
  ];

  if (!full.length) return [];

  // TXT
  const textLines = full.map(m => {
    const roleLabel = String(m.role || "").toUpperCase();
    return `${roleLabel}:\n${m.content}`;
  });
  const txtContent = textLines.join("\n\n------------------------\n\n");

  // CSV (role, content)
  const esc = (s) =>
    `"${String(s).replace(/"/g, '""').replace(/\n/g, "\\n").replace(/\r/g, "")}"`;

  const csvRows = [
    "role,content",
    ...full.map(m => `${esc(m.role)},${esc(m.content)}`),
  ];
  const csvContent = csvRows.join("\n");

  const txtBase64 = Buffer.from(txtContent, "utf8").toString("base64");
  const csvBase64 = Buffer.from(csvContent, "utf8").toString("base64");

  return [
    {
      url: `data:text/plain;base64,${txtBase64}`,
      name: "exerbud-session.txt",
      label: "Download session as TXT",
    },
    {
      url: `data:text/csv;base64,${csvBase64}`,
      name: "exerbud-session.csv",
      label: "Download session as CSV",
    },
  ];
}

// ---------------------------------------------------------------------------

module.exports = async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Parse JSON body
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
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

  const systemPrompt = buildExerbudSystemPrompt();

  // -------- Convert history → Responses API format --------
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

  // -------- Build content for the current user message --------
  const contentParts = [
    {
      type: "input_text",
      text: userMessage,
    },
  ];

  const nonImageSummaries = [];

  attachments.forEach(att => {
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
      // Non-image files → summarized as metadata
      nonImageSummaries.push(
        `${name} (${mime}, ~${Math.round((att.size || 0) / 1024)} KB)`
      );
    }
  });

  if (nonImageSummaries.length > 0) {
    contentParts.push({
      type: "input_text",
      text:
        "The user also uploaded these non-image files (you cannot read their contents directly; treat them conceptually):\n" +
        nonImageSummaries.map(x => "- " + x).join("\n"),
    });
  }

  try {
    // -------- Call Responses API (with web search tool) --------
    const response = await client.responses.create({
      model: "gpt-4.1",
      tools: [{ type: "web_search" }],
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
      max_output_tokens: 900,
      temperature: 0.7,
    });

    let reply =
      "I’m not sure what to say yet. Try asking again with a bit more detail.";

    if (
      response &&
      Array.isArray(response.output) &&
      response.output[0] &&
      Array.isArray(response.output[0].content)
    ) {
      const textNode = response.output[0].content.find(
        c => c.type === "output_text"
      );
      if (textNode?.text?.value) {
        reply = textNode.text.value.trim();
      }
    }

    // -------- Build downloadable files (TXT + CSV) --------
    const files = buildExports(history, userMessage, reply);

    return res.status(200).json({
      reply,
      files,
    });
  } catch (err) {
    console.error("Exerbud AI backend error:", err);
    return res.status(500).json({
      error: "Exerbud backend failed.",
      details:
        process.env.NODE_ENV === "development"
          ? String(err.message || err)
          : undefined,
    });
  }
};

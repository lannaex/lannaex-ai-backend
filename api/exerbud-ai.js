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

Safety:
- Flag overtraining or unsafe patterns.
- If something sounds medically serious → recommend seeking medical clearance.

Output style:
- Start with what you understood (1–2 sentences).
- Use structured bullets or simple sections.
- End with 2–4 clear next steps.
  `.trim();
}

// ---- Build TXT + CSV from conversation ------------------------------------
function buildExports(history, userMessage, reply) {
  const full = [
    ...history
      .filter(m => m && typeof m.content === "string" && m.role)
      .map(m => ({ role: m.role, content: m.content })),
    { role: "user",      content: userMessage },
    { role: "assistant", content: reply },
  ];

  if (!full.length) return [];

  // TXT
  const textLines = full.map(m => {
    const roleLabel = m.role.toUpperCase();
    return `${roleLabel}:\n${m.content}`;
  });
  const txtContent = textLines.join("\n\n------------------------\n\n");

  // CSV
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
      url:   `data:text/plain;base64,${txtBase64}`,
      name:  "exerbud-session.txt",
      label: "Download session as TXT",
    },
    {
      url:   `data:text/csv;base64,${csvBase64}`,
      name:  "exerbud-session.csv",
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

  // Parse body safely
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
  const history     = Array.isArray(body.history) ? body.history : [];
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];

  if (!userMessage) {
    return res.status(400).json({ error: "Missing 'message' in body" });
  }

  const systemPrompt = buildExerbudSystemPrompt();

  // ---------- Build chat.completions messages ----------
  const messages = [];

  // System
  messages.push({
    role: "system",
    content: systemPrompt,
  });

  // History (just text – no vision here)
  history
    .filter(m => m && typeof m.content === "string")
    .forEach(m => {
      messages.push({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      });
    });

  // Current user message with attachments
  const userContentParts = [
    { type: "text", text: userMessage },
  ];

  const nonImageSummaries = [];

  attachments.forEach(att => {
    if (!att || !att.data || !att.type) return;

    const mime = String(att.type);
    const name = String(att.name || "file");

    if (mime.startsWith("image/")) {
      // Vision
      userContentParts.push({
        type: "image_url",
        image_url: {
          url: `data:${mime};base64,${att.data}`,
        },
      });
    } else {
      nonImageSummaries.push(
        `${name} (${mime}, ~${Math.round((att.size || 0) / 1024)} KB)`
      );
    }
  });

  if (nonImageSummaries.length > 0) {
    userContentParts.push({
      type: "text",
      text:
        "The user also uploaded these non-image files (you cannot read their contents directly; treat them conceptually):\n" +
        nonImageSummaries.map(x => "- " + x).join("\n"),
    });
  }

  messages.push({
    role: "user",
    content: userContentParts,
  });

  try {
    // ---------- Call Chat Completions (stable, supports vision) ----------
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.7,
      max_tokens: 900,
    });

    let reply =
      "I’m not sure what to say yet. Try asking again with a bit more detail.";

    if (
      completion &&
      completion.choices &&
      completion.choices[0] &&
      completion.choices[0].message &&
      typeof completion.choices[0].message.content === "string"
    ) {
      reply = completion.choices[0].message.content.trim();
    }

    const files = buildExports(history, userMessage, reply);

    return res.status(200).json({ reply, files });
  } catch (err) {
    console.error("Exerbud AI backend error:", err);
    return res.status(500).json({
      error: "Exerbud backend failed.",
      // always send message so you can see it in Network tab
      details: String(err.message || err),
    });
  }
};

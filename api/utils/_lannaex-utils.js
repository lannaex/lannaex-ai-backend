// api/utils/_lannaex-utils.js
// Shared helpers for all Lannaex / Exerbud AI endpoints (CommonJS version)

const OpenAI = require("openai");

// Create OpenAI client
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// -----------------------------
// Helpers for attachments
// -----------------------------

// Decide if a file is "text-like" and safe to decode as UTF-8
function isTextLikeMime(type) {
  if (!type) return false;
  const lower = type.toLowerCase();
  return (
    lower.startsWith("text/") ||
    lower.includes("json") ||
    lower.includes("csv") ||
    lower.includes("xml") ||
    lower.includes("markdown") ||
    lower.includes("md")
  );
}

// Decode base64 -> UTF-8 text
function base64ToText(b64) {
  try {
    const buf = Buffer.from(b64, "base64");
    return buf.toString("utf8");
  } catch (e) {
    console.warn("Failed to decode base64 attachment:", e);
    return null;
  }
}

/**
 * Store a single attachment in Vercel Blob.
 * attachment shape (from frontend):
 *  { id, name, type, size, data (base64) }
 */
async function storeAttachment(attachment) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.warn("BLOB_READ_WRITE_TOKEN not set; skipping Blob storage.");
    return null;
  }

  // dynamic import so CommonJS can use @vercel/blob (which is ESM)
  const { put } = await import("@vercel/blob");

  const buffer = Buffer.from(attachment.data, "base64");
  const safeName = attachment.name.replace(/[^\w.\-]/g, "_");
  const blobName = `uploads/${Date.now()}-${safeName}`;

  const blob = await put(blobName, buffer, {
    access: "public",
    token: process.env.BLOB_READ_WRITE_TOKEN,
    contentType: attachment.type || "application/octet-stream",
  });

  return {
    url: blob.url,
    name: attachment.name,
    label: `Download ${attachment.name}`,
  };
}

/**
 * Process an array of attachments:
 * - store them in Blob
 * - build a text context for OpenAI
 * Returns:
 *  { attachmentContext: string, storedFileLinks: [{url,name,label}] }
 */
async function processAttachments(attachments = []) {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return { attachmentContext: "", storedFileLinks: [] };
  }

  const contextParts = [];
  const storedFileLinks = [];

  for (const att of attachments) {
    if (!att || !att.name || !att.data) continue;

    // 1) Store file in Vercel Blob
    try {
      const stored = await storeAttachment(att);
      if (stored) storedFileLinks.push(stored);
    } catch (err) {
      console.error("Error storing attachment:", err);
    }

    // 2) Build AI-readable context
    const metaLine = `File: ${att.name} (${att.type || "unknown type"}, ${
      att.size || "unknown"
    } bytes)`;

    if (isTextLikeMime(att.type)) {
      const text = base64ToText(att.data);
      if (text) {
        const snippet =
          text.length > 6000 ? text.slice(0, 6000) + "\n...[truncated]..." : text;
        contextParts.push(`${metaLine}\nContent snippet:\n${snippet}\n`);
        continue;
      }
    }

    // Non-text or undecodable file: just show metadata
    contextParts.push(
      `${metaLine}\n(Content not directly readable; respond at a higher level based on description.)`
    );
  }

  const attachmentContext =
    contextParts.length > 0
      ? `The user uploaded the following files. Use them when helpful:\n\n${contextParts.join(
          "\n"
        )}`
      : "";

  return { attachmentContext, storedFileLinks };
}

// -----------------------------
// BUSINESS AI system prompt
// (we can add other prompts for Travel, Fitness, etc. later)
// -----------------------------
function buildBusinessSystemPrompt() {
  return `
You are Lannaex Business AI, a focused strategy and operations advisor.

You help the user think through:
- their business model, client offers, pricing, positioning, and systems
- practical next steps, not generic fluff
- clear, structured answers tailored to solo founders and small teams

Rules:
- Stay in the BUSINESS domain (offers, pricing, marketing, operations, systems, strategy).
- If the user asks about fitness, fashion, travel, wellness, or property,
  gently redirect and suggest which Lannaex AI they should use instead.
- Prefer concrete recommendations (lists, frameworks, step-by-step plans).
- When working from uploaded files, clearly reference which file you're using
  (by filename) and explain how you're interpreting it.
- If uploaded content looks truncated or unclear, say so instead of guessing.
  `;
}

// -----------------------------
// Core chat runner (reused by all AIs)
// -----------------------------
async function runLannaexChat({
  userMessage,
  history = [],
  attachments = [],
  systemPrompt,
}) {
  // 1) Pre-process attachments
  const { attachmentContext, storedFileLinks } = await processAttachments(
    attachments
  );

  // 2) Build messages for OpenAI
  const messages = [];

  messages.push({
    role: "system",
    content: systemPrompt || "You are a helpful assistant.",
  });

  if (attachmentContext) {
    messages.push({
      rol

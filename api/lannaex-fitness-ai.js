// /api/lannaex-fitness-ai.js

import OpenAI from "openai";
import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const { message } = await req.json();

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const fitnessPrompt = `
You are Lannaex Fitness AI.
You ONLY answer questions about:

• workouts  
• strength training  
• fat loss  
• muscle gain  
• exercise form  
• routines & programs  
• flexibility, mobility  
• recovery, soreness  
• nutrition for fitness  
• energy, sleep, consistency  
• fitness for beginners  
• age-specific fitness (40+, 50+, etc.)

You **MUST NOT** answer anything outside fitness.
If the user asks about business, travel, style, property, life management, relationships, money, or anything non-fitness, reply:

"I'm here only for fitness, training, nutrition, and energy. Try asking me a fitness-related question."


Now answer the user’s message in a clear, supportive, simple, and grounded tone.

User message:
${message}
`;

    const completion = await client.responses.create({
      model: "gpt-4.1",
      input: fitnessPrompt,
    });

    const reply =
      completion.output_text ||
      "I'm here to help with your fitness and training questions.";

    return NextResponse.json({ reply });
  } catch (error) {
    console.error("Fitness AI error:", error);
    return NextResponse.json(
      { reply: "Error: Something went wrong on the fitness server." },
      { status: 500 }
    );
  }
}

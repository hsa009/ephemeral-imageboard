/* eslint-disable @typescript-eslint/no-explicit-any */
import OpenAI from 'openai';

interface ClassificationResult {
  niche: string;
  rawResponse?: string;
  reasoning?: string;
  fullOutput?: string;
}

const VALID_NICHES = ['tech', 'gaming', 'finance', 'politics', 'random'];

export async function classifyNiche(subject: string, comment: string): Promise<ClassificationResult> {
  const defaultResult: ClassificationResult = { niche: 'random' };
  const apiKey = process.env.GITHUB_TOKEN;

  if (!apiKey) {
    console.error("[GHOST BRAIN] ❌ NO API KEY FOUND — GITHUB_TOKEN not set. Defaulting to 'random'.");
    return defaultResult;
  }

  console.log("[GHOST BRAIN] ✅ GITHUB_TOKEN loaded:", apiKey.substring(0, 8) + "...");
  console.log("[GHOST BRAIN] 📥 Input — Subject:", JSON.stringify(subject), "Comment:", JSON.stringify(comment.substring(0, 100)));

  try {
    const client = new OpenAI({
      baseURL: 'https://models.inference.ai.azure.com',
      apiKey,
    });

    const model = 'gpt-4o-mini';
    console.log("[GHOST BRAIN] 🔌 Connecting to GitHub Models API (" + model + ")...");

    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: "You are a classification bot for an anonymous imageboard.\nCRITICAL OVERRIDE: If the text mentions Trump, Hitler, Biden, Harris, elections, or war -> output: politics\nTASK: Output EXACTLY ONE lowercase word from this list: [tech, gaming, finance, politics, random].\nNO punctuation. NO reasoning. NO extra text."
        },
        {
          role: 'user',
          content: "Subject: " + subject + "\nComment: " + comment
        }
      ],
      max_tokens: 5,
      temperature: 0,
    });

    console.log("[GHOST BRAIN] ✅ API connection successful. Response received.");
    console.log("[GHOST BRAIN] 🔍 Full response object:", JSON.stringify(response, null, 2));

    const choice = response.choices?.[0];
    console.log("[GHOST BRAIN] 🔍 Choice[0]:", JSON.stringify(choice, null, 2));

    const rawContent = choice?.message?.content;
    console.log("[GHOST BRAIN] 🔍 Raw content type:", typeof rawContent, "| Value:", JSON.stringify(rawContent));

    if (rawContent === null || rawContent === undefined) {
      console.error("[GHOST BRAIN] ❌ Content is null/undefined. Finish reason:", choice?.finish_reason, "| Defaulting to 'random'.");
      return { niche: 'random', rawResponse: String(rawContent), fullOutput: String(rawContent) };
    }

    if (typeof rawContent !== 'string') {
      console.error("[GHOST BRAIN] ❌ Content is not a string, it's:", typeof rawContent, "| Value:", JSON.stringify(rawContent));
      return { niche: 'random', rawResponse: String(rawContent), fullOutput: String(rawContent) };
    }

    const rawOutput = rawContent;
    const finalNiche = rawOutput.toLowerCase().trim().split(' ')[0].replace(/[^a-z]/g, "");
    const niche = VALID_NICHES.includes(finalNiche) ? finalNiche : 'random';

    console.log("[GHOST BRAIN] 🧠 Extraction steps:");
    console.log("[GHOST BRAIN]    rawOutput:", JSON.stringify(rawOutput));
    console.log("[GHOST BRAIN]    toLowerCase+trim+split[0]:", JSON.stringify(rawOutput.toLowerCase().trim().split(' ')[0]));
    console.log("[GHOST BRAIN]    after regex:", JSON.stringify(finalNiche));
    console.log("[GHOST BRAIN]    isValid:", VALID_NICHES.includes(finalNiche), "| Final niche:", niche);

    return {
      niche,
      rawResponse: rawOutput,
      fullOutput: rawOutput
    };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[GHOST BRAIN] ❌ API call FAILED:", errorMsg);
    if (error instanceof Error && 'status' in error) {
      console.error("[GHOST BRAIN] ❌ HTTP Status:", (error as any).status);
    }
    console.error("[GHOST BRAIN] ❌ Defaulting to 'random'.");
    return defaultResult;
  }
}

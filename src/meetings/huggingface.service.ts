import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface MeetingSummaryResult {
  overview: string;
  decisions: string[];
  actionItems: { description: string; owner: string | null; dueDate: string | null }[];
}

const SYSTEM_PROMPT = `You summarize client meeting transcripts for an agency. Respond ONLY with valid JSON — no markdown fences, no preamble, no explanation — matching exactly this shape:
{
  "overview": "2-4 sentence summary of what was discussed",
  "decisions": ["decision 1", "decision 2"],
  "actionItems": [{ "description": "...", "owner": "name or null", "dueDate": "YYYY-MM-DD or null" }]
}`;

// Free-tier model served via Hugging Face's routed inference — good
// instruction-following for a task like this. Swap the model string if you
// hit rate limits or want better quality; the router auto-picks a backing
// provider for whichever model you name.
const MODEL = 'meta-llama/Llama-3.1-8B-Instruct';

@Injectable()
export class HuggingFaceService {
  private readonly logger = new Logger(HuggingFaceService.name);

  constructor(private config: ConfigService) {}

  async summarizeTranscript(transcript: string): Promise<MeetingSummaryResult> {
    const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.get<string>('HF_API_TOKEN')}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        temperature: 0.2, // low temperature — this is a structured-extraction task, not creative writing
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: transcript },
        ],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(`Hugging Face API error ${response.status}: ${errorBody}`);
      // Free-tier inference endpoints can return 503 while a model cold-starts —
      // worth a single retry in production rather than failing immediately.
      throw new Error(`Summarization failed: ${response.status}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content ?? '';

    try {
      const cleaned = text.replace(/```json|```/g, '').trim();
      return JSON.parse(cleaned);
    } catch {
      this.logger.error(`Could not parse model output as JSON: ${text.slice(0, 200)}`);
      throw new Error('Model did not return valid JSON');
    }
  }
}

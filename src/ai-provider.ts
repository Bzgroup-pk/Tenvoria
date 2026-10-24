/**
 * Stable provider contract. Real provider adapters belong on the server,
 * where API keys can be kept out of browser bundles.
 */
export type Capability = 'text' | 'reasoning' | 'image' | 'video' | 'speech' | 'tool-use';

export type AIRequest = {
  taskId: string;
  capability: Capability;
  prompt: string;
  maxOutputTokens?: number;
  metadata?: Record<string, string>;
};

export type AIResponse = {
  providerId: string;
  output: string;
  usage?: { inputTokens?: number; outputTokens?: number };
  estimatedCostEUR: number;
  demo: boolean;
};

export interface AIProvider {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: readonly Capability[];
  generate(request: AIRequest): Promise<AIResponse>;
}

/** Safe local demo: it never calls an external model or spends money. */
export class DemoTextProvider implements AIProvider {
  readonly id = 'demo-text';
  readonly displayName = 'Demo Text Provider';
  readonly capabilities = ['text'] as const;

  async generate(request: AIRequest): Promise<AIResponse> {
    if (!request.prompt.trim()) throw new Error('A non-empty prompt is required.');
    return {
      providerId: this.id,
      output: `DEMO OUTPUT — no external AI was called.\n\nTask: ${request.taskId}\n\nPrompt received: ${request.prompt}\n\nNext step: connect a server-side provider adapter to generate a real result.`,
      estimatedCostEUR: 0,
      demo: true,
    };
  }
}

/**
 * Future adapters should implement AIProvider on the server. The orchestrator
 * should select providers by capability, policy, availability and approved budget.
 */

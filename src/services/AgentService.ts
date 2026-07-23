import { callApi, ApiConfig, ChatMessage } from './ApiService';

export interface AgentStep {
    step: number;
    title: string;
    description: string;
    prompt: string;
}

export interface AgentPlan {
    goal: string;
    steps: AgentStep[];
}

const PLANNER_SYSTEM_PROMPT = `You are a planning AI. When given a task, you must respond ONLY with a valid JSON object in this exact format:
{
  "goal": "Brief description of the overall goal",
  "steps": [
    {
      "step": 1,
      "title": "Short title",
      "description": "What this step does",
      "prompt": "The exact prompt to send to the executor for this step"
    }
  ]
}
Break the task into 2-5 clear, actionable steps. Each step's prompt must be self-contained and include all necessary context.`;

export async function generatePlan(
    task: string,
    plannerConfig: ApiConfig,
    history: ChatMessage[]
): Promise<AgentPlan | string> {
    const messages: ChatMessage[] = [
        { role: 'system', content: PLANNER_SYSTEM_PROMPT },
        ...history.slice(-4), // Last 2 exchanges for context
        { role: 'user', content: `Task: ${task}` }
    ];

    const response = await callApi(plannerConfig, messages);

    // Extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        return `❌ Planner returned invalid response: ${response.substring(0, 200)}`;
    }

    try {
        const plan = JSON.parse(jsonMatch[0]) as AgentPlan;
        if (!plan.steps || !Array.isArray(plan.steps)) {
            return '❌ Invalid plan structure from planner.';
        }
        return plan;
    } catch (e: any) {
        return `❌ Failed to parse plan: ${e.message}`;
    }
}

export async function executeStep(
    step: AgentStep,
    executorConfig: ApiConfig,
    history: ChatMessage[]
): Promise<string> {
    const messages: ChatMessage[] = [
        {
            role: 'system',
            content: 'You are an expert coding assistant. Execute the given task precisely and provide detailed, actionable results.'
        },
        ...history.slice(-4),
        { role: 'user', content: step.prompt }
    ];

    return await callApi(executorConfig, messages);
}

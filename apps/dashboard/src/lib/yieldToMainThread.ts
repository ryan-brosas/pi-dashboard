export const MAIN_THREAD_BUDGET_MS = 8;

export async function yieldToMainThread(): Promise<void> {
  // Ordinary tasks let pending input and timers run between import chunks.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

export interface SkillTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(args: Record<string, unknown>, sessionId?: string): Promise<string> | string;
  logBlocklist?: boolean; // true = never log args/result
  rateLimit?: number; // calls per hour
}

export interface Skill {
  name: string;
  version: string;
  description: string;
  tools: SkillTool[];
  onInit?(): Promise<void>; // optional setup on load
}

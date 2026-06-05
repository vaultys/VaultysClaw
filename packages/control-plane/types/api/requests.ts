export type TokenUsageQuery = {
  granularity?: "day" | "month";
  from?: string;
  to?: string;
};

export type AgentSchedule = {
  id: string;
  name: string;
  cron: string;
  action: string;
  params?: Record<string, unknown>;
  enabled?: boolean;
};

export type AgentTask = {
  action?: string;
  params?: Record<string, unknown>;
};

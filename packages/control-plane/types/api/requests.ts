export type AgentSchedule = {
  id: string;
  name: string;
  cron: string;
  action: string;
  params?: Record<string, unknown>;
  enabled?: boolean;
};

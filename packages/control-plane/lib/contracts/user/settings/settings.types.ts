export interface OtelConfig {
  enabled: boolean;
  baseUrl: string;
  serviceName: string;
  connected: boolean;
  fromEnv: {
    enabled: boolean;
    baseUrl: boolean;
    serviceName: boolean;
  };
}

export interface HealthCheckResponse {
  status: string;
  timestamp: string;
  uptime: number;
}

export interface ReadinessCheckResponse {
  status: string;
  database: string;
  timestamp: string;
}

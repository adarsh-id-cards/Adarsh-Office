/**
 * Centralized environment variable configuration.
 * Never hardcode backend URLs throughout the application.
 */

interface AppEnvConfig {
  apiBaseUrl: string;
  appName: string;
  companyName: string;
}

const rawApiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) || "/api/v1";

export const envConfig: AppEnvConfig = {
  apiBaseUrl: rawApiBase.replace(/\/+$/, ""),
  appName: (import.meta.env.VITE_APP_NAME as string | undefined) || "Pro Office",
  companyName: (import.meta.env.VITE_APP_COMPANY as string | undefined) || "Adarsh ID Cards",
};

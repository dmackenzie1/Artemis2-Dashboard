type LogContext = Record<string, unknown>;

const formatPayload = (level: "INFO" | "WARN" | "ERROR", message: string, context?: LogContext): string => {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(context ? { context } : {})
  });
};

export const clientLogger = {
  info: (message: string, context?: LogContext): void => {
    console.info(formatPayload("INFO", message, context));
  },
  warn: (message: string, context?: LogContext): void => {
    console.warn(formatPayload("WARN", message, context));
  },
  error: (message: string, context?: LogContext): void => {
    console.error(formatPayload("ERROR", message, context));
  }
};

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";

dayjs.extend(utc);

type LogContext = Record<string, unknown>;

const formatPayload = (level: "INFO" | "WARN" | "ERROR", message: string, context?: LogContext): string => {
  return JSON.stringify({
    timestamp: dayjs().utc().format("YYYY-MM-DDTHH:mm:ss[Z]"),
    level,
    message,
    ...(context ? { context } : {})
  });
};

export const serverLogger = {
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

import pino, {
  type DestinationStream,
  type Logger,
  type LoggerOptions,
} from "pino";

export function createLogger(destination?: DestinationStream): Logger {
  const options: LoggerOptions = {
    level: process.env["LOG_LEVEL"] ?? "info",
  };
  if (destination) {
    return pino(options, destination);
  }
  if (process.env.NODE_ENV === "development") {
    return pino({ ...options, transport: { target: "pino-pretty" } });
  }
  return pino(options);
}

export const logger: Logger = createLogger();

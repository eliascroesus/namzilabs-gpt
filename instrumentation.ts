import * as Sentry from "@sentry/nextjs";

import { redactSensitive } from "@/lib/redaction";
import { assertProductionEnvironment } from "@/lib/env";

export async function register() {
  assertProductionEnvironment();
  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      sendDefaultPii: false,
      tracesSampleRate: process.env.APP_ENV === "production" ? 0.1 : 1,
      beforeSend(event) {
        return redactSensitive(event) as typeof event;
      },
    });
  }
}

export const onRequestError = Sentry.captureRequestError;

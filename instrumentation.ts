import { assertProductionEnvironment } from "@/lib/env";

export async function register() {
  assertProductionEnvironment();
}

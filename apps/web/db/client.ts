import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL 环境变量未设置");
}

const queryClient = postgres(databaseUrl, { max: 10 });
export const db = drizzle(queryClient, { schema });
export { schema };

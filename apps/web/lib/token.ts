import { randomBytes } from "node:crypto";

export function generateProjectToken(): string {
  return randomBytes(24).toString("base64url");
}

import { Prisma } from "@prisma/client";

export function entryData(value: Prisma.JsonValue): Prisma.JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
export function textValue(value: Prisma.JsonValue | undefined): string {
  return typeof value === "string" ? value : "";
}
export function textValues(value: Prisma.JsonValue | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

import { z } from "zod";
import { priorityEnum, statusEnum } from "@/db/schema";

/**
 * Validation for the shared status and priority columns, built from the
 * database enums themselves so a new value only has to be added in one place
 * (plus its label in lib/fields.ts). Server-only: it pulls in the schema.
 */
export const statusSchema = z.enum(statusEnum.enumValues);
export const prioritySchema = z.enum(priorityEnum.enumValues);

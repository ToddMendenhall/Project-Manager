import type { CustomFieldDef } from "@/db/schema";

/** Form field `name` attribute for a given custom field def. */
export function customFieldName(key: string) {
  return `cf_${key}`;
}

/**
 * Reads a task's custom field values out of submitted FormData, coercing
 * each per its definition's fieldType. Fields not present in `defs` are
 * ignored — the set of valid custom fields is entirely defined by what the
 * program has configured, never hardcoded.
 */
export function parseCustomFieldValues(
  defs: CustomFieldDef[],
  formData: FormData,
): Record<string, string | number | boolean | null> {
  const values: Record<string, string | number | boolean | null> = {};

  for (const def of defs) {
    const raw = formData.get(customFieldName(def.key));

    if (def.fieldType === "boolean") {
      values[def.key] = raw === "on" || raw === "true";
      continue;
    }

    if (raw === null || raw === "") {
      values[def.key] = null;
      continue;
    }

    if (def.fieldType === "number") {
      const num = Number(raw);
      values[def.key] = Number.isFinite(num) ? num : null;
    } else {
      // text, date, select all store as plain strings
      values[def.key] = String(raw);
    }
  }

  return values;
}

export function customFieldOptions(def: CustomFieldDef): string[] {
  if (Array.isArray(def.options)) {
    return def.options.filter((o): o is string => typeof o === "string");
  }
  return [];
}

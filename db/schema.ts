import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  pgEnum,
  jsonb,
  integer,
  uniqueIndex,
  index,
  check,
  customType,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

/**
 * Generic Program -> Project -> Task hierarchy.
 * Intentionally free of any industry-specific fields — per-org/per-program
 * variation (inspection types, custom attributes, etc.) is handled entirely
 * through customFieldDefs + the tasks.customFields jsonb column, never by
 * adding columns here.
 */

/**
 * Attachment bytes live directly in Postgres (bytea) rather than an
 * external object store — phase 1 keeps the app self-contained with no
 * extra cloud storage account to provision. Capped at a few MB per file
 * (enforced at the upload route); a later phase can swap this for S3 /
 * Vercel Blob without changing anything else about the attachments table.
 */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const memberRoleEnum = pgEnum("member_role", ["admin", "member"]);
export const statusEnum = pgEnum("status", [
  "not_started",
  "in_progress",
  "blocked",
  "completed",
  "cancelled",
]);
export const priorityEnum = pgEnum("priority", ["low", "medium", "high", "urgent"]);
export const fieldTypeEnum = pgEnum("field_type", ["text", "number", "date", "boolean", "select"]);
export const customFieldEntityEnum = pgEnum("custom_field_entity", ["program", "project", "task"]);
export const activityEntityEnum = pgEnum("activity_entity", ["program", "project", "task"]);
export const activityActionEnum = pgEnum("activity_action", [
  "created",
  "updated",
  "deleted",
  "commented",
]);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orgMembers = pgTable(
  "org_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgUserUnique: uniqueIndex("org_members_org_user_unique").on(table.orgId, table.userId),
  }),
);

/**
 * Optional grouping above Program — a portfolio can contain multiple
 * programs, but a program doesn't need one (portfolioId is nullable).
 * Deleting a portfolio un-groups its programs (set null) rather than
 * deleting them; portfolios are organizational grouping, not ownership
 * of the work underneath.
 */
export const portfolios = pgTable(
  "portfolios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    status: statusEnum("status").notNull().default("not_started"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    startDate: timestamp("start_date", { withTimezone: true, mode: "date" }),
    targetEndDate: timestamp("target_end_date", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index("portfolios_org_idx").on(table.orgId),
  }),
);

export const programs = pgTable(
  "programs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    portfolioId: uuid("portfolio_id").references(() => portfolios.id, { onDelete: "set null" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    status: statusEnum("status").notNull().default("not_started"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    startDate: timestamp("start_date", { withTimezone: true, mode: "date" }),
    targetEndDate: timestamp("target_end_date", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index("programs_org_idx").on(table.orgId),
    portfolioIdx: index("programs_portfolio_idx").on(table.portfolioId),
  }),
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    status: statusEnum("status").notNull().default("not_started"),
    priority: priorityEnum("priority").notNull().default("medium"),
    leadId: uuid("lead_id").references(() => users.id, { onDelete: "set null" }),
    startDate: timestamp("start_date", { withTimezone: true, mode: "date" }),
    dueDate: timestamp("due_date", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    programIdx: index("projects_program_idx").on(table.programId),
  }),
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    parentTaskId: uuid("parent_task_id").references((): AnyPgColumn => tasks.id, {
      onDelete: "set null",
    }),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    status: statusEnum("status").notNull().default("not_started"),
    priority: priorityEnum("priority").notNull().default("medium"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    dueDate: timestamp("due_date", { withTimezone: true, mode: "date" }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    // Per-program custom attributes (e.g. whatever fields a given program
    // defines via customFieldDefs below) live here, keyed by field `key`.
    customFields: jsonb("custom_fields").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    projectIdx: index("tasks_project_idx").on(table.projectId),
    parentIdx: index("tasks_parent_idx").on(table.parentTaskId),
  }),
);

/**
 * A checklist within a task — each line item carries the same fields as a
 * task itself (assignee, priority, due date, comments, attachments) rather
 * than being a plain checkbox, so it can be assigned and tracked on its own.
 * Checking the box just sets status to "completed" (see toggleChecklistItem);
 * the full status/priority/assignee/due date remain editable on the item's
 * own detail page.
 */
export const checklistItems = pgTable(
  "checklist_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    status: statusEnum("status").notNull().default("not_started"),
    priority: priorityEnum("priority").notNull().default("medium"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    dueDate: timestamp("due_date", { withTimezone: true, mode: "date" }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    taskIdx: index("checklist_items_task_idx").on(table.taskId),
  }),
);

export const customFieldDefs = pgTable(
  "custom_field_defs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    entityType: customFieldEntityEnum("entity_type").notNull().default("task"),
    key: varchar("key", { length: 100 }).notNull(),
    label: varchar("label", { length: 255 }).notNull(),
    fieldType: fieldTypeEnum("field_type").notNull(),
    options: jsonb("options"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    programKeyUnique: uniqueIndex("custom_field_defs_program_key_unique").on(
      table.programId,
      table.entityType,
      table.key,
    ),
  }),
);

// Comments and attachments can belong to either a task or a checklist item
// (never both, never neither) — taskId/checklistItemId are both nullable,
// with a check constraint enforcing exactly one parent is set.
export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    checklistItemId: uuid("checklist_item_id").references(() => checklistItems.id, {
      onDelete: "cascade",
    }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    taskIdx: index("comments_task_idx").on(table.taskId),
    checklistItemIdx: index("comments_checklist_item_idx").on(table.checklistItemId),
    exactlyOneParent: check(
      "comments_exactly_one_parent",
      sql`(${table.taskId} is not null) <> (${table.checklistItemId} is not null)`,
    ),
  }),
);

export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    checklistItemId: uuid("checklist_item_id").references(() => checklistItems.id, {
      onDelete: "cascade",
    }),
    uploadedById: uuid("uploaded_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    data: bytea("data").notNull(),
    contentType: varchar("content_type", { length: 100 }),
    sizeBytes: integer("size_bytes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    taskIdx: index("attachments_task_idx").on(table.taskId),
    checklistItemIdx: index("attachments_checklist_item_idx").on(table.checklistItemId),
    exactlyOneParent: check(
      "attachments_exactly_one_parent",
      sql`(${table.taskId} is not null) <> (${table.checklistItemId} is not null)`,
    ),
  }),
);

export const activityLog = pgTable(
  "activity_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    entityType: activityEntityEnum("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: activityActionEnum("action").notNull(),
    field: varchar("field", { length: 100 }),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    entityIdx: index("activity_log_entity_idx").on(table.entityType, table.entityId),
    orgIdx: index("activity_log_org_idx").on(table.orgId),
  }),
);

export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(orgMembers),
  portfolios: many(portfolios),
  programs: many(programs),
}));

export const portfoliosRelations = relations(portfolios, ({ one, many }) => ({
  organization: one(organizations, { fields: [portfolios.orgId], references: [organizations.id] }),
  owner: one(users, { fields: [portfolios.ownerId], references: [users.id] }),
  programs: many(programs),
}));

export const usersRelations = relations(users, ({ many }) => ({
  orgMemberships: many(orgMembers),
}));

export const orgMembersRelations = relations(orgMembers, ({ one }) => ({
  organization: one(organizations, { fields: [orgMembers.orgId], references: [organizations.id] }),
  user: one(users, { fields: [orgMembers.userId], references: [users.id] }),
}));

export const programsRelations = relations(programs, ({ one, many }) => ({
  organization: one(organizations, { fields: [programs.orgId], references: [organizations.id] }),
  portfolio: one(portfolios, { fields: [programs.portfolioId], references: [portfolios.id] }),
  owner: one(users, { fields: [programs.ownerId], references: [users.id] }),
  projects: many(projects),
  customFieldDefs: many(customFieldDefs),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  program: one(programs, { fields: [projects.programId], references: [programs.id] }),
  lead: one(users, { fields: [projects.leadId], references: [users.id] }),
  tasks: many(tasks),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  project: one(projects, { fields: [tasks.projectId], references: [projects.id] }),
  assignee: one(users, { fields: [tasks.assigneeId], references: [users.id] }),
  parentTask: one(tasks, {
    fields: [tasks.parentTaskId],
    references: [tasks.id],
    relationName: "subtasks",
  }),
  subtasks: many(tasks, { relationName: "subtasks" }),
  checklistItems: many(checklistItems),
  comments: many(comments),
  attachments: many(attachments),
}));

export const checklistItemsRelations = relations(checklistItems, ({ one, many }) => ({
  task: one(tasks, { fields: [checklistItems.taskId], references: [tasks.id] }),
  assignee: one(users, { fields: [checklistItems.assigneeId], references: [users.id] }),
  comments: many(comments),
  attachments: many(attachments),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  task: one(tasks, { fields: [comments.taskId], references: [tasks.id] }),
  checklistItem: one(checklistItems, {
    fields: [comments.checklistItemId],
    references: [checklistItems.id],
  }),
  author: one(users, { fields: [comments.authorId], references: [users.id] }),
}));

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  task: one(tasks, { fields: [attachments.taskId], references: [tasks.id] }),
  checklistItem: one(checklistItems, {
    fields: [attachments.checklistItemId],
    references: [checklistItems.id],
  }),
  uploadedBy: one(users, { fields: [attachments.uploadedById], references: [users.id] }),
}));

export const customFieldDefsRelations = relations(customFieldDefs, ({ one }) => ({
  program: one(programs, { fields: [customFieldDefs.programId], references: [programs.id] }),
}));

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type Portfolio = typeof portfolios.$inferSelect;
export type NewPortfolio = typeof portfolios.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type OrgMember = typeof orgMembers.$inferSelect;
export type Program = typeof programs.$inferSelect;
export type NewProgram = typeof programs.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type ChecklistItem = typeof checklistItems.$inferSelect;
export type NewChecklistItem = typeof checklistItems.$inferInsert;
export type CustomFieldDef = typeof customFieldDefs.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type ActivityLogEntry = typeof activityLog.$inferSelect;

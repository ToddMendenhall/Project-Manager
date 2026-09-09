import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import bcrypt from "bcryptjs";
import * as schema from "./schema";

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  const client = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
  const db = drizzle(client, { schema });

  console.log("Seeding sample data...");

  const [org] = await db
    .insert(schema.organizations)
    .values({ name: "Sample Organization", slug: "sample-org" })
    .returning();

  const passwordHash = await bcrypt.hash("password123", 10);
  const [user] = await db
    .insert(schema.users)
    .values({ email: "admin@example.com", name: "Sample Admin", passwordHash })
    .returning();

  await db.insert(schema.orgMembers).values({
    orgId: org.id,
    userId: user.id,
    role: "admin",
  });

  const [program] = await db
    .insert(schema.programs)
    .values({
      orgId: org.id,
      name: "Sample Program",
      description: "An example program to show the Program -> Project -> Task hierarchy.",
      status: "in_progress",
      ownerId: user.id,
    })
    .returning();

  await db.insert(schema.customFieldDefs).values([
    {
      programId: program.id,
      entityType: "task",
      key: "external_ref",
      label: "External Reference",
      fieldType: "text",
      sortOrder: 0,
    },
    {
      programId: program.id,
      entityType: "task",
      key: "estimated_hours",
      label: "Estimated Hours",
      fieldType: "number",
      sortOrder: 1,
    },
  ]);

  const [project] = await db
    .insert(schema.projects)
    .values({
      programId: program.id,
      name: "Sample Project",
      description: "An example project under the sample program.",
      status: "in_progress",
      priority: "medium",
      leadId: user.id,
    })
    .returning();

  const [task] = await db
    .insert(schema.tasks)
    .values({
      projectId: project.id,
      title: "Sample Task",
      description: "An example task with a custom field value set.",
      status: "not_started",
      priority: "medium",
      assigneeId: user.id,
      customFields: { external_ref: "REF-001", estimated_hours: 4 },
    })
    .returning();

  await db.insert(schema.comments).values({
    taskId: task.id,
    authorId: user.id,
    body: "This is a sample comment on the sample task.",
  });

  console.log("Seed complete.");
  console.log(`  Org:     ${org.name} (${org.slug})`);
  console.log(`  Login:   admin@example.com / password123`);
  console.log(`  Program: ${program.name}`);
  console.log(`  Project: ${project.name}`);
  console.log(`  Task:    ${task.title}`);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

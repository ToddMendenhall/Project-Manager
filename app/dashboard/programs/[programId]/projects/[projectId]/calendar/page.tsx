import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { projects, tasks } from "@/db/schema";
import type { Task } from "@/db/schema";
import { requireOrgContext } from "@/lib/org";
import { ViewTabs } from "@/components/tasks/view-tabs";
import { dateKey, getMonthGridDays, parseMonthParam, toMonthParam, WEEKDAY_LABELS } from "@/lib/calendar";

export default async function TaskCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ programId: string; projectId: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { programId, projectId } = await params;
  const sp = await searchParams;
  await requireOrgContext();

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.programId, programId)),
  });
  if (!project) notFound();

  const { year, monthIndex0 } = parseMonthParam(sp.month);
  const gridDays = getMonthGridDays(year, monthIndex0);

  const allTasks = await db.query.tasks.findMany({
    where: eq(tasks.projectId, projectId),
    orderBy: (task, { asc }) => [asc(task.dueDate)],
  });

  const tasksByDay = new Map<string, Task[]>();
  const undated: Task[] = [];
  for (const task of allTasks) {
    if (!task.dueDate) {
      undated.push(task);
      continue;
    }
    const key = dateKey(new Date(task.dueDate));
    tasksByDay.set(key, [...(tasksByDay.get(key) ?? []), task]);
  }

  const basePath = `/dashboard/programs/${programId}/projects/${projectId}`;
  const monthLabel = new Date(year, monthIndex0, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const prevMonthParam = toMonthParam(new Date(year, monthIndex0 - 1, 1));
  const nextMonthParam = toMonthParam(new Date(year, monthIndex0 + 1, 1));
  const todayKey = dateKey(new Date());

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={basePath} className="text-sm text-gray-500 underline">
          &larr; {project.name}
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Tasks</h1>
        <Link href={`${basePath}/tasks/new`} className="rounded bg-gray-900 px-4 py-2 text-sm text-white">
          New Task
        </Link>
      </div>

      <ViewTabs basePath={basePath} active="calendar" />

      <div className="flex items-center justify-between">
        <Link href={`${basePath}/calendar?month=${prevMonthParam}`} className="text-sm underline">
          &larr; Prev
        </Link>
        <p className="text-sm font-semibold">{monthLabel}</p>
        <Link href={`${basePath}/calendar?month=${nextMonthParam}`} className="text-sm underline">
          Next &rarr;
        </Link>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded border border-gray-200 bg-gray-200 text-xs">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="bg-gray-50 px-2 py-1 text-center font-medium text-gray-500">
            {label}
          </div>
        ))}
        {gridDays.map((day) => {
          const key = dateKey(day);
          const dayTasks = tasksByDay.get(key) ?? [];
          const inMonth = day.getMonth() === monthIndex0;
          const isToday = key === todayKey;

          return (
            <div
              key={key}
              className={`min-h-[100px] bg-white p-1 ${inMonth ? "" : "bg-gray-50"} ${
                isToday ? "ring-2 ring-inset ring-gray-900" : ""
              }`}
            >
              <p className={`mb-1 text-right text-xs ${inMonth ? "text-gray-600" : "text-gray-400"}`}>
                {day.getDate()}
              </p>
              <div className="flex flex-col gap-1">
                {dayTasks.slice(0, 3).map((task) => (
                  <Link
                    key={task.id}
                    href={`${basePath}/tasks/${task.id}`}
                    className="block truncate rounded bg-gray-100 px-1 py-0.5 text-xs hover:bg-gray-200"
                    title={task.title}
                  >
                    {task.title}
                  </Link>
                ))}
                {dayTasks.length > 3 && (
                  <p className="text-xs text-gray-400">+{dayTasks.length - 3} more</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {undated.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-gray-500">No due date ({undated.length})</h2>
          <ul className="flex flex-col gap-1">
            {undated.map((task) => (
              <li key={task.id}>
                <Link href={`${basePath}/tasks/${task.id}`} className="text-sm hover:underline">
                  {task.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

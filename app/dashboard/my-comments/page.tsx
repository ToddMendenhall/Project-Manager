import Link from "next/link";
import { requireOrgContext } from "@/lib/org";
import { getCommentsOnMyTasks } from "@/lib/queries";

export default async function AssignedCommentsPage() {
  const ctx = await requireOrgContext();
  const commentsOnMyTasks = await getCommentsOnMyTasks(ctx.user.id, ctx.org.id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Assigned Comments</h1>
        <p className="mt-1 text-sm text-gray-500">Recent comments on tasks assigned to you.</p>
      </div>

      {commentsOnMyTasks.length === 0 ? (
        <p className="text-sm text-gray-500">No comments yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {commentsOnMyTasks.map((comment) => (
            <li key={comment.id} className="rounded border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between gap-4">
                <Link
                  href={`/dashboard/programs/${comment.programId}/projects/${comment.projectId}/tasks/${comment.taskId}`}
                  className="font-medium text-gray-900 hover:underline"
                >
                  {comment.taskTitle}
                </Link>
                <span className="shrink-0 text-xs text-gray-400">
                  {new Date(comment.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500">{comment.authorName}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{comment.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

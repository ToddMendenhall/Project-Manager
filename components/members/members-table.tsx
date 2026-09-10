"use client";

import { useState, useTransition } from "react";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";

type Member = {
  userId: string;
  name: string;
  email: string;
  role: "admin" | "member";
  createdAt: Date | string;
};

export function MembersTable({
  members,
  currentUserId,
  onRoleChange,
  onDelete,
}: {
  members: Member[];
  currentUserId: string;
  onRoleChange: (userId: string, role: string) => Promise<void>;
  onDelete: (userId: string) => Promise<void>;
}) {
  const [rows, setRows] = useState(members);
  const [, startTransition] = useTransition();

  function handleRoleChange(member: Member, role: string) {
    const previous = member.role;
    setRows((prev) => prev.map((m) => (m.userId === member.userId ? { ...m, role: role as Member["role"] } : m)));

    startTransition(async () => {
      try {
        await onRoleChange(member.userId, role);
      } catch (err) {
        setRows((prev) => prev.map((m) => (m.userId === member.userId ? { ...m, role: previous } : m)));
        alert(err instanceof Error ? err.message : "Couldn't update role.");
      }
    });
  }

  async function handleDelete(userId: string) {
    try {
      await onDelete(userId);
      setRows((prev) => prev.filter((m) => m.userId !== userId));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Couldn't delete member.");
    }
  }

  return (
    <div className="overflow-x-auto rounded border border-gray-200 bg-white">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-xs font-medium uppercase text-gray-500">
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium">Email</th>
            <th className="px-3 py-2 font-medium">Role</th>
            <th className="px-3 py-2 font-medium">Joined</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((member) => {
            const isSelf = member.userId === currentUserId;
            return (
              <tr key={member.userId} className="border-b border-gray-100 last:border-0">
                <td className="px-3 py-2 font-medium text-gray-900">
                  {member.name} {isSelf && <span className="text-xs font-normal text-gray-400">(you)</span>}
                </td>
                <td className="px-3 py-2 text-gray-600">{member.email}</td>
                <td className="px-3 py-2">
                  <select
                    value={member.role}
                    disabled={isSelf}
                    onChange={(e) => handleRoleChange(member, e.target.value)}
                    title={isSelf ? "You can't change your own role" : undefined}
                    className="rounded border border-gray-300 bg-white px-2 py-1 text-xs disabled:opacity-50"
                  >
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                  </select>
                </td>
                <td className="px-3 py-2 text-gray-500">{new Date(member.createdAt).toLocaleDateString()}</td>
                <td className="px-3 py-2 text-right">
                  {!isSelf && (
                    <ConfirmDeleteButton
                      action={handleDelete.bind(null, member.userId)}
                      confirmMessage={`Delete ${member.name}'s account? This removes their access and cannot be undone.`}
                    />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

"use client";

import { useState } from "react";

export function PasswordField({
  name,
  required,
  minLength,
  className,
}: {
  name: string;
  required?: boolean;
  minLength?: number;
  className?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <input
        type={visible ? "text" : "password"}
        name={name}
        required={required}
        minLength={minLength}
        className={`flex-1 ${className ?? ""}`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="shrink-0 text-xs text-gray-500 underline"
      >
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  );
}

"use client";

import { useCallback, useRef, useState } from "react";

interface CommandBarProps {
  orchestratorId: string;
  onSend: (sessionId: string, message: string) => Promise<void>;
}

export function CommandBar({ orchestratorId, onSend }: CommandBarProps) {
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSubmit = useCallback(async () => {
    const trimmed = message.trim();
    if (!trimmed || status === "sending") return;

    setStatus("sending");
    try {
      await onSend(orchestratorId, trimmed);
      setMessage("");
      setStatus("sent");
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("idle");
    }
  }, [message, status, orchestratorId, onSend]);

  return (
    <div className="border-t border-[var(--color-border-default)] bg-[var(--color-bg-base)] px-4 py-3">
      <div className="mx-auto flex max-w-[900px] items-center gap-2">
        <span className="text-[12px] text-[var(--color-text-tertiary)]">&gt;</span>
        <input
          ref={inputRef}
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSubmit();
            }
          }}
          placeholder="Ask the orchestrator..."
          className="flex-1 bg-transparent text-[13px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] outline-none"
          disabled={status === "sending"}
        />
        <button
          onClick={() => void handleSubmit()}
          disabled={!message.trim() || status === "sending"}
          className="rounded-[5px] border border-[var(--color-border-default)] px-3 py-1 text-[11px] font-medium text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-40"
        >
          {status === "sending" ? (
            <svg className="h-3 w-3 animate-spin" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
          ) : status === "sent" ? "sent!" : "Send"}
        </button>
      </div>
    </div>
  );
}

import { useEffect, useRef, type ReactNode } from "react";
import type { PublicPlayer } from "@insider/shared";
import { X } from "lucide-react";

export const number = (n: number) => n.toLocaleString("en-US");
export const signed = (n: number) =>
  `${n >= 0 ? "+" : "−"}${number(Math.abs(n))}`;
export function Avatar({
  player,
  index = 0,
  small = false,
}: {
  player: Pick<PublicPlayer, "name" | "bot">;
  index?: number;
  small?: boolean;
}) {
  const initials = player.name
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      className={`avatar avatar-${index % 5} ${small ? "small" : ""}`}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}
export function Sparkline({
  values,
  label,
}: {
  values: number[];
  label: string;
}) {
  const min = Math.min(50, ...values) - 10,
    max = Math.max(120, ...values) + 10,
    den = Math.max(1, values.length - 1);
  const points = values
    .map((v, i) => `${(i * 180) / den},${55 - ((v - min) / (max - min)) * 45}`)
    .join(" ");
  return (
    <svg
      className="sparkline"
      viewBox="0 0 184 64"
      role="img"
      aria-label={`${label}: ${values.join(", ")}`}
    >
      <path
        d="M0 54H184M0 29H184M0 4H184"
        stroke="currentColor"
        opacity=".12"
        fill="none"
      />
      <polyline
        points={points}
        stroke="currentColor"
        strokeWidth="2.5"
        fill="none"
        strokeLinejoin="round"
      />
      {values.map((v, i) => (
        <circle
          key={i}
          cx={(i * 180) / den}
          cy={55 - ((v - min) / (max - min)) * 45}
          r="2.4"
          fill="currentColor"
        />
      ))}
    </svg>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => before?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-label={title}
    >
      <div className="modal-top">
        <h2>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

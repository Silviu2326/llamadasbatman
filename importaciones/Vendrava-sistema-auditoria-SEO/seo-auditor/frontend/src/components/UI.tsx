import { useEffect, useRef } from "react";
import {
  X,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  LoaderCircle,
} from "lucide-react";
import { states } from "../api";
export function Badge({ state }: { state: string }) {
  const Icon = ["completed", "pass"].includes(state)
    ? CheckCircle2
    : ["running", "queued"].includes(state)
      ? LoaderCircle
      : ["fail", "failed", "warning"].includes(state)
        ? AlertCircle
        : HelpCircle;
  return (
    <span className={"badge " + state}>
      <Icon size={15} />
      {states[state] ?? state}
    </span>
  );
}
export function Message({ text }: { text: string }) {
  return text ? (
    <p role="alert" className="message">
      {text}
    </p>
  ) : null;
}
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} onCancel={onClose}>
      <header>
        <h2>{title}</h2>
        <button aria-label="Cerrar" className="icon-button" onClick={onClose}>
          <X />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

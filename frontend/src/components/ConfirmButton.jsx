import { useState } from "react";

export default function ConfirmButton({ onConfirm, children, className = "" }) {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    if (!window.confirm("Are you sure?")) return;
    setPending(true);
    try {
      await onConfirm();
    } finally {
      setPending(false);
    }
  }

  return (
    <button className={`btn btn-danger ${className}`} onClick={handleClick} disabled={pending}>
      {pending ? "..." : children}
    </button>
  );
}

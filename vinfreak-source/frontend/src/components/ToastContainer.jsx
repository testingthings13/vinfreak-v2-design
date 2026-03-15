import { useEffect } from "react";
import { useToast } from "../ToastContext";

function Toast({ id, msg, type, remove }) {
  useEffect(() => {
    const t = setTimeout(() => remove(id), 3000);
    return () => clearTimeout(t);
  }, [id, remove]);
  return <div className={`toast ${type}`}>{msg}</div>;
}

export default function ToastContainer() {
  const { toasts, removeToast } = useToast();
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <Toast key={t.id} id={t.id} msg={t.msg} type={t.type} remove={removeToast} />
      ))}
    </div>
  );
}

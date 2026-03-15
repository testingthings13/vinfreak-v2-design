import { createContext, useContext, useState, useCallback } from "react";

const ToastContext = createContext({
  toasts: [],
  addToast: () => {},
  removeToast: () => {}
});

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((msg, type = "info") => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts, { id, msg, type }]);
    return id;
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

export default ToastContext;

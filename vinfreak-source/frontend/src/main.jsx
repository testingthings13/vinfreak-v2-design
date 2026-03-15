import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles.css";
import { ToastProvider } from "./ToastContext";
import ToastContainer from "./components/ToastContainer";

const root = createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <ToastProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
      <ToastContainer />
    </ToastProvider>
  </React.StrictMode>
);

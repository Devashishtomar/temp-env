"use client";
import { createContext, useContext, useState, ReactNode } from "react";
import LoginGate from "./LoginGate";

interface LoginContextType {
  openLogin: () => void;
  closeLogin: () => void;
}

export const LoginContext = createContext<LoginContextType | undefined>(undefined);

export function LoginProvider({ children }: { children: ReactNode }) {
  const [loginOpen, setLoginOpen] = useState(false);

  const openLogin = () => setLoginOpen(true);
  const closeLogin = () => setLoginOpen(false);

  return (
    <LoginContext.Provider value={{ openLogin, closeLogin }}>
      {children}
      <LoginGate open={loginOpen} onClose={closeLogin} />
    </LoginContext.Provider>
  );
}

export function useLogin() {
  const context = useContext(LoginContext);
  if (!context) {
    throw new Error("useLogin must be used within LoginProvider");
  }
  return context;
}


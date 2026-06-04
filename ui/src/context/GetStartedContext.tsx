import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

interface GetStartedContextValue {
  open: boolean;
  openTour: () => void;
  setOpen: (v: boolean) => void;
}

const GetStartedContext = createContext<GetStartedContextValue | null>(null);

export function GetStartedProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  const openTour = useCallback(() => setOpen(true), []);

  return (
    <GetStartedContext.Provider value={{ open, openTour, setOpen }}>
      {children}
    </GetStartedContext.Provider>
  );
}

export function useGetStarted(): GetStartedContextValue {
  const ctx = useContext(GetStartedContext);
  if (!ctx) throw new Error("useGetStarted must be used inside GetStartedProvider");
  return ctx;
}

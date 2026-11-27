"use client";
import type { ReactNode } from "react";
import { InstallAppContext, useInstallAppController } from "@/hooks/useInstallApp";
import { InstallAppGuide } from "@/components/MyComponents/InstallAppCard";

/** Listens to the install events once for the whole site and hosts the shared iPhone guide sheet. */
export default function InstallAppProvider({ children }: { children: ReactNode }) {
  const value = useInstallAppController();
  return <InstallAppContext.Provider value={value}>{children}<InstallAppGuide /></InstallAppContext.Provider>;
}

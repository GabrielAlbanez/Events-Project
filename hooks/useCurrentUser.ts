"use client";
import { useSession } from "next-auth/react";

export const useCurrentUser = () => {
  const { data: session, update } = useSession();
  return {
    data : session?.user,
    update
  };
};
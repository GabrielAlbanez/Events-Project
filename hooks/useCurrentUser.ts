"use client";
import { useSession } from "next-auth/react";

export const useCurrentUser = () => {
  const { data: session, update , status } = useSession();
  return {
    data : session?.user,
    update,
    status
  };
};
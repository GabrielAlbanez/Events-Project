"use server";

import { resetDataProfile as updateProfile, type ProfileUpdateInput } from "@/lib/services/profile";

export default async function resetDataProfile(data: ProfileUpdateInput) {
  return updateProfile(data);
}

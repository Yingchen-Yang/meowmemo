import { UserRound } from "lucide-react";
import type { UserProfile } from "@/lib/types";

export function UserAvatar({ profile, size = "sm" }: { profile?: UserProfile | null; size?: "sm" | "md" }) {
  return (
    <span className={`user-avatar ${size}`} style={profile?.avatar ? { backgroundImage: `url(${profile.avatar})` } : undefined}>
      {!profile?.avatar && <UserRound size={size === "sm" ? 15 : 20} aria-hidden />}
    </span>
  );
}

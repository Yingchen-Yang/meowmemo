import type { Cat } from "@/lib/types";

export function CatAvatar({ cat, size = "md" }: { cat?: Cat; size?: "sm" | "md" | "lg" }) {
  return (
    <div className={`cat-avatar ${size}`} style={cat?.photo ? { backgroundImage: `url(${cat.photo})` } : undefined}>
      {!cat?.photo && <span aria-hidden>{cat?.name?.slice(0, 1).toUpperCase() || "M"}</span>}
    </div>
  );
}

import { cn } from "cn";
import { Package } from "lucide-react";
import { useState } from "react";

interface ModpackImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  iconClassName?: string;
}

/** Cover image with a placeholder fallback when the modpack has none (or it fails to load). */
export default function ModpackImage({ src, alt, className, iconClassName }: ModpackImageProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className={cn("bg-muted flex items-center justify-center", className)}>
        <Package className={cn("text-muted-foreground size-6", iconClassName)} />
      </div>
    );
  }

  return (
    <img
      alt={alt}
      className={cn("bg-muted object-cover", className)}
      loading="lazy"
      src={src}
      onError={() => setFailed(true)}
    />
  );
}

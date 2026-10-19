import { ImageOff } from "lucide-react";
import { useTranslation } from "react-i18next";

import { PROFILE_ICONS, PROFILE_ICON_BASE } from "@/lib/profile-icons";
import { cn } from "@/lib/utils";

export function ProfileIconPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (icon: string | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        aria-label={t("profiles.iconPicker.noIcon")}
        className={cn(
          "flex size-11 items-center justify-center border text-muted-foreground transition-colors hover:bg-accent",
          !value && "border-accent-primary bg-accent-primary/10 text-accent-primary",
        )}
        type="button"
        onClick={() => onChange(null)}
      >
        <ImageOff className="size-4" />
      </button>
      {PROFILE_ICONS.map((icon) => (
        <button
          aria-label={icon}
          className={cn(
            "flex size-11 items-center justify-center border transition-colors hover:bg-accent",
            value === icon ? "border-accent-primary bg-accent-primary/10" : "border-transparent",
          )}
          key={icon}
          type="button"
          onClick={() => onChange(icon)}
        >
          <img alt="" className="size-8 object-contain" src={`${PROFILE_ICON_BASE}/${icon}`} />
        </button>
      ))}
    </div>
  );
}

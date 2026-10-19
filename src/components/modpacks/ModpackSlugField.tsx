import { CheckIcon, Loader2, SparklesIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Input } from "@/components/ui/input";

export type SlugResult = {
  available: boolean;
  suggestion?: string;
  alternatives?: string[];
};

interface ModpackSlugFieldProps {
  slug: string;
  saving: boolean;
  slugChecking: boolean;
  slugValid: boolean;
  slugCheck: SlugResult | null;
  error: string | undefined;
  onApplySuggestion: (suggestion: string) => void;
  onBlur: () => void;
  onChange: (slug: string) => void;
}

/** Modpack slug input with availability feedback and alternative suggestions. */
export default function ModpackSlugField({
  slug,
  saving,
  slugChecking,
  slugValid,
  slugCheck,
  error,
  onApplySuggestion,
  onBlur,
  onChange,
}: ModpackSlugFieldProps) {
  const { t } = useTranslation();

  return (
    <div className="grid gap-1.5">
      <label className="text-xs font-medium" htmlFor="modpack-slug">
        {t("modpacks.form.slug")} <span className="text-destructive">*</span>
      </label>
      <div className="relative">
        <Input
          className="pr-8 font-mono"
          disabled={saving}
          id="modpack-slug"
          placeholder="my-awesome-modpack"
          value={slug}
          onBlur={onBlur}
          onChange={(event) => onChange(event.target.value)}
        />
        {slugChecking && (
          <Loader2 className="text-muted-foreground absolute top-2 right-2.5 size-3.5 animate-spin" />
        )}
        {!slugChecking && slugValid && slugCheck?.available && (
          <CheckIcon className="text-success absolute top-2 right-2.5 size-3.5" />
        )}
      </div>
      {error && <p className="text-destructive text-[11px]">{error}</p>}

      {/* Suggestion / alternatives when the slug is taken */}
      {!slugChecking && slugCheck && !slugCheck.available && (
        <div className="grid gap-1">
          {slugCheck.suggestion && (
            <div className="flex items-center gap-1.5">
              <SparklesIcon className="text-muted-foreground size-3" />
              <span className="text-muted-foreground text-xs">{t("modpacks.form.suggestion")}</span>
              <button
                className="text-accent-primary text-xs font-medium hover:underline"
                type="button"
                onClick={() => onApplySuggestion(slugCheck.suggestion!)}
              >
                {slugCheck.suggestion}
              </button>
            </div>
          )}
          {slugCheck.alternatives && slugCheck.alternatives.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-muted-foreground text-xs">
                {t("modpacks.form.alternatives")}
              </span>
              {slugCheck.alternatives.map((alternative) => (
                <button
                  className="bg-muted hover:bg-accent rounded-none px-1.5 py-0.5 text-xs transition-colors"
                  key={alternative}
                  type="button"
                  onClick={() => onApplySuggestion(alternative)}
                >
                  {alternative}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

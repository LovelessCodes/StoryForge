interface ProgressBarProps {
  value: number;
  max?: number;
  label?: string;
  showPercentage?: boolean;
  indeterminate?: boolean;
  className?: string;
}

export default function ProgressBar({
  value,
  max = 100,
  label,
  showPercentage = true,
  indeterminate = false,
  className = "",
}: ProgressBarProps) {
  const percentage = Math.min(Math.round((value / max) * 100), 100);

  return (
    <div className={`w-full ${className}`}>
      {(label || showPercentage) && (
        <div className="mb-1.5 flex items-center justify-between">
          {label && <span className="text-sm text-[var(--color-text-secondary)]">{label}</span>}
          {showPercentage && !indeterminate && (
            <span className="text-sm font-medium text-[var(--color-text-primary)]">
              {percentage}%
            </span>
          )}
        </div>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-bg-input)]">
        {indeterminate ? (
          <div
            className="h-full animate-[indeterminate_1.5s_ease-in-out_infinite] rounded-full bg-[var(--color-accent-primary)]"
            style={{ width: "40%" }}
          />
        ) : (
          <div
            className="h-full rounded-full bg-[var(--color-accent-primary)] transition-[width] duration-300 ease-out"
            style={{ width: `${percentage}%` }}
          />
        )}
      </div>
      <style>{`
        @keyframes indeterminate {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }
      `}</style>
    </div>
  );
}

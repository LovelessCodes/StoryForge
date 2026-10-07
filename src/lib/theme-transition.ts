export function elementCenter(element: Element | null): { x: number; y: number } | undefined {
  if (!element) return undefined;
  const { top, left, width, height } = element.getBoundingClientRect();
  return { x: left + width / 2, y: top + height / 2 };
}

interface SwitchThemeOptions {
  duration?: number;
  origin?: { x: number; y: number };
  setTheme: (theme: string) => void;
}

/**
 * Switch the theme with a clip-path circle reveal when the View Transitions
 * API is available, and a plain switch when it is not. The `data-theme-vt`
 * flag keeps the page out of its own snapshot group so the reveal covers the
 * whole window.
 */
export function switchTheme(
  nextTheme: "light" | "dark",
  { duration = 400, origin, setTheme }: SwitchThemeOptions,
): void {
  const applyTheme = () => {
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
    setTheme(nextTheme);
  };

  if (typeof document.startViewTransition !== "function") {
    applyTheme();
    return;
  }

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const x = origin?.x ?? viewportWidth / 2;
  const y = origin?.y ?? viewportHeight / 2;
  const maxRadius = Math.hypot(Math.max(x, viewportWidth - x), Math.max(y, viewportHeight - y));

  // clip-path percentages resolve against the snapshot reference box, so the
  // circle lands correctly at any display scale.
  const point = `${((x / viewportWidth) * 100).toFixed(3)}% ${((y / viewportHeight) * 100).toFixed(3)}%`;
  const endRadius = `${((maxRadius / (Math.hypot(viewportWidth, viewportHeight) / Math.SQRT2)) * 100).toFixed(3)}%`;

  document.documentElement.dataset.themeVt = "";
  const transition = document.startViewTransition(applyTheme);
  void transition.finished
    .finally(() => {
      delete document.documentElement.dataset.themeVt;
    })
    .catch(() => {});
  void transition.ready
    .then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0% at ${point})`, `circle(${endRadius} at ${point})`] },
        {
          duration,
          easing: "ease-in-out",
          fill: "forwards",
          pseudoElement: "::view-transition-new(root)",
        },
      );
    })
    .catch(() => {});
}

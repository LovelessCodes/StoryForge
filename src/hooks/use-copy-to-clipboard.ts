import { useCallback, useState } from "react";

function oldSchoolCopy(text: string) {
  const tempTextArea = document.createElement("textarea");
  tempTextArea.value = text;
  document.body.appendChild(tempTextArea);
  tempTextArea.select();
  document.execCommand("copy");
  document.body.removeChild(tempTextArea);
}

export function useCopyToClipboard(): [string | null, (value: string) => void] {
  const [state, setState] = useState<string | null>(null);

  const copyToClipboard = useCallback(async (value: string) => {
    const handleCopy = async () => {
      try {
        if (navigator?.clipboard?.writeText) {
          await navigator.clipboard.writeText(value);
          setState(value);
          setTimeout(() => setState(null), 3000);
        } else {
          throw new Error("writeText not supported");
        }
      } catch {
        oldSchoolCopy(value);
        setState(value);
        setTimeout(() => setState(null), 3000);
      }
    };

    await handleCopy();
  }, []);

  return [state, copyToClipboard];
}

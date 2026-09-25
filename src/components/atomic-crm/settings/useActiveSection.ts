import { useEffect, useState } from "react";

/**
 * Which of `ids` is the section being read: the last one whose top has passed
 * the reading line just under the sticky topbar. Drives the settings nav's
 * highlight, so the index says where the reader is in a long form.
 *
 * Measured on scroll rather than with an IntersectionObserver: sections are
 * of very different heights, and "the one in view" is ambiguous when two
 * short ones share the screen; "the last one started" is not.
 */
export const useActiveSection = (
  ids: readonly string[],
  offset = 120,
): string | undefined => {
  const [active, setActive] = useState<string | undefined>(ids[0]);

  useEffect(() => {
    const update = () => {
      let current = ids[0];
      for (const id of ids) {
        const element = document.getElementById(id);
        if (element && element.getBoundingClientRect().top - offset <= 0) {
          current = id;
        }
      }
      setActive(current);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [ids, offset]);

  return active;
};

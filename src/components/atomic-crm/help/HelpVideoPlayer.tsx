import { useTranslate } from "ra-core";

import type { HelpTutorial } from "../types";
import { helpMediaUrl } from "./helpMedia";

/**
 * A tutorial's recording.
 *
 * `preload="none"` is the whole bandwidth policy: opening the page fetches the
 * poster and nothing else, and the recording is only requested when the
 * reader presses play -- then progressively, by range request, so seeking does
 * not download what is skipped. `crossOrigin` is set only when there are
 * captions, because a `<track>` from another origin needs it and a recording
 * without one should not depend on the storage sending CORS headers.
 */
export const HelpVideoPlayer = ({ tutorial }: { tutorial: HelpTutorial }) => {
  const translate = useTranslate();

  if (!tutorial.video_path) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-xl border border-dashed bg-muted/40 p-6 text-center text-sm text-muted-foreground">
        {translate("crm.help.no_video")}
      </div>
    );
  }

  return (
    <video
      // A new tutorial is a new element: otherwise the browser keeps playing
      // the previous recording under the new title.
      key={tutorial.video_path}
      src={helpMediaUrl(tutorial.video_path)}
      poster={
        tutorial.poster_path ? helpMediaUrl(tutorial.poster_path) : undefined
      }
      aria-label={tutorial.title}
      controls
      playsInline
      preload="none"
      crossOrigin={tutorial.captions_path ? "anonymous" : undefined}
      className="aspect-video w-full rounded-xl bg-black shadow-raised"
    >
      {tutorial.captions_path ? (
        <track
          kind="captions"
          src={helpMediaUrl(tutorial.captions_path)}
          srcLang="es"
          label={translate("crm.help.captions")}
        />
      ) : null}
    </video>
  );
};

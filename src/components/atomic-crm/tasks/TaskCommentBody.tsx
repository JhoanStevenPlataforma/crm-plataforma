import { toCommentSegments } from "./taskMentions";

/**
 * Renders a comment body with its @mentions highlighted (proposal §8).
 *
 * Deliberately not `dangerouslySetInnerHTML` over rendered markdown: the body
 * is user input from a colleague, and the only formatting it needs is the
 * mention chip. Splitting into segments and rendering React nodes means there
 * is no HTML string to sanitize and no XSS surface to get wrong.
 */
export const TaskCommentBody = ({ body }: { body: string }) => (
  <p className="text-sm whitespace-pre-wrap break-words">
    {toCommentSegments(body).map((segment, index) =>
      segment.type === "mention" ? (
        <span
          key={index}
          className="font-medium text-primary bg-primary/10 rounded px-1"
        >
          @{segment.value}
        </span>
      ) : (
        <span key={index}>{segment.value}</span>
      ),
    )}
  </p>
);

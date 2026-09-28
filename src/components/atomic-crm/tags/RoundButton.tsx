/**
 * One colour swatch of the tag form.
 *
 * A swatch is otherwise a blank round button: it carries a name for screen
 * readers and says whether it is the chosen one (`aria-pressed`), because the
 * ring that shows it visually is invisible to them.
 */
export const RoundButton = ({
  color,
  handleClick,
  selected,
  label,
}: {
  color: string;
  handleClick: () => void;
  selected: boolean;
  label: string;
}) => (
  <button
    type="button"
    aria-label={label}
    aria-pressed={selected}
    title={label}
    className={`w-8 h-8 rounded-full inline-block m-1 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
      selected ? "ring-2 ring-foreground/60 ring-offset-1" : ""
    }`}
    style={{ backgroundColor: color }}
    onClick={handleClick}
  />
);

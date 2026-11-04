import { memo } from "react";
import { cx } from "../lib/cx";
import { shortTechniqueName } from "../hooks/useCatalogue";

/**
 * One MITRE ATT&CK technique. Neutral by default: these used to be eight
 * different neon hues, which made the busiest table on the page the loudest
 * thing on it while saying nothing the label did not already say.
 *
 * @param {string} id          Technique id, e.g. "T1105".
 * @param {object} [technique] Catalogue entry ({ name, description }).
 * @param {boolean} [active]   Highlighted (e.g. revealed in the replay).
 */
const TechniqueBadge = ({ id, technique, active = false, dim = false, className = "" }) => {
  const name = technique?.name || id;
  return (
    <span
      title={technique?.description ? `${name} — ${technique.description}` : name}
      className={cx(
        "inline-flex items-center gap-1.5 rounded border px-1.5 py-px text-2xs whitespace-nowrap transition-colors duration-300",
        active
          ? "border-accent/40 bg-accent/10 text-accent"
          : dim
            ? "border-line text-fg-subtle/70"
            : "border-line-strong bg-surface-2 text-fg-muted",
        className
      )}
    >
      <span>{shortTechniqueName(name)}</span>
      <span className="font-mono opacity-70">{id}</span>
    </span>
  );
};

export default memo(TechniqueBadge);

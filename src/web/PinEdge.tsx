import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";

/** Half the pin width in Canvas units: the pin is 1.125rem wide, and the Canvas draws it at the root font size. */
const halfPin = () => (parseFloat(getComputedStyle(document.documentElement).fontSize) * 1.125) / 2;

/** An Edge that starts and ends at the middle of the half-disc pins, as the line being dragged does, instead of at their outer tips. */
export function PinEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, interactionWidth }: EdgeProps) {
  const d = halfPin();
  const [path] = getBezierPath({ sourceX: sourceX - d, sourceY, sourcePosition, targetX: targetX + d, targetY, targetPosition });
  return <BaseEdge id={id} path={path} style={style} interactionWidth={interactionWidth} />;
}

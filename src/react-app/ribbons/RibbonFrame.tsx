// The recolorable rosette. One inlined SVG whose pleat fills are CSS vars;
// mid/main/light shades derive from a single --r-base via color-mix. Children
// (the center glyph) are absolutely centered over the white rosette center.
import type { CSSProperties, ReactNode } from "react";
import { ROSETTE_MARKUP } from "./rosette";

export function RibbonFrame({ baseColor, children, size = 64 }: { baseColor: string; children?: ReactNode; size?: number }) {
	return (
		<span className="ribbon-frame" style={{ width: size, height: size, ["--r-base" as keyof CSSProperties]: baseColor } as CSSProperties}>
			<span className="ribbon-frame__art" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ROSETTE_MARKUP }} />
			{children && <span className="ribbon-frame__glyph">{children}</span>}
		</span>
	);
}

// The recolorable rosette. The geometry itself lives once in a shared
// <symbol id="pfd-rosette"> (see RosetteSprite); each frame is a lightweight
// <use> reference. Pleat fills are CSS vars; mid/main/light shades derive
// from a single --r-base via color-mix, and inherit through the <use>
// shadow tree. Children (the center glyph) are absolutely centered over the
// white rosette center.
import type { CSSProperties, ReactNode } from "react";

export function RibbonFrame({ baseColor, children, size = 64 }: { baseColor: string; children?: ReactNode; size?: number }) {
	return (
		<span className="ribbon-frame" style={{ width: size, height: size, ["--r-base" as keyof CSSProperties]: baseColor } as CSSProperties}>
			<svg className="ribbon-frame__art" viewBox="0 0 1616.28 1680.23" aria-hidden="true">
				<use href="#pfd-rosette" />
			</svg>
			{children && <span className="ribbon-frame__glyph">{children}</span>}
		</span>
	);
}

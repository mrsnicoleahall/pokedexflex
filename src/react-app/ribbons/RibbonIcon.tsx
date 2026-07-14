// Composes the resolver + frame + glyph into one ribbon icon. Reserved kawaii
// pieces render as <img>. Rosette ribbons render a recolored frame with a
// TypeIcon / text / emoji glyph. `hidden` (secret unearned) forces a neutral
// "?" rosette so nothing leaks.
import { TypeIcon } from "../components/TypeIcon";
import { typeColor } from "../theme";
import { RibbonFrame } from "./RibbonFrame";
import { resolveRibbonIcon, type RibbonGlyph } from "./ribbonIcon";

function Glyph({ glyph, color, size }: { glyph: RibbonGlyph; color: string; size: number }) {
	if (glyph.kind === "type") return <TypeIcon type={glyph.type} color={color} size={size} />;
	if (glyph.kind === "emoji") return <span className="ribbon-glyph ribbon-glyph--emoji" style={{ fontSize: size }}>{glyph.emoji}</span>;
	return <span className="ribbon-glyph ribbon-glyph--text" style={{ color, fontSize: size * 0.72 }}>{glyph.text}</span>;
}

export function RibbonIcon({ ribbon, hidden = false, size = 64 }: { ribbon: { id: string; category: string }; hidden?: boolean; size?: number }) {
	if (hidden) {
		return (
			<RibbonFrame baseColor={typeColor("normal")} size={size}>
				<span className="ribbon-glyph ribbon-glyph--text" style={{ color: typeColor("normal"), fontSize: size * 0.5 }}>?</span>
			</RibbonFrame>
		);
	}
	const visual = resolveRibbonIcon(ribbon);
	if (visual.kind === "piece") {
		return <img className="ribbon-piece" src={`/ribbons/${visual.piece}.svg`} alt="" aria-hidden="true" style={{ width: size, height: size }} />;
	}
	return (
		<RibbonFrame baseColor={visual.baseColor} size={size}>
			<Glyph glyph={visual.glyph} color={visual.baseColor} size={size * 0.42} />
		</RibbonFrame>
	);
}

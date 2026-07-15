// src/react-app/components/Avatar.tsx
//
// The user's uploaded photo when `hasAvatar` is true, else an
// initials-in-a-circle placeholder derived from `displayName` — never from
// email. Purely presentational; used by AccountMenu, Home, Settings, and
// ProfileFields.

import { avatarUrl, initials } from "../profile/display";

type AvatarProps = {
	userId: string;
	displayName: string | null;
	hasAvatar: boolean;
	size?: "sm" | "md" | "lg";
};

export function Avatar({ userId, displayName, hasAvatar, size = "md" }: AvatarProps) {
	if (hasAvatar) {
		return (
			<img
				className={`avatar avatar--${size}`}
				src={avatarUrl(userId)}
				alt={displayName ? `${displayName}'s avatar` : "Trainer avatar"}
			/>
		);
	}
	return (
		<span className={`avatar avatar--${size} avatar--placeholder`} aria-hidden="true">
			{initials(displayName)}
		</span>
	);
}

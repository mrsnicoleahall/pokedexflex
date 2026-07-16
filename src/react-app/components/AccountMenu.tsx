// src/react-app/components/AccountMenu.tsx
//
// Lives in the TopBar's control cluster. Signed-out renders a "Sign in"
// button that opens the SignInPanel modal. Signed-in renders a button
// showing the user's avatar + display name (never email — see
// src/react-app/profile/display.ts's NAME_PLACEHOLDER), which opens a menu
// with links to Collection/Ribbons/Import-Export/Settings and Sign out.

import { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { Avatar } from "./Avatar";
import { NAME_PLACEHOLDER } from "../profile/display";
import { SignInPanel } from "./SignInPanel";
import { type AccountView } from "../routes";

export type { AccountView };

type AccountMenuProps = {
	onNavigate: (view: AccountView) => void;
};

export function AccountMenu({ onNavigate }: AccountMenuProps) {
	const { user, logout } = useAuth();
	const [panelOpen, setPanelOpen] = useState(false);
	const [menuOpen, setMenuOpen] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);
	const buttonRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		if (!menuOpen) return;
		function onKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") {
				setMenuOpen(false);
				buttonRef.current?.focus();
			}
		}
		function onClickOutside(e: MouseEvent) {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				setMenuOpen(false);
			}
		}
		document.addEventListener("keydown", onKeyDown);
		document.addEventListener("mousedown", onClickOutside);
		return () => {
			document.removeEventListener("keydown", onKeyDown);
			document.removeEventListener("mousedown", onClickOutside);
		};
	}, [menuOpen]);

	if (!user) {
		return (
			<>
				<button type="button" className="button button--primary" onClick={() => setPanelOpen(true)}>
					Sign in
				</button>
				{panelOpen && <SignInPanel onClose={() => setPanelOpen(false)} />}
			</>
		);
	}

	function go(view: AccountView) {
		setMenuOpen(false);
		onNavigate(view);
	}

	async function handleSignOut() {
		setMenuOpen(false);
		await logout();
	}

	return (
		<div className="account-menu" ref={menuRef}>
			<button
				ref={buttonRef}
				type="button"
				className="button account-menu__trigger"
				aria-haspopup="menu"
				aria-expanded={menuOpen}
				onClick={() => setMenuOpen((open) => !open)}
			>
				<Avatar userId={user.id} displayName={user.displayName} hasAvatar={user.hasAvatar} size="sm" />
				<span className="account-menu__label">{user.displayName ?? NAME_PLACEHOLDER}</span>
			</button>
			{menuOpen && (
				<div className="account-menu__dropdown" role="menu">
					<button type="button" role="menuitem" className="account-menu__item" onClick={() => go("progress")}>
						Progress
					</button>
					<button type="button" role="menuitem" className="account-menu__item" onClick={() => go("collection")}>
						My Collection
					</button>
					<button type="button" role="menuitem" className="account-menu__item" onClick={() => go("wanted")}>
						Wanted
					</button>
					<button type="button" role="menuitem" className="account-menu__item" onClick={() => go("ribbons")}>
						Ribbons
					</button>
					<button type="button" role="menuitem" className="account-menu__item" onClick={() => go("importExport")}>
						Import / Export
					</button>
					<button type="button" role="menuitem" className="account-menu__item" onClick={() => go("settings")}>
						Settings
					</button>
					<div className="account-menu__divider" />
					<button type="button" role="menuitem" className="account-menu__item" onClick={handleSignOut}>
						Sign out
					</button>
				</div>
			)}
		</div>
	);
}

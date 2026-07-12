// src/react-app/pages/Settings.tsx
//
// Signed-in-only settings view: shows the account email, a sign-out
// button, and a destructive delete-account flow gated behind a typed
// "delete" confirmation. Display-name editing is out of scope (no PATCH
// endpoint yet).

import { useState } from "react";
import { authDeleteAccount } from "../api";
import { useAuth } from "../auth/AuthProvider";

type SettingsProps = {
	onBack: () => void;
};

const CONFIRM_WORD = "delete";

export function Settings({ onBack }: SettingsProps) {
	const { user, logout, refresh } = useAuth();
	const [confirmText, setConfirmText] = useState("");
	const [deleting, setDeleting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	if (!user) {
		return (
			<div className="page container">
				<div className="state">
					<p className="state__title">You're signed out</p>
					<button type="button" className="button" onClick={onBack}>
						Back
					</button>
				</div>
			</div>
		);
	}

	async function handleSignOut() {
		await logout();
		onBack();
	}

	async function handleDelete() {
		setError(null);
		setDeleting(true);
		try {
			await authDeleteAccount();
			await refresh();
			onBack();
		} catch {
			setError("Couldn't delete your account. Please try again.");
			setDeleting(false);
		}
	}

	return (
		<div className="page container settings-page">
			<div className="page__meta">
				<button type="button" className="button" onClick={onBack}>
					← Back
				</button>
			</div>
			<h1 className="page__title">Settings</h1>

			<section className="settings-section">
				<h2 className="settings-section__title">Account</h2>
				<p className="settings-section__row">
					<span className="field-label">Email</span>
					<span>{user.email}</span>
				</p>
				<button type="button" className="button" onClick={handleSignOut}>
					Sign out
				</button>
			</section>

			<section className="settings-section settings-section--danger">
				<h2 className="settings-section__title">Delete account</h2>
				<p className="settings-section__hint">
					This permanently deletes your account, boxes, specimens, and import history. This
					cannot be undone.
				</p>
				<label className="field-label" htmlFor="confirm-delete">
					Type "{CONFIRM_WORD}" to confirm
				</label>
				<input
					id="confirm-delete"
					className="input input--full"
					value={confirmText}
					onChange={(e) => setConfirmText(e.target.value)}
					placeholder={CONFIRM_WORD}
				/>
				{error && (
					<p className="error-banner" role="alert">
						{error}
					</p>
				)}
				<button
					type="button"
					className="button button--danger"
					disabled={confirmText.trim().toLowerCase() !== CONFIRM_WORD || deleting}
					onClick={handleDelete}
				>
					{deleting ? "Deleting…" : "Delete account"}
				</button>
			</section>
		</div>
	);
}

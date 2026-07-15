// src/react-app/pages/Settings.tsx
//
// Signed-in-only settings view: profile editing (name/gender/photo/top-3
// favorites — Flex Phase P), the account email + sign-out, and a
// destructive delete-account flow gated behind a typed "delete"
// confirmation.

import { useState } from "react";
import { authDeleteAccount, updateProfile, uploadAvatar } from "../api";
import { useAuth } from "../auth/AuthProvider";
import { FavoriteSpeciesPicker } from "../components/FavoriteSpeciesPicker";
import { ProfileFields, type Gender } from "../components/ProfileFields";

type SettingsProps = {
	onBack: () => void;
};

const CONFIRM_WORD = "delete";

export function Settings({ onBack }: SettingsProps) {
	const { user, logout, refresh } = useAuth();
	const [confirmText, setConfirmText] = useState("");
	const [deleting, setDeleting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Profile-editing local state, seeded from the current user (both are
	// guaranteed non-null past onboarding, but Settings still guards below).
	const [displayName, setDisplayName] = useState(user?.displayName ?? "");
	const [gender, setGender] = useState<Gender | null>((user?.gender as Gender | null) ?? null);
	const [file, setFile] = useState<File | null>(null);
	const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
	const [savingProfile, setSavingProfile] = useState(false);
	const [profileError, setProfileError] = useState<string | null>(null);
	const [profileSaved, setProfileSaved] = useState(false);

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

	function onFileSelected(f: File | null) {
		setFile(f);
		setLocalPreviewUrl((prev) => {
			if (prev) URL.revokeObjectURL(prev);
			return f ? URL.createObjectURL(f) : null;
		});
	}

	async function handleSaveProfile() {
		setProfileError(null);
		setProfileSaved(false);
		if (!displayName.trim() || !gender) {
			setProfileError("A trainer name and a gender are both required.");
			return;
		}
		setSavingProfile(true);
		try {
			await updateProfile({ displayName: displayName.trim(), gender });
			if (file) await uploadAvatar(file);
			await refresh();
			setFile(null);
			setLocalPreviewUrl(null);
			setProfileSaved(true);
		} catch (err) {
			setProfileError(err instanceof Error ? err.message : String(err));
		} finally {
			setSavingProfile(false);
		}
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
				<h2 className="settings-section__title">Profile</h2>
				{profileError && (
					<p className="error-banner" role="alert">
						{profileError}
					</p>
				)}
				<ProfileFields
					idPrefix="settings"
					displayName={displayName}
					onDisplayNameChange={(v) => {
						setDisplayName(v);
						setProfileSaved(false);
					}}
					gender={gender}
					onGenderChange={(v) => {
						setGender(v);
						setProfileSaved(false);
					}}
					userId={user.id}
					hasAvatar={user.hasAvatar}
					localPreviewUrl={localPreviewUrl}
					onFileSelected={onFileSelected}
				/>
				<button
					type="button"
					className="button button--primary"
					onClick={handleSaveProfile}
					disabled={savingProfile}
				>
					{savingProfile ? "Saving…" : profileSaved ? "Saved" : "Save profile"}
				</button>
			</section>

			<FavoriteSpeciesPicker favorites={user.favorites} onSaved={() => void refresh()} />

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

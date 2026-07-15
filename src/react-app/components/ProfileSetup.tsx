// src/react-app/components/ProfileSetup.tsx
//
// Blocking onboarding screen: App.tsx renders this INSTEAD OF the rest of
// the app whenever needsOnboarding(user) is true (missing displayName or
// gender). Photo and top-3 favorites are optional and can be skipped here
// and added later from Settings. On save, calls useAuth().refresh() so
// App re-evaluates needsOnboarding against the freshly-fetched user and
// renders the real app.

import { useState } from "react";
import { updateProfile, uploadAvatar, type FavoriteDto } from "../api";
import { useAuth } from "../auth/AuthProvider";
import { FavoriteSpeciesPicker } from "./FavoriteSpeciesPicker";
import { ProfileFields, type Gender } from "./ProfileFields";

export function ProfileSetup() {
	const { user, refresh } = useAuth();
	const [displayName, setDisplayName] = useState("");
	const [gender, setGender] = useState<Gender | null>(null);
	const [file, setFile] = useState<File | null>(null);
	const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
	const [favorites, setFavorites] = useState<FavoriteDto[]>(user?.favorites ?? []);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	if (!user) return null; // App only renders ProfileSetup when a signed-in user exists

	function onFileSelected(f: File | null) {
		setFile(f);
		setLocalPreviewUrl((prev) => {
			if (prev) URL.revokeObjectURL(prev);
			return f ? URL.createObjectURL(f) : null;
		});
	}

	async function handleSave() {
		setError(null);
		if (!displayName.trim() || !gender) {
			setError("A trainer name and a gender are both required.");
			return;
		}
		setSaving(true);
		try {
			await updateProfile({ displayName: displayName.trim(), gender });
			if (file) {
				try {
					await uploadAvatar(file);
				} catch {
					// Photo is optional — a failed upload never blocks completing onboarding.
				}
			}
			await refresh();
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
			setSaving(false);
		}
	}

	return (
		<div className="page container profile-setup">
			<h1 className="page__title">Welcome, Trainer!</h1>
			<p className="profile-setup__hint">
				Before you dive in, tell us a bit about yourself. Your name and gender are required; a
				photo and favorites are optional and can be added later from Settings. We'll also set up a
				public trainer page for you — you can customize its link or make it private anytime in
				Settings.
			</p>
			{error && (
				<p className="error-banner" role="alert">
					{error}
				</p>
			)}
			<ProfileFields
				idPrefix="onboarding"
				displayName={displayName}
				onDisplayNameChange={setDisplayName}
				gender={gender}
				onGenderChange={setGender}
				userId={user.id}
				hasAvatar={user.hasAvatar}
				localPreviewUrl={localPreviewUrl}
				onFileSelected={onFileSelected}
			/>
			<FavoriteSpeciesPicker favorites={favorites} onSaved={setFavorites} />
			<button type="button" className="button button--primary" onClick={handleSave} disabled={saving}>
				{saving ? "Saving…" : "Start exploring"}
			</button>
		</div>
	);
}

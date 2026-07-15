// src/react-app/components/ProfileFields.tsx
//
// Shared trainer-name + gender + optional-photo form fields, used by both
// the blocking onboarding screen (ProfileSetup, Task P5) and the Settings
// profile editor (Task P6). `idPrefix` keeps label/input ids unique across
// the two mounting contexts (radio `name` groups too, so onboarding's
// gender radios never collide with Settings' if both existed in the same
// document — they don't today, but this keeps the component safe to reuse
// anywhere else later).

import { GENDER_OPTIONS } from "../profile/display";
import { Avatar } from "./Avatar";

export type Gender = "boy" | "girl" | "ditto";

export type ProfileFieldsProps = {
	idPrefix: string;
	displayName: string;
	onDisplayNameChange: (value: string) => void;
	gender: Gender | null;
	onGenderChange: (value: Gender) => void;
	userId: string;
	hasAvatar: boolean;
	/** Object URL for a freshly-picked (not yet uploaded) file; null shows the existing avatar/placeholder instead. */
	localPreviewUrl: string | null;
	onFileSelected: (file: File | null) => void;
};

export function ProfileFields({
	idPrefix,
	displayName,
	onDisplayNameChange,
	gender,
	onGenderChange,
	userId,
	hasAvatar,
	localPreviewUrl,
	onFileSelected,
}: ProfileFieldsProps) {
	return (
		<div className="profile-fields">
			<div className="profile-fields__row">
				<label className="field-label" htmlFor={`${idPrefix}-name`}>
					Trainer name
				</label>
				<input
					id={`${idPrefix}-name`}
					className="input input--full"
					value={displayName}
					maxLength={40}
					placeholder="e.g. Ash"
					onChange={(e) => onDisplayNameChange(e.target.value)}
				/>
			</div>

			<fieldset className="profile-fields__row">
				<legend className="field-label">Gender</legend>
				<div className="profile-fields__gender-options" role="radiogroup" aria-label="Gender">
					{GENDER_OPTIONS.map((opt) => (
						<label key={opt.value} className="profile-fields__gender-option">
							<input
								type="radio"
								name={`${idPrefix}-gender`}
								value={opt.value}
								checked={gender === opt.value}
								onChange={() => onGenderChange(opt.value)}
							/>
							{opt.label}
						</label>
					))}
				</div>
			</fieldset>

			<div className="profile-fields__row">
				<label className="field-label" htmlFor={`${idPrefix}-photo`}>
					Profile photo (optional)
				</label>
				<div className="profile-fields__photo-row">
					{localPreviewUrl ? (
						<img className="avatar avatar--md" src={localPreviewUrl} alt="Selected photo preview" />
					) : (
						<Avatar userId={userId} displayName={displayName || null} hasAvatar={hasAvatar} size="md" />
					)}
					<input
						id={`${idPrefix}-photo`}
						className="input"
						type="file"
						accept="image/png,image/jpeg,image/webp"
						onChange={(e) => onFileSelected(e.target.files?.[0] ?? null)}
					/>
				</div>
			</div>
		</div>
	);
}

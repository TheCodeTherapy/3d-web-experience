import React, {
  ForwardRefRenderFunction,
  KeyboardEvent,
  MouseEvent,
  useRef,
  useState,
} from "react";

import { AvatarType } from "../../AvatarType";
import { useClickOutside } from "../../helpers";
import AvatarIcon from "../../icons/Avatar.svg";

import styles from "./AvatarSelectionUIComponent.module.css";

type AvatarSelectionUIProps = {
  onUpdateUserAvatar: (avatar: AvatarType) => void;
  visibleByDefault?: boolean;
  availableAvatars: AvatarType[];

  characterDescription: AvatarType;
  allowCustomAvatars: boolean;

  displayName: string;
  allowCustomDisplayName: boolean;
  onUpdateDisplayName: (displayNameValue: string) => void;
};

enum CustomAvatarType {
  meshFileUrl,
  mmlUrl,
  mml,
}

function SelectedPill() {
  return <span className={styles.selectedPill}>Selected</span>;
}

export const AvatarSelectionUIComponent: ForwardRefRenderFunction<any, AvatarSelectionUIProps> = (
  props: AvatarSelectionUIProps,
) => {
  const visibleByDefault: boolean = props.visibleByDefault ?? false;
  const [isVisible, setIsVisible] = useState<boolean>(visibleByDefault);
  const [selectedAvatar, setSelectedAvatar] = useState<AvatarType | undefined>(
    props.characterDescription,
  );
  const [customAvatarType, setCustomAvatarType] = useState<CustomAvatarType>(
    CustomAvatarType.mmlUrl,
  );
  const [customAvatarValue, setCustomAvatarValue] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [displayNameValue, setDisplayNameValue] = useState<string>(props.displayName);
  const displayNameRef = useRef<HTMLInputElement>(null);

  const handleRootClick = (e: MouseEvent) => {
    e.stopPropagation();
  };

  const selectAvatar = (avatar: AvatarType) => {
    setSelectedAvatar(avatar);
    props.onUpdateUserAvatar(avatar);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setCustomAvatarValue(e.target.value);
  };

  const handleDisplayNameChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    setDisplayNameValue(e.target.value);
  };

  const setDisplayName = () => {
    if (!displayNameValue) {
      return;
    }
    props.onUpdateDisplayName(displayNameValue);
  };

  const addCustomAvatar = () => {
    if (!customAvatarValue) {
      return;
    }

    let newSelectedAvatar: AvatarType;
    switch (customAvatarType) {
      case CustomAvatarType.mml:
        newSelectedAvatar = {
          mmlCharacterString: customAvatarValue,
        };
        break;
      case CustomAvatarType.mmlUrl:
        newSelectedAvatar = {
          mmlCharacterUrl: customAvatarValue,
        };
        break;
      case CustomAvatarType.meshFileUrl:
        newSelectedAvatar = {
          meshFileUrl: customAvatarValue,
        };
        break;
    }

    setSelectedAvatar(newSelectedAvatar);
    props.onUpdateUserAvatar(newSelectedAvatar);
  };

  const handleKeyPress = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.stopPropagation();
  };

  const handleAvatarInputKeyPress = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      addCustomAvatar();
    }
  };

  const handleDisplayNameKeyPress = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      setDisplayName();
    }
  };

  const handleTypeSwitch = (type: CustomAvatarType) => {
    setCustomAvatarType(type);
    setCustomAvatarValue("");
  };

  const getPlaceholderByType = (type: CustomAvatarType) => {
    switch (type) {
      case CustomAvatarType.meshFileUrl:
        return "https://.../avatar.glb";
      case CustomAvatarType.mmlUrl:
        return "https://.../avatar.html";
      case CustomAvatarType.mml:
        return '<m-character src="https://link-to-avatar">\n</m-character';
    }
  };

  if (
    !props.availableAvatars.length &&
    !props.allowCustomAvatars &&
    !props.allowCustomDisplayName
  ) {
    return null;
  }

  let recognizedAvatar = false;

  return (
    <>
      <div className={styles.menuButton} onClick={handleRootClick}>
        {!isVisible && (
          <div className={styles.openTab} onClick={() => setIsVisible(true)}>
            <img src={`data:image/svg+xml;utf8,${encodeURIComponent(AvatarIcon)}`} />
          </div>
        )}
        {isVisible && (
          <button className={styles.closeButton} onClick={(e) => setIsVisible(false)}>
            X
          </button>
        )}
      </div>
      {isVisible && (
        <div className={`${styles.avatarSelectionContainer}`}>
          {props.allowCustomDisplayName && (
            <div className={styles.displayNameSection}>
              <div className={styles.sectionHeading}>Display Name</div>
              <div className={styles.displayNameInputSection}>
                <input
                  ref={displayNameRef}
                  className={styles.input}
                  value={displayNameValue}
                  onKeyDown={handleDisplayNameKeyPress}
                  onChange={handleDisplayNameChange}
                  placeholder={"Enter your display name"}
                />
                <button
                  className={styles.setButton}
                  disabled={!displayNameValue}
                  type="button"
                  onClick={setDisplayName}
                >
                  Set
                </button>
              </div>
            </div>
          )}
          {!!props.availableAvatars.length && (
            <div className={styles.avatarSelectionSection}>
              <div className={styles.sectionHeading}>Choose your Avatar</div>
              <div className={styles.avatarSelectionUi}>
                {props.availableAvatars.map((avatar, index) => {
                  const isSelected =
                    (selectedAvatar?.meshFileUrl &&
                      selectedAvatar?.meshFileUrl === avatar.meshFileUrl) ||
                    (selectedAvatar?.mmlCharacterUrl &&
                      selectedAvatar?.mmlCharacterUrl === avatar.mmlCharacterUrl) ||
                    (selectedAvatar?.mmlCharacterString &&
                      selectedAvatar?.mmlCharacterString === avatar.mmlCharacterString);

                  if (isSelected) {
                    recognizedAvatar = true;
                  }

                  return (
                    <div
                      key={index}
                      className={styles.avatarSelectionUiAvatar}
                      onClick={() => selectAvatar(avatar)}
                    >
                      <div className={styles.avatarSelectionUiAvatarImgContainer}>
                        {isSelected && <SelectedPill />}
                        {avatar.thumbnailUrl ? (
                          <img
                            className={styles.avatarSelectionUiAvatarImage}
                            src={avatar.thumbnailUrl}
                            alt={avatar.name}
                          />
                        ) : (
                          <div className={styles.avatarSelectionNoImage}>
                            <img
                              alt={avatar.name}
                              src={`data:image/svg+xml;utf8,${encodeURIComponent(AvatarIcon)}`}
                            />
                          </div>
                        )}
                        <p>{avatar.name}</p>
                        <span className={styles.tooltipText}>{avatar.name}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {props.allowCustomAvatars && (
            <div className={styles.customAvatarSection}>
              <div className={styles.sectionHeading}>Custom Avatar</div>
              <input
                type="radio"
                id="html"
                name="customAvatarType"
                onChange={() => handleTypeSwitch(CustomAvatarType.mmlUrl)}
                defaultChecked={customAvatarType === CustomAvatarType.mmlUrl}
                checked={customAvatarType === CustomAvatarType.mmlUrl}
              />
              <label htmlFor="html">MML URL</label>
              <input
                type="radio"
                id="mml"
                name="customAvatarType"
                onChange={() => handleTypeSwitch(CustomAvatarType.mml)}
                defaultChecked={customAvatarType === CustomAvatarType.mml}
                checked={customAvatarType === CustomAvatarType.mml}
              />
              <label htmlFor="mml">MML</label>
              <input
                type="radio"
                id="glb"
                name="customAvatarType"
                onChange={() => handleTypeSwitch(CustomAvatarType.meshFileUrl)}
                defaultChecked={customAvatarType === CustomAvatarType.meshFileUrl}
                checked={customAvatarType === CustomAvatarType.meshFileUrl}
              />
              <label htmlFor="glb">Mesh URL</label>
              {!recognizedAvatar && <SelectedPill />}
              <div className={styles.customAvatarInputSection}>
                {customAvatarType === CustomAvatarType.mml ? (
                  <textarea
                    ref={textareaRef}
                    className={styles.input}
                    value={customAvatarValue}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyPress}
                    placeholder={getPlaceholderByType(customAvatarType)}
                    rows={4}
                  />
                ) : (
                  <input
                    ref={inputRef}
                    className={styles.input}
                    value={customAvatarValue}
                    onKeyDown={handleAvatarInputKeyPress}
                    onChange={handleInputChange}
                    placeholder={getPlaceholderByType(customAvatarType)}
                  />
                )}
                <button
                  className={styles.setButton}
                  disabled={!customAvatarValue}
                  type="button"
                  onClick={addCustomAvatar}
                >
                  Set
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
};

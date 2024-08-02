import React, {
  ForwardRefRenderFunction,
  KeyboardEvent,
  MouseEvent,
  useRef,
  useState,
} from "react";

import { CustomAvatar } from "../../AvatarSelectionUI";
import { AvatarType } from "../../AvatarType";
import { useClickOutside } from "../../helpers";
import AvatarIcon from "../../icons/Avatar.svg";

import styles from "./AvatarSelectionUIComponent.module.css";

type AvatarSelectionUIProps = {
  onUpdateUserAvatar: (avatar: AvatarType) => void;
  visibleByDefault?: boolean;
  availableAvatars: AvatarType[];
  enableCustomAvatar?: boolean;
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
  const [selectedAvatar, setSelectedAvatar] = useState<CustomAvatar | undefined>(undefined);
  const [customAvatarType, setCustomAvatarType] = useState<CustomAvatarType>(
    CustomAvatarType.mmlUrl,
  );
  const [customAvatarValue, setCustomAvatarValue] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const selectionContainerRef = useClickOutside(() => {
    if (isVisible) {
      setIsVisible(false);
    }
  });

  const handleRootClick = (e: MouseEvent) => {
    e.stopPropagation();
  };

  const selectAvatar = (avatar: CustomAvatar) => {
    setSelectedAvatar(avatar);
    props.onUpdateUserAvatar(avatar);
    setTimeout(() => setIsVisible(false), 750);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setCustomAvatarValue(e.target.value);
  };

  const addCustomAvatar = () => {
    if (!customAvatarValue) {
      return;
    }

    const newSelectedAvatar = {
      mmlCharacterString: customAvatarType === CustomAvatarType.mml ? customAvatarValue : undefined,
      mmlCharacterUrl: customAvatarType === CustomAvatarType.mmlUrl ? customAvatarValue : undefined,
      meshFileUrl:
        customAvatarType === CustomAvatarType.meshFileUrl ? customAvatarValue : undefined,
      isCustomAvatar: true,
    } as CustomAvatar;

    setSelectedAvatar(newSelectedAvatar);
    props.onUpdateUserAvatar(newSelectedAvatar);
  };

  const handleKeyPress = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.stopPropagation();
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
      (
      <div
        ref={selectionContainerRef}
        className={`${styles.avatarSelectionContainer} ${isVisible ? styles.visible : styles.hidden}`}
      >
        {!!props.availableAvatars.length && (
          <div className={styles.avatarSelectionUi}>
            <div className={styles.avatarSelectionUiHeader}>
              <h2>Choose your avatar</h2>
            </div>
            <div className={styles.avatarSelectionUiContent}>
              {props.availableAvatars.map((avatar, index) => {
                const isSelected =
                  !selectedAvatar?.isCustomAvatar &&
                  ((selectedAvatar?.meshFileUrl &&
                    selectedAvatar?.meshFileUrl === avatar.meshFileUrl) ||
                    (selectedAvatar?.mmlCharacterUrl &&
                      selectedAvatar?.mmlCharacterUrl === avatar.mmlCharacterUrl) ||
                    (selectedAvatar?.mmlCharacterString &&
                      selectedAvatar?.mmlCharacterString === avatar.mmlCharacterString));

                return (
                  <div
                    key={index}
                    className={styles.avatarSelectionUiAvatar}
                    onClick={() => selectAvatar(avatar)}
                  >
                    <div className={styles.avatarSelectionUiAvatarImgContainer}>
                      {isSelected && <SelectedPill />}
                      {avatar.thumbnailUrl ? (
                        <img src={avatar.thumbnailUrl} alt={avatar.name} />
                      ) : (
                        <div>No Image Available</div>
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
        {props.enableCustomAvatar && (
          <div className={styles.customAvatarSection}>
            {!!props.availableAvatars.length && <hr />}
            <h2>Custom Avatar Section</h2>
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
            {selectedAvatar?.isCustomAvatar && <SelectedPill />}
            <div className={styles.customAvatarInputSection}>
              {customAvatarType === CustomAvatarType.mml ? (
                <textarea
                  ref={textareaRef}
                  className={styles.customAvatarInput}
                  value={customAvatarValue}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyPress}
                  placeholder={getPlaceholderByType(customAvatarType)}
                  rows={4}
                />
              ) : (
                <input
                  ref={inputRef}
                  className={styles.customAvatarInput}
                  value={customAvatarValue}
                  onKeyDown={handleKeyPress}
                  onChange={handleInputChange}
                  placeholder={getPlaceholderByType(customAvatarType)}
                />
              )}
              <button disabled={!customAvatarValue} type="button" onClick={addCustomAvatar}>
                Set
              </button>
            </div>
          </div>
        )}
      </div>
      )
    </>
  );
};

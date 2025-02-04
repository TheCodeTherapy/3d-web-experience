import * as React from "react";
import { createRef, forwardRef } from "react";
import { flushSync } from "react-dom";
import { createRoot, Root } from "react-dom/client";

import { AvatarConfiguration, AvatarType } from "./AvatarType";
import { AvatarSelectionUIComponent } from "./components/AvatarPanel/AvatarSectionUIComponent";

const ForwardedAvatarSelectionUIComponent = forwardRef(AvatarSelectionUIComponent);

export type AvatarSelectionUIProps = {
  holderElement: HTMLElement;
  visibleByDefault?: boolean;
  displayName: string;
  characterDescription: AvatarType;
  allowCustomDisplayName: boolean;
  sendIdentityUpdateToServer: (displayName: string, characterDescription: AvatarType) => void;
} & AvatarConfiguration;

export class AvatarSelectionUI {
  private root: Root;
  private appRef: React.RefObject<any> = createRef<any>();

  private wrapper = document.createElement("div");

  constructor(private config: AvatarSelectionUIProps) {
    this.config.holderElement.appendChild(this.wrapper);
    this.root = createRoot(this.wrapper);
  }

  private onUpdateUserAvatar = (avatar: AvatarType) => {
    this.config.characterDescription = avatar;
    this.config.sendIdentityUpdateToServer(this.config.displayName, avatar);
  };

  private onUpdateDisplayName = (displayName: string) => {
    this.config.displayName = displayName;
    this.config.sendIdentityUpdateToServer(displayName, this.config.characterDescription);
  };

  public updateAvatarConfig(avatarConfig: AvatarConfiguration) {
    this.config = {
      ...this.config,
      ...avatarConfig,
    };
    this.init();
  }

  public updateAllowCustomDisplayName(allowCustomDisplayName: boolean) {
    this.config = {
      ...this.config,
      allowCustomDisplayName,
    };
    this.init();
  }

  init() {
    flushSync(() =>
      this.root.render(
        <ForwardedAvatarSelectionUIComponent
          ref={this.appRef}
          onUpdateUserAvatar={this.onUpdateUserAvatar}
          onUpdateDisplayName={this.onUpdateDisplayName}
          visibleByDefault={this.config.visibleByDefault}
          displayName={this.config.displayName}
          characterDescription={this.config.characterDescription}
          availableAvatars={this.config.availableAvatars}
          allowCustomAvatars={this.config.allowCustomAvatars || false}
          allowCustomDisplayName={this.config.allowCustomDisplayName || false}
        />,
      ),
    );
  }
}

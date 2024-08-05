export type AvatarType = {
  thumbnailUrl?: string;
  name?: string;
  isDefaultAvatar?: boolean;
} & (
  | {
      meshFileUrl: string;
      mmlCharacterString?: null;
      mmlCharacterUrl?: null;
    }
  | {
      meshFileUrl?: null;
      mmlCharacterString: string;
      mmlCharacterUrl?: null;
    }
  | {
      meshFileUrl?: null;
      mmlCharacterString?: null;
      mmlCharacterUrl: string;
    }
);

export type AvatarConfiguration = {
  availableAvatars: Array<AvatarType>;
  allowCustomAvatars?: boolean;
};

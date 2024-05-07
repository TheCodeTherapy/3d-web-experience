export type AssetDescription = {
  name: string;
  asset: string;
  thumb: string;
};

export type CollectionDataType = Record<string, Array<AssetDescription>>;

export type CharacterComposition<C extends CollectionDataType> = {
  fullBody: { url: string };
  parts: Record<
    keyof C,
    {
      url: string;
    }
  >;
};

import { createMMLCharacterString } from "@mml-io/3d-web-avatar";
import { useCallback, useEffect, useState } from "react";

import { AssetDescription, CharacterComposition, CollectionDataType } from "./types";

type CharacterPartsSelectorProps<C extends CollectionDataType> = {
  collectionData: C;
  fullBodyKey: keyof C;
  onSelectingPart: (part: keyof C) => void;
  onComposedCharacter: (characterComposition: CharacterComposition<C>) => void;
};

export function CharacterPartsSelector<C extends CollectionDataType>({
  collectionData,
  fullBodyKey,
  onSelectingPart,
  onComposedCharacter,
}: CharacterPartsSelectorProps<C>) {
  const [selectedPart, setSelectedPart] = useState<string | null>(null);
  const [currentSelection, setCurrentSelection] = useState<Record<keyof C, AssetDescription>>(() =>
    Object.entries(collectionData).reduce<Record<keyof C, AssetDescription>>(
      (
        acc: Record<keyof C, AssetDescription>,
        [key, asset]: [keyof C, Array<AssetDescription>],
      ) => {
        acc[key] = asset[0];
        return acc;
      },
      {} as Record<keyof C, AssetDescription>,
    ),
  );

  const createMMLDescription = useCallback(() => {
    const fullBody = currentSelection[fullBodyKey];
    const remainingParts = Object.entries(currentSelection).filter(([key]) => key !== fullBodyKey);

    const description = createMMLCharacterString({
      base: { url: fullBody.asset },
      parts: remainingParts.map(([, assetDescription]) => {
        return { url: assetDescription.asset };
      }),
    });
    console.log(description);
  }, [currentSelection, fullBodyKey]);

  useEffect(() => {
    const fullBody = currentSelection[fullBodyKey];
    const remainingParts = Object.entries(currentSelection).filter(([key]) => key !== fullBodyKey);
    onComposedCharacter({
      fullBody: { url: fullBody.asset },
      parts: remainingParts.reduce(
        (accParts: Record<keyof C, { url: string }>, [key, asset]: [keyof C, AssetDescription]) => {
          accParts[key] = { url: asset.asset };
          return accParts;
        },
        {} as Record<keyof C, { url: string }>,
      ),
    });
    createMMLDescription();
  }, [onComposedCharacter, fullBodyKey, currentSelection, createMMLDescription]);

  const handleThumbnailClick = (part: string) => {
    onSelectingPart(part);
    setSelectedPart(part);
  };

  const handleModalThumbnailClick = (part: string, item: AssetDescription) => {
    const selectedData = item;
    setCurrentSelection((prev) => ({ ...prev, [part]: selectedData }));
    createMMLDescription();
    setSelectedPart(null);
  };

  const renderThumbnails = () => {
    return (
      <div className="left-thumbnails">
        {Object.keys(collectionData).map((part) => (
          <img
            key={part}
            src={currentSelection[part].thumb}
            alt={part}
            onClick={() => handleThumbnailClick(part as string)}
          />
        ))}
      </div>
    );
  };

  const renderModal = () => {
    if (!selectedPart) return null;

    return (
      <div className="modal">
        {collectionData[selectedPart].map((item: AssetDescription) => (
          <img
            key={item.asset}
            src={item.thumb}
            alt={item.name}
            onClick={() => handleModalThumbnailClick(selectedPart, item)}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="parts-selector-component">
      {renderThumbnails()}
      {renderModal()}
    </div>
  );
}

export default CharacterPartsSelector;

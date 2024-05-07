import type { LoadingErrors, MMLCharacterDescription } from "@mml-io/3d-web-avatar";

import { CollectionDataType } from "./types";

export function findAssetsInCollection(
  collectionData: CollectionDataType,
  currentCharacter: MMLCharacterDescription,
  previousErrors: LoadingErrors | null,
): { hasBase: boolean; hasParts: boolean; accumulatedErrors: LoadingErrors } {
  const accumulatedErrors = [...(previousErrors || [])];
  const baseExists = Object.values(collectionData).some((assets) =>
    assets.some((asset) => asset.asset === currentCharacter.base.url),
  );

  // Check for base model
  if (!baseExists) {
    const err = currentCharacter.base.url
      ? `The asset from ${currentCharacter.base.url} could not be found in the collection.`
      : "This MML document doesn't provide a valid character base model.";
    if (!accumulatedErrors.includes(err)) accumulatedErrors.push(err);
  }

  // Check for existent parts
  const partsExist = currentCharacter.parts.map((part) => {
    const partExists = Object.values(collectionData).some((assets) =>
      assets.some((asset) => asset.asset === part.url),
    );
    if (!partExists) {
      const err = `The asset from ${part.url} could not be found in the collection.`;
      if (!accumulatedErrors.includes(err)) accumulatedErrors.push(err);
    }
    return partExists;
  });

  // Check if at least one part exists
  const anyPartExists = partsExist.some((exists) => exists);

  return {
    hasBase: baseExists,
    hasParts: anyPartExists,
    accumulatedErrors: accumulatedErrors,
  };
}

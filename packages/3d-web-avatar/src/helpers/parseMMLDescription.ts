export type MMLCharacterDescriptionPart = {
  url: string;
  type?: string;
  socket?: {
    socket: string;
    position: { x: number; y: number; z: number };
    scale: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
  };
};

export type MMLCharacterDescription = {
  base: MMLCharacterDescriptionPart;
  parts: MMLCharacterDescriptionPart[];
};

export type LoadingErrors = string[];

export const parseMMLDescription = (
  mmlDescription: string,
): [MMLCharacterDescription, LoadingErrors] => {
  const parser: DOMParser = new DOMParser();
  const doc = parser.parseFromString(mmlDescription, "text/html");

  const tag = (count: number) => {
    return count > 1 ? "tags" : "tag";
  };

  const errors: string[] = [];

  const warn = (errorMessage: string) => {
    errors.push(errorMessage);
    console.warn(errorMessage);
  };

  const characters = Array.from(doc.body.children).filter(
    (child) => child.tagName.toLowerCase() === "m-character",
  );
  const validCharacter = characters.shift();

  if (characters.length > 0) {
    const tagStr = tag(characters.length);
    warn(
      `ignoring ${characters.length} extra <m-character> ${tagStr} found in the root of the document (only the first one is valid).`,
    );
  }

  const nestedCharacters = doc.querySelectorAll("body * m-character");
  if (nestedCharacters.length > 0) {
    const tagStr = tag(nestedCharacters.length);
    warn(
      `ignoring ${nestedCharacters.length} nested <m-character> ${tagStr} found within other tags. A valid <m-character> tag must be at the root of the document.`,
    );
  }

  const rootModels = Array.from(doc.body.children).filter(
    (child) => child.tagName.toLowerCase() === "m-model",
  );
  if (rootModels.length > 0) {
    const tagStr = tag(rootModels.length);
    warn(
      `ignoring ${rootModels.length} <m-model> ${tagStr} were found at the root of the document (<m-model> tags must be children of a valid <m-character> tag).`,
    );
  }

  let base: MMLCharacterDescriptionPart = { url: "" };
  let parts: MMLCharacterDescriptionPart[] = [];

  if (validCharacter) {
    const baseSrc = validCharacter.getAttribute("src") ?? "";
    base = { url: baseSrc };

    const directModelChildren = Array.from(validCharacter.children).filter(
      (child) => child.tagName.toLowerCase() === "m-model",
    );
    parts = directModelChildren.map((model) => {
      const partSrc = model.getAttribute("src") ?? "";

      const socketAttr = model.getAttribute("socket");
      const position = {
        x: parseFloat(model.getAttribute("x") ?? "0") || 0,
        y: parseFloat(model.getAttribute("y") ?? "0") || 0,
        z: parseFloat(model.getAttribute("z") ?? "0") || 0,
      };
      const scale = {
        x: parseFloat(model.getAttribute("sx") ?? "1") || 1,
        y: parseFloat(model.getAttribute("sy") ?? "1") || 1,
        z: parseFloat(model.getAttribute("sz") ?? "1") || 1,
      };
      const rotation = {
        x: parseFloat(model.getAttribute("rx") ?? "0") || 0,
        y: parseFloat(model.getAttribute("ry") ?? "0") || 0,
        z: parseFloat(model.getAttribute("rz") ?? "0") || 0,
      };

      const socketObj = socketAttr ? { socket: socketAttr, position, scale, rotation } : undefined;

      return { url: partSrc, socket: socketObj };
    });

    const wrappedModelTags = Array.from(doc.querySelectorAll("m-character m-model")).filter(
      (model) => !directModelChildren.includes(model),
    );
    if (wrappedModelTags.length > 0) {
      const tagStr = tag(wrappedModelTags.length);
      warn(
        `ignoring ${wrappedModelTags.length} <m-model> ${tagStr} that were found wrapped inside tags other than a valid <m-character> tag.`,
      );
    }
  } else {
    warn(`No valid <m-character> tag was found in the provided document.`);
  }

  const characterDescription: MMLCharacterDescription = {
    base: base,
    parts: parts,
  };

  return [characterDescription, errors];
};

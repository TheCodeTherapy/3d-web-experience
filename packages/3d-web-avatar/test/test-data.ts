export const validMCharacter = `
<m-character src="/assets/avatar/parts/SK_Outfit_Body_Male.glb">
  <m-model src="/assets/avatar/parts/SK_Outfit_Hat_02.glb"></m-model>
  <m-model src="/assets/avatar/parts/SK_Outfit_Two_Long_Coat_with_Collared_Shirt_01.glb"></m-model>
  <m-model src="/assets/avatar/parts/SK_Outfit_Three_Tight_Jeans_with_Chain_01.glb"></m-model>
  <m-model src="/assets/avatar/parts/SK_Outfit_One_High_Tops_01.glb"></m-model>
</m-character>
`;

export const threeNestedMCharacters = `
<m-character src="/assets/avatar/parts/SK_Outfit_Body_Male.glb">
  <m-model src="/assets/avatar/parts/SK_Outfit_Hat_02.glb"></m-model>
  <m-model src="/assets/avatar/parts/SK_Outfit_Two_Long_Coat_with_Collared_Shirt_01.glb"></m-model>
  <m-model src="/assets/avatar/parts/SK_Outfit_Three_Tight_Jeans_with_Chain_01.glb"></m-model>
  <m-model src="/assets/avatar/parts/SK_Outfit_One_High_Tops_01.glb"></m-model>

  <m-character src="/assets/avatar/parts/SK_Outfit_Body_Male.glb">
    <m-model src="/assets/avatar/parts/SK_Outfit_Hat_02.glb"></m-model>
    <m-model src="/assets/avatar/parts/SK_Outfit_One_High_Tops_01.glb"></m-model>
  </m-character>

  <m-character src="/assets/avatar/parts/SK_Outfit_Body_Male.glb">
    <m-model src="/assets/avatar/parts/SK_Outfit_Hat_02.glb"></m-model>
    <m-model src="/assets/avatar/parts/SK_Outfit_One_High_Tops_01.glb"></m-model>
  </m-character>

  <m-character src="/assets/avatar/parts/SK_Outfit_Body_Male.glb">
    <m-model src="/assets/avatar/parts/SK_Outfit_Hat_02.glb"></m-model>
    <m-model src="/assets/avatar/parts/SK_Outfit_One_High_Tops_01.glb"></m-model>
  </m-character>
</m-character>
`;

export const threeNestedMCharactersExpectedData = {
  base: { url: "/assets/avatar/parts/SK_Outfit_Body_Male.glb" },
  parts: [
    { url: "/assets/avatar/parts/SK_Outfit_Hat_02.glb", socket: undefined },
    {
      url: "/assets/avatar/parts/SK_Outfit_Two_Long_Coat_with_Collared_Shirt_01.glb",
      socket: undefined,
    },
    {
      url: "/assets/avatar/parts/SK_Outfit_Three_Tight_Jeans_with_Chain_01.glb",
      socket: undefined,
    },
    { url: "/assets/avatar/parts/SK_Outfit_One_High_Tops_01.glb", socket: undefined },
  ],
};

export const threeRogueMModels = `
<m-character src="/assets/avatar/parts/SK_Outfit_Body_Male.glb">
  <m-model src="/assets/avatar/parts/SK_Outfit_Hat_02.glb"></m-model>
  <m-model src="/assets/avatar/parts/SK_Outfit_Two_Long_Coat_with_Collared_Shirt_01.glb"></m-model>
  <m-model src="/assets/avatar/parts/SK_Outfit_Three_Tight_Jeans_with_Chain_01.glb"></m-model>
  <m-model src="/assets/avatar/parts/SK_Outfit_One_High_Tops_01.glb"></m-model>
</m-character>
<m-model src="/assets/avatar/parts/SK_Outfit_One_High_Tops_01.glb"></m-model>
<m-model src="/assets/avatar/parts/SK_Outfit_One_High_Tops_01.glb"></m-model>
<m-model src="/assets/avatar/parts/SK_Outfit_One_High_Tops_01.glb"></m-model>
`;

export const threeRogueMModelsExpectedData = {
  base: { url: "/assets/avatar/parts/SK_Outfit_Body_Male.glb" },
  parts: [
    { url: "/assets/avatar/parts/SK_Outfit_Hat_02.glb", socket: undefined },
    {
      url: "/assets/avatar/parts/SK_Outfit_Two_Long_Coat_with_Collared_Shirt_01.glb",
      socket: undefined,
    },
    {
      url: "/assets/avatar/parts/SK_Outfit_Three_Tight_Jeans_with_Chain_01.glb",
      socket: undefined,
    },
    { url: "/assets/avatar/parts/SK_Outfit_One_High_Tops_01.glb", socket: undefined },
  ],
};

export const twoRedundantMCharacterswithThreeMModelsEach = `
<m-character src="/assets/avatar/parts/SK_Outfit_Body_Male.glb">
  <m-model src="/assets/avatar/parts/SK_Outfit_Hat_02.glb"></m-model>
  <m-model src="/assets/avatar/parts/SK_Outfit_Two_Long_Coat_with_Collared_Shirt_01.glb"></m-model>
  <m-model src="/assets/avatar/parts/SK_Outfit_Three_Tight_Jeans_with_Chain_01.glb"></m-model>
  <m-model src="/assets/avatar/parts/SK_Outfit_One_High_Tops_01.glb"></m-model>
</m-character>
<m-character src="/assets/avatar/parts/SK_Outfit_Body_Male.glb">
  <m-model src="/assets/avatar/parts/SK_Outfit_Two_Long_Coat_with_Collared_Shirt_01.glb"></m-model>
  <m-model src="/assets/avatar/parts/SK_Outfit_Three_Tight_Jeans_with_Chain_01.glb"></m-model>
  <m-model src="/assets/avatar/parts/SK_Outfit_One_High_Tops_01.glb"></m-model>
</m-character>
<m-character src="/assets/avatar/parts/SK_Outfit_Body_Male.glb">
  <m-model src="/assets/avatar/parts/SK_Outfit_Two_Long_Coat_with_Collared_Shirt_01.glb"></m-model>
  <m-model src="/assets/avatar/parts/SK_Outfit_Three_Tight_Jeans_with_Chain_01.glb"></m-model>
  <m-model src="/assets/avatar/parts/SK_Outfit_One_High_Tops_01.glb"></m-model>
</m-character>
`;

export const twoRedundantMCharacterswithThreeMModelsEachExpectedData = {
  base: { url: "/assets/avatar/parts/SK_Outfit_Body_Male.glb" },
  parts: [
    { url: "/assets/avatar/parts/SK_Outfit_Hat_02.glb", socket: undefined },
    {
      url: "/assets/avatar/parts/SK_Outfit_Two_Long_Coat_with_Collared_Shirt_01.glb",
      socket: undefined,
    },
    {
      url: "/assets/avatar/parts/SK_Outfit_Three_Tight_Jeans_with_Chain_01.glb",
      socket: undefined,
    },
    { url: "/assets/avatar/parts/SK_Outfit_One_High_Tops_01.glb", socket: undefined },
  ],
};

export const twoInvalidlyWrappedMModel = `
<m-character src="/assets/avatar/parts/SK_Outfit_Body_Male.glb">
  <m-model src="/assets/avatar/parts/SK_Outfit_Hat_02.glb"></m-model>
  <m-model src="/assets/avatar/parts/SK_Outfit_Two_Long_Coat_with_Collared_Shirt_adsfadsfasdfda01.glb"></m-model>
  <div>
    <m-model src="/assets/avatar/parts/SK_Outfit_Three_Tight_Jeans_with_Chain_01.glb"></m-model>
    <m-model src="/assets/avatar/parts/SK_Outfit_Three_Tight_Jeans_with_Chain_01.glb"></m-model>
  </div>
  <m-model src="/assets/avatar/parts/SK_Outfit_Three_Tight_Jeans_with_Chain_01.glb"></m-model>
</m-character>
`;

export const twoInvalidlyWrappedMModelExpectedData = {
  base: { url: "/assets/avatar/parts/SK_Outfit_Body_Male.glb" },
  parts: [
    { url: "/assets/avatar/parts/SK_Outfit_Hat_02.glb", socket: undefined },
    {
      url: "/assets/avatar/parts/SK_Outfit_Two_Long_Coat_with_Collared_Shirt_adsfadsfasdfda01.glb",
      socket: undefined,
    },
    {
      url: "/assets/avatar/parts/SK_Outfit_Three_Tight_Jeans_with_Chain_01.glb",
      socket: undefined,
    },
  ],
};

export const twoInvalidlyWrappedMModelOnInvalidMCharacterWith2ValidMModels = `
<m-character src="/assets/avatar/parts/SK_Outfit_Body_Male.glb">
  <m-model src="/assets/avatar/parts/SK_Outfit_Hat_02.glb"></m-model>
  <m-model src="/assets/avatar/parts/SK_Outfit_Two_Long_Coat_with_Collared_Shirt_adsfadsfasdfda01.glb"></m-model>
  <m-model src="/assets/avatar/parts/SK_Outfit_Three_Tight_Jeans_with_Chain_01.glb"></m-model>
  <m-model src="/assets/avatar/parts/SK_Outfit_Three_Tight_Jeans_with_Chain_01.glb"></m-model>
</m-character>

<m-character src="/assets/avatar/parts/SK_Outfit_Body_Male.glb">
  <m-model src="/assets/avatar/parts/SK_Outfit_Hat_02.glb"></m-model>
  <div>
    <m-model src="/assets/avatar/parts/SK_Outfit_Three_Tight_Jeans_with_Chain_01.glb"></m-model>
    <m-model src="/assets/avatar/parts/SK_Outfit_Three_Tight_Jeans_with_Chain_01.glb"></m-model>
  </div>
  <m-model src="/assets/avatar/parts/SK_Outfit_Two_Long_Coat_with_Collared_Shirt_adsfadsfasdfda01.glb"></m-model>
</m-character>
`;

export const twoInvalidlyWrappedMModelOnInvalidMCharacterWith2ValidMModelsExpectedData = {
  base: { url: "/assets/avatar/parts/SK_Outfit_Body_Male.glb" },
  parts: [
    { url: "/assets/avatar/parts/SK_Outfit_Hat_02.glb", socket: undefined },
    {
      url: "/assets/avatar/parts/SK_Outfit_Two_Long_Coat_with_Collared_Shirt_adsfadsfasdfda01.glb",
      socket: undefined,
    },
    {
      url: "/assets/avatar/parts/SK_Outfit_Three_Tight_Jeans_with_Chain_01.glb",
      socket: undefined,
    },
    {
      url: "/assets/avatar/parts/SK_Outfit_Three_Tight_Jeans_with_Chain_01.glb",
      socket: undefined,
    },
  ],
};

export const validMCharacterWithOneInvalidMModel = `
<m-character src="/assets/avatar/parts/SK_Outfit_Body_Male.glb">
  <m-model src="/assets/avatar/parts/SK_Outfit_Hat_02.glb"></m-model>
  <m-model src="/assets/avatar/parts/abcdefg0123456_invalid_asset.glb"></m-model>
</m-character>
`;

export const validMCharacterWithTwoInvalidMModels = `
<m-character src="/assets/avatar/parts/SK_Outfit_Body_Male.glb">
  <m-model src="/assets/avatar/parts/SK_Outfit_Hat_02.glb"></m-model>
  <m-model src="/assets/avatar/parts/abcdefg0123456_invalid_asset.glb"></m-model>
  <m-model src="/assets/avatar/parts/hijklmn7890123_invalid_asset.glb"></m-model>
</m-character>
`;

export const semanticallyInvalidString = `
  $>>!&n0tEvEnHtMl
`;

export const validMCharacterWithRedundantMModelClosingTag = `
<m-character src="/assets/avatar/parts/SK_Outfit_Body_Male.glb">
  <m-model src="/assets/avatar/parts/SK_Outfit_Hat_02.glb"></m-model>
  <m-model src="/assets/avatar/parts/SK_Outfit_Two_Long_Coat_with_Collared_Shirt_01.glb"></m-model></m-model>
  <m-model src="/assets/avatar/parts/SK_Outfit_Three_Tight_Jeans_with_Chain_01.glb"></m-model>
  <m-model src="/assets/avatar/parts/SK_Outfit_One_High_Tops_01.glb"></m-model>
</m-character>
`;

export const validMCharacterWithRedundantMModelClosingTagExpectedData = {
  base: { url: "/assets/avatar/parts/SK_Outfit_Body_Male.glb" },
  parts: [
    { url: "/assets/avatar/parts/SK_Outfit_Hat_02.glb", socket: undefined },
    {
      url: "/assets/avatar/parts/SK_Outfit_Two_Long_Coat_with_Collared_Shirt_01.glb",
      socket: undefined,
    },
    {
      url: "/assets/avatar/parts/SK_Outfit_Three_Tight_Jeans_with_Chain_01.glb",
      socket: undefined,
    },
    { url: "/assets/avatar/parts/SK_Outfit_One_High_Tops_01.glb", socket: undefined },
  ],
};

export const validMCharacterWithRedundantMCharacterClosingTag = `
<m-character src="/assets/avatar/parts/SK_Outfit_Body_Male.glb">
  <m-model src="/assets/avatar/parts/SK_Outfit_Hat_02.glb"></m-model>
  <m-model src="/assets/avatar/parts/SK_Outfit_Two_Long_Coat_with_Collared_Shirt_01.glb"></m-model>
  <m-model src="/assets/avatar/parts/SK_Outfit_Three_Tight_Jeans_with_Chain_01.glb"></m-model>
  <m-model src="/assets/avatar/parts/SK_Outfit_One_High_Tops_01.glb"></m-model>
</m-character></m-character>
`;

export const validMCharacterWithRedundantMCharacterClosingTagExpectedData = {
  base: { url: "/assets/avatar/parts/SK_Outfit_Body_Male.glb" },
  parts: [
    { url: "/assets/avatar/parts/SK_Outfit_Hat_02.glb", socket: undefined },
    {
      url: "/assets/avatar/parts/SK_Outfit_Two_Long_Coat_with_Collared_Shirt_01.glb",
      socket: undefined,
    },
    {
      url: "/assets/avatar/parts/SK_Outfit_Three_Tight_Jeans_with_Chain_01.glb",
      socket: undefined,
    },
    { url: "/assets/avatar/parts/SK_Outfit_One_High_Tops_01.glb", socket: undefined },
  ],
};

export const validMCharacterWithSocketAttributes = `
<m-character src="/assets/avatar/parts/SK_Outfit_Body_Male.glb">
  <m-model
    src="/assets/avatar/parts/SK_Outfit_Hat_02.glb"
    socket="head"
    x="0" y="0" z="0"
    sx="1" sy="1" sz="1"
    rx="0" ry="0" rz="0"
  ></m-model>
  <m-model
    src="/assets/avatar/parts/SK_Outfit_Two_Long_Coat_with_Collared_Shirt_01.glb"
    socket="left-hand"
    x="1" y="1" z="1"
    sx="1.5" sy="1.5" sz="1.5"
    rx="45" ry="45" rz="45"
  ></m-model>
</m-character>
`;

export const validMCharacterWithSocketAttributesExpectedData = {
  base: { url: "/assets/avatar/parts/SK_Outfit_Body_Male.glb" },
  parts: [
    {
      url: "/assets/avatar/parts/SK_Outfit_Hat_02.glb",
      socket: {
        socket: "head",
        position: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        rotation: { x: 0, y: 0, z: 0 },
      },
    },
    {
      url: "/assets/avatar/parts/SK_Outfit_Two_Long_Coat_with_Collared_Shirt_01.glb",
      socket: {
        socket: "left-hand",
        position: { x: 1, y: 1, z: 1 },
        scale: { x: 1.5, y: 1.5, z: 1.5 },
        rotation: { x: 45, y: 45, z: 45 },
      },
    },
  ],
};

export const validMCharacterWithSocketAndPosition = `
<m-character src="/assets/avatar/parts/SK_Outfit_Body_Male.glb">
  <m-model
    src="/assets/avatar/parts/SK_Outfit_Hat_02.glb"
    socket="head"
    x="2" y="3" z="4"
  ></m-model>
</m-character>
`;

export const validMCharacterWithSocketAndPositionExpectedData = {
  base: { url: "/assets/avatar/parts/SK_Outfit_Body_Male.glb" },
  parts: [
    {
      url: "/assets/avatar/parts/SK_Outfit_Hat_02.glb",
      socket: {
        socket: "head",
        position: { x: 2, y: 3, z: 4 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
    },
  ],
};

export const validMCharacterWithSocketAndRotationInOneAxis = `
<m-character src="/assets/avatar/parts/SK_Outfit_Body_Male.glb">
  <m-model socket="head" src="/assets/avatar/parts/SK_Outfit_Hat_02.glb" ry="20"></m-model>
</m-character>
`;

export const validMCharacterWithSocketAndRotationInOneAxisExpectedData = {
  base: { url: "/assets/avatar/parts/SK_Outfit_Body_Male.glb" },
  parts: [
    {
      url: "/assets/avatar/parts/SK_Outfit_Hat_02.glb",
      socket: {
        socket: "head",
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 20, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
    },
  ],
};

export const validMCharacterWithNoSocket = `
<m-character src="/assets/avatar/parts/SK_Outfit_Body_Male.glb">
  <m-model
    src="/assets/avatar/parts/SK_Outfit_Hat_02.glb"
    x="0" y="0" z="0"
    sx="1" sy="2" sz="3"
    rx="0" ry="180" rz="0"
  ></m-model>
</m-character>
`;

export const validMCharacterWithNoSocketExpectedData = {
  base: { url: "/assets/avatar/parts/SK_Outfit_Body_Male.glb" },
  parts: [
    {
      url: "/assets/avatar/parts/SK_Outfit_Hat_02.glb",
      socket: undefined,
    },
  ],
};

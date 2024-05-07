/**
 * @jest-environment jsdom
 */

import { parseMMLDescription } from "@mml-io/3d-web-avatar/src/helpers/parseMMLDescription";
import { findAssetsInCollection } from "@mml-io/3d-web-avatar-editor-ui/src/findAssetsInCollection";

import collectionData from "./collection.json";
import {
  semanticallyInvalidString,
  threeNestedMCharacters,
  threeNestedMCharactersExpectedData,
  threeRogueMModels,
  threeRogueMModelsExpectedData,
  twoInvalidlyWrappedMModel,
  twoInvalidlyWrappedMModelExpectedData,
  twoInvalidlyWrappedMModelOnInvalidMCharacterWith2ValidMModels,
  twoInvalidlyWrappedMModelOnInvalidMCharacterWith2ValidMModelsExpectedData,
  twoRedundantMCharacterswithThreeMModelsEach,
  twoRedundantMCharacterswithThreeMModelsEachExpectedData,
  validMCharacter,
  validMCharacterWithSocketAttributes,
  validMCharacterWithSocketAttributesExpectedData,
  validMCharacterWithOneInvalidMModel,
  validMCharacterWithRedundantMCharacterClosingTag,
  validMCharacterWithRedundantMCharacterClosingTagExpectedData,
  validMCharacterWithRedundantMModelClosingTag,
  validMCharacterWithRedundantMModelClosingTagExpectedData,
  validMCharacterWithTwoInvalidMModels,
  validMCharacterWithSocketAndPosition,
  validMCharacterWithSocketAndPositionExpectedData,
  validMCharacterWithSocketAndRotationInOneAxis,
  validMCharacterWithSocketAndRotationInOneAxisExpectedData,
  validMCharacterWithNoSocket,
  validMCharacterWithNoSocketExpectedData,
} from "./test-data";
import { extractNumberFromErrorMessage } from "./test-utils";

describe("WebAvatarClient Test Utils", () => {
  it("extractNumberFromErrorMessage should extract the number correctly from the error message", () => {
    let err = "ignoring 1 <m-model> tag that were found..";
    expect(extractNumberFromErrorMessage(err)).toBe(1);
    err = "ignoring 4 <m-model> tags that were found..";
    expect(extractNumberFromErrorMessage(err)).toBe(4);
    err = "ignoring 8 <m-character> tags that were found...";
    expect(extractNumberFromErrorMessage(err)).toBe(8);
  });
});

describe("WebAvatarClient MML Parsing", () => {
  test("valid <m-character> tag", async () => {
    const [, errors] = parseMMLDescription(validMCharacter);
    expect(errors).toHaveLength(0);
  });

  test("empty MML document should return one 'no valid tag found' error", async () => {
    const emptyDocument = "";
    const expectedData = { base: { url: "" }, parts: [] };
    const [parsedData, errors] = parseMMLDescription(emptyDocument);
    expect(errors).toHaveLength(1);
    expect(
      errors[0].includes("No valid <m-character> tag was found in the provided document."),
    ).toBe(true);
    expect(parsedData).toStrictEqual(expectedData);
  });

  test("2 redundant <m-character> tags with 3 <m-model> tags each", async () => {
    const [parsedData, errors] = parseMMLDescription(twoRedundantMCharacterswithThreeMModelsEach);
    expect(errors).toHaveLength(2);
    expect(extractNumberFromErrorMessage(errors[0])).toBe(2);
    expect(extractNumberFromErrorMessage(errors[1])).toBe(6);
    expect(parsedData).toStrictEqual(twoRedundantMCharacterswithThreeMModelsEachExpectedData);
  });

  test("3 nested <m-character> tags with 2 <m-model> tags each", async () => {
    const [parsedData, errors] = parseMMLDescription(threeNestedMCharacters);
    expect(errors).toHaveLength(2);
    expect(extractNumberFromErrorMessage(errors[0])).toBe(3);
    expect(extractNumberFromErrorMessage(errors[1])).toBe(6);
    expect(parsedData).toStrictEqual(threeNestedMCharactersExpectedData);
  });

  test("3 rogue <m-model> tags", async () => {
    const [parsedData, errors] = parseMMLDescription(threeRogueMModels);
    expect(errors).toHaveLength(1);
    expect(errors[0].includes("<m-model> tags must be children of a valid <m-character> tag")).toBe(
      true,
    );
    expect(extractNumberFromErrorMessage(errors[0])).toBe(3);
    expect(parsedData).toStrictEqual(threeRogueMModelsExpectedData);
  });

  test("2 invalidly wrapped <m-model> tags in a valid <m-character> tag", async () => {
    const [parsedData, errors] = parseMMLDescription(twoInvalidlyWrappedMModel);
    expect(errors).toHaveLength(1);
    expect(extractNumberFromErrorMessage(errors[0])).toBe(2);
    expect(parsedData).toStrictEqual(twoInvalidlyWrappedMModelExpectedData);
  });

  test("2 invalidly wrapped <m-model> tags in an invalid <m-character> tag", async () => {
    const [parsedData, errors] = parseMMLDescription(
      twoInvalidlyWrappedMModelOnInvalidMCharacterWith2ValidMModels,
    );
    expect(errors).toHaveLength(2);
    expect(errors[0].includes("only the first one is valid")).toBe(true);
    expect(extractNumberFromErrorMessage(errors[1])).toBe(4);
    expect(parsedData).toStrictEqual(
      twoInvalidlyWrappedMModelOnInvalidMCharacterWith2ValidMModelsExpectedData,
    );
  });

  test("valid <m-character> but with redundant <m-model> closing tag", async () => {
    const [parsedData, errors] = parseMMLDescription(validMCharacterWithRedundantMModelClosingTag);
    expect(errors).toHaveLength(0);
    expect(parsedData).toStrictEqual(validMCharacterWithRedundantMModelClosingTagExpectedData);
  });

  test("valid <m-character> but with redundant <m-character> closing tag", async () => {
    const [parsedData, errors] = parseMMLDescription(
      validMCharacterWithRedundantMCharacterClosingTag,
    );
    expect(errors).toHaveLength(0);
    expect(parsedData).toStrictEqual(validMCharacterWithRedundantMCharacterClosingTagExpectedData);
  });

  test("semantically invalid string should return one 'no valid tag found' error", async () => {
    const [parsedData, errors] = parseMMLDescription(semanticallyInvalidString);
    const expectedData = { base: { url: "" }, parts: [] };
    expect(errors).toHaveLength(1);
    expect(
      errors[0].includes("No valid <m-character> tag was found in the provided document."),
    ).toBe(true);
    expect(parsedData).toStrictEqual(expectedData);
  });
});

describe("Check <m-character> against collection", () => {
  test("valid <m-character> tag with 1 invalid <m-model> asset", async () => {
    const [characterDescription, parsingErrors] = parseMMLDescription(
      validMCharacterWithOneInvalidMModel,
    );
    expect(parsingErrors).toHaveLength(0);
    const checkCollection = findAssetsInCollection(
      collectionData,
      characterDescription,
      parsingErrors,
    );
    expect(checkCollection.accumulatedErrors).toHaveLength(1);
  });

  test("valid <m-character> tag with 2 invalid <m-model> asset", async () => {
    const [characterDescription, parsingErrors] = parseMMLDescription(
      validMCharacterWithTwoInvalidMModels,
    );
    expect(parsingErrors).toHaveLength(0);
    const checkCollection = findAssetsInCollection(
      collectionData,
      characterDescription,
      parsingErrors,
    );
    expect(checkCollection.accumulatedErrors).toHaveLength(2);
  });
});

describe("Check <m-character> with socketed <m-model> objects", () => {
  test("valid <m-character> tag with <m-model> socket attributes", async () => {
    const [parsedData, errors] = parseMMLDescription(validMCharacterWithSocketAttributes);
    expect(errors).toHaveLength(0);
    expect(parsedData).toStrictEqual(validMCharacterWithSocketAttributesExpectedData);
  });
  test("valid <m-character> with only position attributes", async () => {
    const [parsedData, errors] = parseMMLDescription(validMCharacterWithSocketAndPosition);
    expect(errors).toHaveLength(0);
    expect(parsedData).toStrictEqual(validMCharacterWithSocketAndPositionExpectedData);
  });

  test("valid <m-character> with rotation in only one axis", async () => {
    const [parsedData, errors] = parseMMLDescription(validMCharacterWithSocketAndRotationInOneAxis);
    expect(errors).toHaveLength(0);
    expect(parsedData).toStrictEqual(validMCharacterWithSocketAndRotationInOneAxisExpectedData);
  });

  test("valid <m-character> with no socket attribute", async () => {
    const [parsedData, errors] = parseMMLDescription(validMCharacterWithNoSocket);
    expect(errors).toHaveLength(0);
    expect(parsedData).toStrictEqual(validMCharacterWithNoSocketExpectedData);
  });
});

import { CharacterDescription } from "./UserNetworkingMessages";

export type UserData = {
  username: string | null;
  characterDescription: CharacterDescription | null;
  colors: Array<[number, number, number]> | null;
};

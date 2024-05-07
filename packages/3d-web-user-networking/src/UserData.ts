import { CharacterDescription } from "./UserNetworkingMessages";

export type UserData = {
  readonly username: string;
  readonly characterDescription: CharacterDescription;
};

export enum AnimationState {
  "idle" = 0,
  "walking" = 1,
  "running" = 2,
  "jumpToAir" = 3,
  "air" = 4,
  "airToGround" = 5,
}

export type CharacterState = {
  id: number;
  position: {
    x: number;
    y: number;
    z: number;
  };
  rotation: {
    quaternionY: number;
    quaternionW: number;
  };
  state: AnimationState;
};

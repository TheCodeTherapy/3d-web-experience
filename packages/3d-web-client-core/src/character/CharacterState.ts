export enum AnimationState {
  "idle" = 0,
  "walking" = 1,
  "running" = 2,
  "jumpToAir" = 3,
  "air" = 4,
  "airToGround" = 5,
  "doubleJump" = 6,
  "slide" = 7,
}

export type CharacterState = {
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

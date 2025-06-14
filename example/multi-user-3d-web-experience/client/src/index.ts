import { AnimationConfig, AnimationSettings } from "@mml-io/3d-web-client-core";
import { Networked3dWebExperienceClient } from "@mml-io/3d-web-experience-client";

import hdrNightJpgUrl from "../../../assets/hdr/moonless_golf_8k.jpg";
import hdrJpgUrl from "../../../assets/hdr/puresky_2k.jpg";
import loadingBackground from "../../../assets/images/3d-web-experience.webp";
import airAnimationFileUrl from "../../../assets/models/anim_air.glb";
import altFrontFlipFileUrl from "../../../assets/models/anim_alt_frontflip.glb";
import backFlipFileUrl from "../../../assets/models/anim_backflip.glb";
import frontFlipFileUrl from "../../../assets/models/anim_frontflip.glb";
import idleAnimationFileUrl from "../../../assets/models/anim_idle.glb";
import jogAnimationFileUrl from "../../../assets/models/anim_jog.glb";
import sprintAnimationFileUrl from "../../../assets/models/anim_run.glb";

const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const host = window.location.host;
const userNetworkAddress = `${protocol}//${host}/network`;
const chatNetworkAddress = `${protocol}//${host}/chat-network`;
const voiceNetworkAddress = `${window.location.protocol}//${host}/livekit-voice-token`;

const useBackFlip = true;
const useAltFrontFlip = false;
const useNight = false;

const doubleJumpAnimationFileUrl = useBackFlip
  ? backFlipFileUrl
  : useAltFrontFlip
    ? altFrontFlipFileUrl
    : frontFlipFileUrl;

const idleAnimationSettings: AnimationSettings = {
  fileUrl: idleAnimationFileUrl,
  loop: true,
  discardNonRotationTransform: false,
  playbackSpeed: 1.0,
};

const jogAnimationSettings: AnimationSettings = {
  fileUrl: jogAnimationFileUrl,
  loop: true,
  discardNonRotationTransform: false,
  playbackSpeed: 1.0,
};

const sprintAnimationSettings: AnimationSettings = {
  fileUrl: sprintAnimationFileUrl,
  loop: true,
  discardNonRotationTransform: false,
  playbackSpeed: 1.0,
};

const airAnimationSettings: AnimationSettings = {
  fileUrl: airAnimationFileUrl,
  loop: true,
  discardNonRotationTransform: true,
  playbackSpeed: 1.0,
};

const doubleJumpAnimationSettings: AnimationSettings = {
  fileUrl: doubleJumpAnimationFileUrl,
  loop: false,
  discardNonRotationTransform: true,
  playbackSpeed: 1.42,
};

const animationConfig: AnimationConfig = {
  idleAnimation: idleAnimationSettings,
  jogAnimation: jogAnimationSettings,
  sprintAnimation: sprintAnimationSettings,
  airAnimation: airAnimationSettings,
  doubleJumpAnimation: doubleJumpAnimationSettings,
};

const holder = Networked3dWebExperienceClient.createFullscreenHolder();
const app = new Networked3dWebExperienceClient(holder, {
  sessionToken: (window as any).SESSION_TOKEN,
  userNetworkAddress,
  chatNetworkAddress,
  voiceChatAddress: voiceNetworkAddress,
  animationConfig,
  mmlDocuments: { example: { url: `${protocol}//${host}/mml-documents/playground.html` } },
  environmentConfiguration: {
    skybox: {
      hdrJpgUrl: useNight ? hdrNightJpgUrl : hdrJpgUrl,
    },
    fog: {
      fogNear: 12,
      fogFar: 180,
      fogColor: { r: 0.6, g: 0.6, b: 0.6 },
    },
    groundPlane: true,
    groundPlaneType: "grass",
  },
  avatarConfiguration: {
    availableAvatars: [
      {
        name: "Bot",
        meshFileUrl: "/assets/models/bot.glb",
        thumbnailUrl: "/assets/models/thumbs/bot.jpg",
      },
      {
        name: "Hat Socket",
        mmlCharacterString: `
          <m-character src="/assets/models/bot.glb">
            <m-model rz="-90" sx="1.01" sy="1.01" sz="1.01" x="0.025" z="-0.01" socket="head" src="/assets/models/hat.glb"></m-model>
          </m-character>
        `,
        thumbnailUrl: "/assets/models/thumbs/hat_bot.jpg",
      },
      {
        name: "Ninja",
        meshFileUrl: "/assets/models/ninja.glb",
        thumbnailUrl: "/assets/models/thumbs/ninja.jpg",
      },
      {
        name: "Toon Boy",
        meshFileUrl: "/assets/models/cartoon_boy.glb",
        thumbnailUrl: "/assets/models/thumbs/cartoon_boy.jpg",
      },
      {
        name: "MML Parts",
        mmlCharacterString: `
          <m-character src="/assets/models/mml_body_male.glb">
            <m-model src="/assets/models/mml_head_hispanic_male.glb"></m-model>
            <m-model src="/assets/models/mml_hair_black.glb"></m-model>
            <m-model src="/assets/models/mml_torso_hoodie.glb"></m-model>
            <m-model src="/assets/models/mml_legs_grey_pants.glb"></m-model>
            <m-model src="/assets/models/mml_shoes_retro_white.glb"></m-model>
          </m-character>
        `,
        thumbnailUrl: "/assets/models/thumbs/mml_parts.jpg",
      },
      {
        name: "Low-poly A",
        meshFileUrl: "/assets/models/low_poly_male_a.glb",
        thumbnailUrl: "/assets/models/thumbs/low_poly_male_a.jpg",
      },
      {
        name: "Low-poly B",
        meshFileUrl: "/assets/models/low_poly_male_b.glb",
        thumbnailUrl: "/assets/models/thumbs/low_poly_male_b.jpg",
      },
      {
        name: "Low-poly C",
        meshFileUrl: "/assets/models/low_poly_male_c.glb",
        thumbnailUrl: "/assets/models/thumbs/low_poly_male_c.jpg",
      },
    ],
    allowCustomAvatars: true,
  },
  allowCustomDisplayName: true,
  enableTweakPane: true,
  allowOrbitalCamera: true,
  loadingScreen: {
    background: "#424242",
    color: "#ffffff",
    backgroundImageUrl: loadingBackground,
    backgroundBlurAmount: 0,
    title: "The 3D Web Experience",
    subtitle: "https://mml.mgz.me",
  },
});

app.update();

import { Networked3dWebExperienceClient } from "@mml-io/3d-web-experience-client";

import hdrJpgUrl from "../../../assets/hdr/puresky_2k.jpg";
import loadingBackground from "../../../assets/images/loading-bg.jpg";
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

const doubleJumpAnimationFileUrl = useBackFlip
  ? backFlipFileUrl
  : useAltFrontFlip
    ? altFrontFlipFileUrl
    : frontFlipFileUrl;

const idleAnimationSettings = {
  fileUrl: idleAnimationFileUrl,
  loop: true,
};

const jogAnimationSettings = {
  fileUrl: jogAnimationFileUrl,
  loop: true,
};

const sprintAnimationSettings = {
  fileUrl: sprintAnimationFileUrl,
  loop: true,
};

const airAnimationSettings = {
  fileUrl: airAnimationFileUrl,
  loop: true,
};

const doubleJumpAnimationSettings = {
  fileUrl: doubleJumpAnimationFileUrl,
  loop: false,
  discardNonRotationTransform: true,
  playbackSpeed: 1.42,
};

const holder = Networked3dWebExperienceClient.createFullscreenHolder();
const app = new Networked3dWebExperienceClient(holder, {
  sessionToken: (window as any).SESSION_TOKEN,
  userNetworkAddress,
  chatNetworkAddress,
  voiceChatAddress: voiceNetworkAddress,
  animationConfig: {
    idleAnimation: idleAnimationSettings,
    jogAnimation: jogAnimationSettings,
    sprintAnimation: sprintAnimationSettings,
    airAnimation: airAnimationSettings,
    doubleJumpAnimation: doubleJumpAnimationSettings,
  },
  mmlDocuments: { example: { url: `${protocol}//${host}/mml-documents/playground.html` } },
  environmentConfiguration: {
    skybox: {
      hdrJpgUrl: hdrJpgUrl,
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
        name: "Hat Bot",
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
    ],
  },
  allowOrbitalCamera: true,
  loadingScreen: {
    background: "#424242",
    color: "#ffffff",
    backgroundImageUrl: loadingBackground,
    backgroundBlurAmount: 12,
    title: "mml.mgz.me",
    subtitle: "The 3D Web Experience",
  },
});

app.update();

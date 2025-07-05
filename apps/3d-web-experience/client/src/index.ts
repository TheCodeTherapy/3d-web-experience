import { Networked3dWebExperienceClient } from "@mml-io/3d-web-experience-client";

import hdrJpgUrl from "../../../assets/hdr/puresky_2k.jpg";
import loadingBackground from "../../../assets/images/loading-bg.jpg";
import airAnimationFileUrl from "../../../assets/models/anim_air.glb";
import doubleJumpAnimationFileUrl from "../../../assets/models/anim_backflip.glb";
import idleAnimationFileUrl from "../../../assets/models/anim_idle.glb";
import jogAnimationFileUrl from "../../../assets/models/anim_jog.glb";
import sprintAnimationFileUrl from "../../../assets/models/anim_run.glb";

const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const host = window.location.host;
const userNetworkAddress = `${protocol}//${host}/network`;
const chatNetworkAddress = `${protocol}//${host}/chat-network`;

const shouldUseSkybox = false;

const animations = {
  airAnimationUrlOrConfig: {
    fileUrl: airAnimationFileUrl,
    loop: true,
    discardNonRotationTransform: false,
    playbackSpeed: 1.0,
  },
  idleAnimationUrlOrConfig: {
    fileUrl: idleAnimationFileUrl,
    loop: true,
    discardNonRotationTransform: true,
    playbackSpeed: 1.0,
  },
  jogAnimationUrlOrConfig: {
    fileUrl: jogAnimationFileUrl,
    loop: true,
    discardNonRotationTransform: false,
    playbackSpeed: 1.0,
  },
  sprintAnimationUrlOrConfig: {
    fileUrl: sprintAnimationFileUrl,
    loop: true,
    discardNonRotationTransform: false,
    playbackSpeed: 1.0,
  },
  doubleJumpAnimationUrlOrConfig: {
    fileUrl: doubleJumpAnimationFileUrl,
    loop: false,
    discardNonRotationTransform: true,
    playbackSpeed: 1.453, // 1.45
  },
};

const holder = Networked3dWebExperienceClient.createFullscreenHolder();
const app = new Networked3dWebExperienceClient(holder, {
  sessionToken: (window as any).SESSION_TOKEN,
  userNetworkAddress,
  chatNetworkAddress,
  animationConfig: animations,
  mmlDocuments: {
    example: { url: `${protocol}//${host}/mml-documents/playground.html` },
    // physicsDemo: { url: `${protocol}//${host}/mml-document/index` },
  },
  environmentConfiguration: {
    groundPlane: true,
    groundPlaneType: "grass", // "grass" or "neutral"
    skybox: shouldUseSkybox
      ? {
          hdrJpgUrl: hdrJpgUrl,
        }
      : undefined,
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
  spawnConfiguration: {
    enableRespawnButton: true,
  },
});

app.update();

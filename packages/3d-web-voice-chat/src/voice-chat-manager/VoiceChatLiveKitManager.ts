/* eslint-disable @typescript-eslint/naming-convention */
// /* eslint-disable @typescript-eslint/naming-convention */

import { CharacterState } from "@mml-io/3d-web-client-core";
import {
  ParticipantEvent,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  Room,
  RoomEvent,
  createLocalAudioTrack,
} from "livekit-client";

import { VoiceChatUI } from "../chat-ui/components/voice-chat-ui";

export enum SessionStatus {
  Disconnected = "disconnected",
  Connecting = "connecting",
  Connected = "connected",
  Unavailable = "unavailable",
}

const RETRY_DELAY = 3000;

const UPDATE_INTERVAL = 100;

type AudioNodeType = { source: MediaStreamAudioSourceNode; panner: PannerNode };

export type VoiceKitChatManagerConfig = {
  url: string;
  holderElement: HTMLElement;
  userId: number;
  remoteUserStates: Map<number, CharacterState>;
  latestCharacterObj: {
    characterState: null | CharacterState;
  };
  autoJoin: boolean;
};

export class VoiceChatLiveKitManager {
  private debug: boolean = true;
  private password: string | null = null;

  private disposed = false;
  private pending = false;
  private hasJoinedAudio = false;
  private speaking = false;
  private status: SessionStatus = SessionStatus.Disconnected;

  private conferenceAlias: string;
  private participants = new Map<string, AudioNodeType>();
  private activeSpeakers: number = 0;

  public speakingParticipants = new Map<number, boolean>();

  private voiceChatUI: VoiceChatUI;
  private audioContext = new AudioContext();
  private room: Room | null = null;

  private tickInterval: NodeJS.Timeout | null = null;

  constructor(private config: VoiceKitChatManagerConfig) {
    this.conferenceAlias = window.location.host.replace(/[.:/]/g, "-");

    this.voiceChatUI = new VoiceChatUI(
      this.config.holderElement,
      this.handleJoinClick.bind(this),
      this.handlePassword.bind(this),
    );
    this.voiceChatUI.render();
    this.tick = this.tick.bind(this);
    this.handleTrackSubscribed = this.handleTrackSubscribed.bind(this);
    this.registerAudioTrack = this.registerAudioTrack.bind(this);

    if (this.config.autoJoin === true) {
      this.init();
    }
  }

  private registerAudioTrack(track: RemoteTrack, participant: RemoteParticipant) {
    if (track.kind !== "audio" || this.participants.has(participant.identity)) return;
    const audioElement = new Audio();
    audioElement.srcObject = new MediaStream([track.mediaStreamTrack]);
    const trackSource = this.audioContext.createMediaStreamSource(
      new MediaStream([track.mediaStreamTrack]),
    );
    const panner = new PannerNode(this.audioContext);

    panner.panningModel = "HRTF";
    panner.distanceModel = "exponential";
    panner.coneOuterAngle = 360;
    panner.coneInnerAngle = 360;
    panner.coneOuterGain = 1;
    panner.refDistance = 1;
    panner.maxDistance = 140;
    panner.rolloffFactor = 1;

    trackSource.connect(panner);
    panner.connect(this.audioContext.destination);
    participant.on(ParticipantEvent.IsSpeakingChanged, (speaking: boolean) => {
      const userId = parseInt(participant.identity.split("-").pop()!);
      this.speakingParticipants.set(userId, speaking);
    });

    this.participants.set(participant.identity, { source: trackSource, panner: panner }); // Use sid directly
  }

  private handleTrackSubscribed(
    track: RemoteTrack,
    publication: RemoteTrackPublication,
    participant: RemoteParticipant,
  ) {
    this.registerAudioTrack(track, participant);
    if (track.kind === "audio") {
      console.log(`Now hearing track from new joiner: ${participant.identity}`);
    }
  }

  private async publishLocalTracks() {
    try {
      const localTrack = await createLocalAudioTrack(); // This creates the local audio track
      await this.room!.localParticipant.publishTrack(localTrack); // Publishes the track to the room
      if (this.debug) {
        console.log("Local audio track published");
      }
    } catch (error) {
      console.error("Error publishing local track:", error);
    }
  }

  private async initLiveKit(ws_url: string, token: string) {
    this.room = new Room();
    await this.room.connect(ws_url, token);

    // Subscribe to tracks from participants already in the room
    this.room.remoteParticipants.forEach((participant) => {
      participant.trackPublications.forEach((publication) => {
        if (publication.track && publication.kind === "audio") {
          this.registerAudioTrack(publication.track as RemoteTrack, participant);
          if (this.debug) {
            console.log(`Now hearing track from present participant: ${participant.identity}`);
          }
        }
      });
    });

    this.room.on(RoomEvent.TrackSubscribed, this.handleTrackSubscribed);

    await this.publishLocalTracks();
    this.room.remoteParticipants.forEach((participant) => {
      participant.trackPublications.forEach((publication) => {
        this.registerAudioTrack(publication.audioTrack as RemoteTrack, participant);
      });
    });
    this.room.localParticipant.setMicrophoneEnabled(true);

    // Handle existing participants' track publications
    this.room.remoteParticipants.forEach((participant) => {
      participant.on(ParticipantEvent.TrackPublished, (publication) => {
        // Subscribe to newly published tracks if they are audio
        if (publication.kind === "audio" && publication.isSubscribed) {
          this.handleTrackSubscribed(publication.track!, publication, participant);
        }
      });
    });

    this.room.localParticipant.on(ParticipantEvent.IsSpeakingChanged, (speaking: boolean) => {
      const userId = parseInt(this.room!.localParticipant.identity.split("-").pop()!);
      this.speakingParticipants.set(userId, speaking);
    });

    this.status = SessionStatus.Connected;
    this.hasJoinedAudio = true;
    this.voiceChatUI.setStatus(this.status);
    this.speaking = true;
    this.voiceChatUI.setSpeaking(this.speaking);
    if (this.debug) {
      console.log(`microphone enabled`);
    }
  }

  private updateAudioPositions() {
    const myCamState = this.config.latestCharacterObj.characterState;
    if (!myCamState) return;

    const { x: myX, y: myY, z: myZ } = myCamState.camPosition!;
    const { y: myQuatY, w: myQuatW } = myCamState.camQuaternion!;

    const theta = 2 * Math.atan2(myQuatY, myQuatW);
    const cosTheta = Math.cos(theta);
    const sinTheta = Math.sin(theta);

    const activeParticipants = new Set();

    this.config.remoteUserStates.forEach((state, id) => {
      activeParticipants.add(`participant-${id}`);
      const audioNode = this.participants.get(`participant-${id}`);
      if (audioNode) {
        const { x, y, z } = state.position;
        const dx = x - myX;
        const dy = y - myY;
        const dz = z - myZ;
        const dxRotated = dx * cosTheta - dz * sinTheta;
        const dzRotated = dz * sinTheta + dz * cosTheta;

        audioNode.panner.positionX.setValueAtTime(dxRotated, this.audioContext.currentTime);
        audioNode.panner.positionY.setValueAtTime(dy, this.audioContext.currentTime);
        audioNode.panner.positionZ.setValueAtTime(dzRotated, this.audioContext.currentTime);
      } else {
        // audio node not found for remote user
      }
    });

    this.participants.forEach((audioNode, identity) => {
      if (!activeParticipants.has(identity)) {
        audioNode.source.disconnect();
        audioNode.panner.disconnect();
        this.participants.delete(identity);
      }
    });

    if (this.status === SessionStatus.Connected) {
      this.activeSpeakers = this.participants.size + 1;
    } else {
      this.activeSpeakers = this.participants.size;
    }
    this.voiceChatUI.setActiveSpeakers(this.activeSpeakers);
  }

  private tick() {
    this.updateAudioPositions(); // Update positions at each tick
  }

  private async sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async requestConnectionDetails(retries: number = 3): Promise<any> {
    if (this.password === null) return null;
    const endPoint = `${this.config.url}/${this.config.userId}`;
    const auth = {
      headers: { "x-custom-auth": this.password },
    };
    try {
      const response = await fetch(endPoint, auth);
      if (response.status === 200) {
        this.status = SessionStatus.Connected;
        return await response.json();
      } else if (response.status === 401) {
        this.status = SessionStatus.Unavailable;
        const responseData = await response.json();
        if (responseData.error) {
          alert(responseData.error);
        }
      } else {
        this.status = SessionStatus.Unavailable;
        return null;
      }
    } catch (error) {
      console.error(`Failed fetching voice for endpoint ${endPoint}. Retries left: ${retries}`);
      if (retries > 0) {
        await this.sleep(RETRY_DELAY);
        return this.requestConnectionDetails(retries - 1);
      }
      this.status = SessionStatus.Unavailable;
      throw error;
    }
  }

  private async init() {
    try {
      const voiceEndpointResponse = await this.requestConnectionDetails();
      const { token, ws_url } = voiceEndpointResponse;
      if (token && ws_url) {
        await this.initLiveKit(ws_url, token);
        this.tickInterval = setInterval(() => this.tick(), UPDATE_INTERVAL);
      }
    } catch (err) {
      console.error(`Something went wrong: ${err}`);
      this.status = SessionStatus.Unavailable;
    }
  }

  public dispose() {
    if (this.disposed) return;

    if (this.tickInterval !== null) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    // Dispose of the conference here
    this.disposed = true;
  }

  private handlePassword(password: string) {
    if (password === null || password === "") {
      console.warn("No password entered. Aborting the joining process.");
      this.voiceChatUI.askForPassword(false);
      this.pending = false;
      return;
    } else {
      this.voiceChatUI.askForPassword(false);
      this.password = password;
      this.init();
    }
  }

  private async handleJoinClick() {
    if (this.pending) return;
    this.pending = true;

    if (this.status !== SessionStatus.Connected) {
      this.voiceChatUI.askForPassword(true);
    } else {
      if (this.hasJoinedAudio && this.room) {
        this.speaking = !this.speaking;
        this.room.localParticipant.setMicrophoneEnabled(this.speaking);
        this.voiceChatUI.setSpeaking(this.speaking);
      }
    }

    this.pending = false;
  }
}

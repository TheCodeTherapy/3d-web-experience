import { useRef, useState, MouseEvent, useEffect } from "react";
import { flushSync } from "react-dom";
import { createRoot, Root } from "react-dom/client";

import { SessionStatus } from "../../voice-chat-manager/VoiceChatManager";
import HeadSet from "../icons/Headset.svg";
import HourGlass from "../icons/Hourglass.svg";
import MicrophoneOff from "../icons/MicrophoneOff.svg";
import MicrophoneOn from "../icons/MicrophoneOn.svg";

import styles from "./voice-chat-ui.module.css";

type VoiceChatUIComponentProps = {
  activeSpeakers: number;
  speaking: boolean;
  status: SessionStatus;
  handleJoinClick: () => void;
  showPasswordModal: boolean;
  passCallback: (password: string) => void;
};

const PasswordModal = ({ onSubmit }: { onSubmit: (password: string) => void }) => {
  const [password, setPassword] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const handleKeyPress = (event: KeyboardEvent) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        onSubmit(inputRef.current?.value || "");
      }
    };

    const inputEl = inputRef.current;
    if (inputEl) inputEl.addEventListener("keydown", handleKeyPress);
    return () => {
      if (inputEl) inputEl.removeEventListener("keydown", handleKeyPress);
    };
  }, [onSubmit]);

  return (
    <div className={styles.modal}>
      <h3>Password for Voice Chat</h3>
      <div className={styles.inputWrapper}>
        <input
          ref={inputRef}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter your password..."
        />
        <button onClick={() => onSubmit(password)}>Submit</button>
      </div>
    </div>
  );
};

const VoiceChatUIComponent = (props: VoiceChatUIComponentProps) => {
  const { activeSpeakers, speaking, status, handleJoinClick } = props;
  const joinVoiceChatRef = useRef<HTMLDivElement>(null);
  const voiceParticipantsRef = useRef<HTMLDivElement>(null);
  const [micHovered, setMicHovered] = useState(false);

  const handleMicClick = (e: MouseEvent) => {
    e.stopPropagation();
    handleJoinClick();
  };

  const renderIcon = () => {
    if (status === SessionStatus.Connecting) {
      return <img src={`data:image/svg+xml;utf8,${encodeURIComponent(HourGlass)}`} />;
    } else if (status === SessionStatus.Connected && speaking === false) {
      return <img src={`data:image/svg+xml;utf8,${encodeURIComponent(MicrophoneOff)}`} />;
    } else if (status === SessionStatus.Connected && speaking === true) {
      return <img src={`data:image/svg+xml;utf8,${encodeURIComponent(MicrophoneOn)}`} />;
    } else {
      return <img src={`data:image/svg+xml;utf8,${encodeURIComponent(HeadSet)}`} />;
    }
  };

  const getStatusString = (): string => {
    if (status === SessionStatus.Disconnected) {
      return "voice chat";
    }
    if (status === SessionStatus.Unavailable) {
      return "disabled";
    }
    if (status === SessionStatus.Connected) {
      return speaking ? "mute" : "unmute";
    }
    return "loading";
  };

  return (
    <div className={styles.voiceChat}>
      <div
        ref={joinVoiceChatRef}
        className={
          status === SessionStatus.Unavailable
            ? styles.unavailable
            : speaking
            ? styles.speaking
            : styles.connected
        }
        onClick={handleMicClick}
        onMouseEnter={() => setMicHovered(true)}
        onMouseLeave={() => setMicHovered(false)}
      >
        <span
          className={micHovered ? `${styles.tooltip} ${styles.tooltipVisible}` : styles.tooltip}
        >
          {getStatusString()}
        </span>
        {renderIcon()}
      </div>
      <div
        ref={voiceParticipantsRef}
        className={activeSpeakers > 0 ? styles.voiceParticipantsVisible : styles.voiceParticipants}
      >
        {activeSpeakers > 0 && activeSpeakers}
      </div>
      {props.showPasswordModal && <PasswordModal onSubmit={props.passCallback} />}
    </div>
  );
};

export class VoiceChatUI {
  private root: Root;
  private container = document.getElementById("voice-chat-ui")!;

  private activeSpeakers: number = 0;
  private speaking: boolean = false;
  private status: SessionStatus = SessionStatus.Disconnected;
  private passwordModal: boolean = false;

  constructor(
    private handleClickMic: () => void,
    private handlePassword: (password: string) => void,
  ) {
    this.root = createRoot(this.container);
  }

  public setActiveSpeakers(activeSpeakers: number): void {
    if (this.activeSpeakers !== activeSpeakers) {
      this.activeSpeakers = activeSpeakers;
      this.render();
    }
  }

  public setSpeaking(speaking: boolean): void {
    if (this.speaking !== speaking) {
      this.speaking = speaking;
      this.render();
    }
  }

  public setStatus(status: SessionStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.render();
    }
  }

  public askForPassword(value: boolean): void {
    if (this.passwordModal !== value) {
      this.passwordModal = value;
      this.render();
    }
  }

  public render(): void {
    flushSync(() =>
      this.root.render(
        <VoiceChatUIComponent
          showPasswordModal={this.passwordModal}
          passCallback={this.handlePassword}
          handleJoinClick={this.handleClickMic}
          activeSpeakers={this.activeSpeakers}
          speaking={this.speaking}
          status={this.status}
        />,
      ),
    );
  }
}

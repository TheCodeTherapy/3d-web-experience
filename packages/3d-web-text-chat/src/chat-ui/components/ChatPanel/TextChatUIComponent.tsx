import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  ForwardRefRenderFunction,
  MouseEvent,
} from "react";

import { useClickOutside } from "../../helpers";
import ChatIcon from "../../icons/Chat.svg";
import PinButton from "../../icons/Pin.svg";
import { gradient } from "../../images/gradient";
import { type ChatUIInstance } from "../../TextChatUI";
import { InputBox } from "../Input/InputBox";
import { Messages } from "../Messages/Messages";

import styles from "./TextChatUIComponent.module.css";
type ChatUIProps = {
  clientName: string;
  sendMessageToServer: (message: string) => void;
};

const MAX_MESSAGES = 50;
const SECONDS_TO_FADE_OUT = 6;

export const ChatUIComponent: ForwardRefRenderFunction<ChatUIInstance, ChatUIProps> = (
  props: ChatUIProps,
  ref,
) => {
  const [messages, setMessages] = useState<Array<{ username: string; message: string }>>([]);

  const [isVisible, setIsVisible] = useState(false);
  const [isSticky, setSticky] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isOpenHovered, setOpenHovered] = useState(false);

  const [panelStyle, setPanelStyle] = useState(styles.fadeOut);
  const [stickyStyle, setStickyStyle] = useState(styles.stickyButton);

  const stickyButtonRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLDivElement>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const inputBoxRef = useRef<{ focusInput: () => void } | null>(null);

  const startHideTimeout = useCallback(() => {
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    hideTimeoutRef.current = setTimeout(() => {
      if (isVisible) setIsVisible(false);
    }, SECONDS_TO_FADE_OUT * 1000);
  }, [isVisible]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        if (!isVisible) setIsVisible(true);
        setIsFocused(true);
        if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
        if (inputBoxRef.current) inputBoxRef.current.focusInput();
      }
    },
    [isVisible],
  );

  const handleBlur = useCallback(() => {
    if (isFocused) setIsFocused(false);
    startHideTimeout();
    if (closeButtonRef.current) closeButtonRef.current.focus();
  }, [isFocused, startHideTimeout]);

  const hide = () => {
    setIsVisible(false);
    setIsFocused(false);
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
  };

  const handleRootClick = (e: MouseEvent) => {
    e.stopPropagation();
  };

  const handleStickyButton = (e: MouseEvent) => {
    e.stopPropagation();
    setSticky(!isSticky);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
  };

  const handleMouseLeave = () => {
    setOpenHovered(false);
    if (!isFocused && !isSticky && isVisible) {
      startHideTimeout();
    }
  };

  const handleMouseEnter = () => {
    setOpenHovered(true);
    if (!isVisible) setIsVisible(true);
  };

  const chatPanelRef = useClickOutside(() => {
    if (isFocused) {
      setIsFocused(false);
      startHideTimeout();
    }
  });

  useEffect(() => {
    setPanelStyle(isVisible || isFocused || isSticky ? styles.fadeIn : styles.fadeOut);
    setStickyStyle(
      isSticky
        ? styles.stickyButtonEnabled
        : isOpenHovered
        ? styles.stickyButton
        : styles.stickyButtonFadeOut,
    );
    if (chatPanelRef.current && chatPanelRef.current.style.zIndex !== "100") {
      // we just want to change the z-index after the browser has the chance
      // to apply the CSS to the SVG icons
      setTimeout(() => {
        if (chatPanelRef.current) chatPanelRef.current.style.zIndex = "100";
      }, 2000);
    }
  }, [isVisible, isSticky, isFocused, chatPanelRef, isOpenHovered]);

  const appendMessages = (username: string, message: string) => {
    setMessages((prev) => {
      const newMessages = [...prev, { username, message }];
      return newMessages.length > MAX_MESSAGES ? newMessages.slice(-MAX_MESSAGES) : newMessages;
    });
  };

  useImperativeHandle(ref, () => ({
    addMessage: (username: string, message: string) => {
      appendMessages(username, message);
      if (!isVisible) setIsVisible(true);
      startHideTimeout();
    },
  }));

  const handleSendMessage = (message: string) => {
    props.sendMessageToServer(message);
    appendMessages(props.clientName, message);
  };

  const setFocus = () => setIsFocused(true);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown, false);
    window.addEventListener("blur", handleBlur, false);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, false);
      window.removeEventListener("blur", handleBlur, false);
    };
  }, [handleBlur, handleKeyDown]);

  return (
    <>
      <div
        className={styles.uiHover}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleRootClick}
      >
        <div className={styles.openTab} onClick={hide}>
          <img src={`data:image/svg+xml;utf8,${encodeURIComponent(ChatIcon)}`} />
        </div>
        <div ref={stickyButtonRef} className={stickyStyle} onClick={handleStickyButton}>
          <img src={`data:image/svg+xml;utf8,${encodeURIComponent(PinButton)}`} />
        </div>
      </div>
      <div
        ref={chatPanelRef}
        style={{ position: "fixed", zIndex: -1 }}
        id="text-chat-wrapper"
        className={`${styles.textChat} ${panelStyle}`}
        onWheel={handleWheel}
      >
        <div
          className={styles.messagesWrapper}
          style={{
            WebkitMaskImage: `url(data:image/png;base64,${gradient})`,
            maskImage: `url(data:image/png;base64,${gradient})`,
            WebkitMaskRepeat: "repeat-x",
            maskRepeat: "repeat-x",
            WebkitMaskSize: "contain",
            maskSize: "contain",
          }}
        >
          <Messages messages={messages} />
        </div>
        <InputBox
          ref={inputBoxRef}
          onSendMessage={handleSendMessage}
          hide={hide}
          setFocus={setFocus}
        />
      </div>
    </>
  );
};

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
import { StringToHslOptions, type ChatUIInstance } from "../../TextChatUI";
import { InputBox } from "../Input/InputBox";
import { Messages } from "../Messages/Messages";

import styles from "./TextChatUIComponent.module.css";
type ChatUIProps = {
  sendMessageToServer: (message: string) => void;
  visibleByDefault?: boolean;
  stringToHslOptions?: StringToHslOptions;
};

const MAX_MESSAGES = 50;
const SECONDS_TO_FADE_OUT = 6;
const AUTO_SCROLL_RESET_DELAY_MS = 100;

export const ChatUIComponent: ForwardRefRenderFunction<ChatUIInstance, ChatUIProps> = (
  props: ChatUIProps,
  ref,
) => {
  const visibleByDefault: boolean = props.visibleByDefault ?? true;
  const [messages, setMessages] = useState<Array<{ username: string; message: string }>>([]);
  const [isVisible, setIsVisible] = useState<boolean>(visibleByDefault);
  const [isSticky, setSticky] = useState<boolean>(visibleByDefault);
  const [isFocused, setIsFocused] = useState(false);
  const [isOpenHovered, setOpenHovered] = useState(false);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(false);

  const [panelStyle, setPanelStyle] = useState(styles.fadeOut);
  const [stickyStyle, setStickyStyle] = useState(styles.stickyButton);

  const stickyButtonRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLDivElement>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const inputBoxRef = useRef<{ focusInput: () => void } | null>(null);

  const startHideTimeout = useCallback(() => {
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    hideTimeoutRef.current = setTimeout(() => {
      if (isVisible) {
        setIsVisible(false);
      }
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
    setOpenHovered(true);
    if (!isVisible) setIsVisible(true);
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
    if (isVisible && isSticky) {
      if (chatPanelRef.current) chatPanelRef.current.style.zIndex = "100";
    }
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
    setShouldAutoScroll(true);
    props.sendMessageToServer(message);
    // Reset after a short delay
    setTimeout(() => setShouldAutoScroll(false), AUTO_SCROLL_RESET_DELAY_MS);
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
    <div className={styles.textChatUi}>
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
        style={{ zIndex: -1 }}
        id="text-chat-wrapper"
        className={`${styles.textChat} ${panelStyle}`}
        onWheel={handleWheel}
      >
        <div className={styles.messagesWrapper}>
          <Messages
            messages={messages}
            stringToHslOptions={props.stringToHslOptions}
            shouldAutoScroll={shouldAutoScroll}
          />
        </div>
        <InputBox
          ref={inputBoxRef}
          onSendMessage={handleSendMessage}
          hide={hide}
          setFocus={setFocus}
        />
      </div>
    </div>
  );
};

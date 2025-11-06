import { FC, useEffect, useRef, useState } from "react";

import { StringToHslOptions } from "../../TextChatUI";
import Message from "../Message/Message";

import styles from "./Messages.module.css";

type MessagesProps = {
  messages: Array<{ username: string; message: string }>;
  stringToHslOptions?: StringToHslOptions;
  shouldAutoScroll?: boolean;
};

const SCROLL_THRESHOLD_PX = 10; // Threshold to consider "at bottom" for scroll position

export const Messages: FC<MessagesProps> = ({ messages, stringToHslOptions, shouldAutoScroll }) => {
  const messagesEndRef = useRef<null | HTMLDivElement>(null);
  const containerRef = useRef<null | HTMLDivElement>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [lastReadMessageIndex, setLastReadMessageIndex] = useState(0);
  const [wasAtBottom, setWasAtBottom] = useState(true);

  const isAtBottom = () => {
    if (!containerRef.current) return true;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    return Math.abs(scrollHeight - clientHeight - scrollTop) < SCROLL_THRESHOLD_PX;
  };

  const handleScroll = () => {
    const atBottom = isAtBottom();
    setWasAtBottom(atBottom);

    // Mark messages as read when scrolled to bottom
    if (atBottom && unreadCount > 0) {
      setUnreadCount(0);
      setLastReadMessageIndex(messages.length - 1);
    }
  };

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
    setUnreadCount(0);
    setLastReadMessageIndex(messages.length - 1);
    setWasAtBottom(true);
  };

  useEffect(() => {
    if (messages.length === 0) return;

    // Should auto-scroll if user sent message or was at bottom
    const shouldScroll = shouldAutoScroll || wasAtBottom;

    if (shouldScroll) {
      // Use setTimeout to ensure DOM is updated, then check if we need to scroll
      setTimeout(() => {
        if (!isAtBottom()) {
          if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
          }
        }
        setWasAtBottom(true);
      }, 0);
      setUnreadCount(0);
      setLastReadMessageIndex(messages.length - 1);
    } else {
      // User is scrolled up and this is someone else's message
      const newUnreadCount = messages.length - 1 - lastReadMessageIndex;
      setUnreadCount(newUnreadCount);
    }
  }, [messages, shouldAutoScroll, wasAtBottom, lastReadMessageIndex]);

  return (
    <>
      <div ref={containerRef} className={styles.messagesContainer} onScroll={handleScroll}>
        {messages.map((msg, index) => (
          <Message
            key={index}
            username={msg.username}
            message={msg.message}
            stringToHslOptions={stringToHslOptions}
          />
        ))}
        <div ref={messagesEndRef}></div>
      </div>
      {unreadCount > 0 && (
        <button className={styles.newMessagesButton} onClick={scrollToBottom}>
          {unreadCount} new message{unreadCount !== 1 ? "s" : ""}
        </button>
      )}
    </>
  );
};

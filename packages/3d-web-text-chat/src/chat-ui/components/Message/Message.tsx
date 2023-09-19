import { FC } from "react";

import styles from "./Message.module.css";

type MessageProps = {
  username: string;
  message: string;
};

const Message: FC<MessageProps> = ({ username, message }) => {
  return (
    <div className={styles.messageContainer}>
      <span className={styles.userName}>{username}</span>: {message}
    </div>
  );
};

export default Message;

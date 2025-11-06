import { FC, useState, useEffect, useCallback } from "react";

import { DEFAULT_HSL_OPTIONS, StringToHslOptions } from "../../TextChatUI";

import styles from "./Message.module.css";

function ReverseHash(input: string): number {
  // Hash has an initial value of 5381. As bit shifting is used, output can be any signed 32 bit Integer.
  const stringLength = input.length;
  let hash = 5381;

  for (let i = stringLength - 1; i >= 0; i--) {
    hash = (hash << 5) + hash + input.charCodeAt(i);
  }

  return hash;
}

function generateValueFromThresholds(hash: number, thresholds: [number, number][]): number {
  const selectedThreshold = thresholds[hash % thresholds.length];
  const min = Math.min(...selectedThreshold);
  const max = Math.max(...selectedThreshold);

  const thresholdRange = Math.abs(max - min);
  return (hash % thresholdRange) + min;
}

function hslForString(
  input: string,
  options: StringToHslOptions = DEFAULT_HSL_OPTIONS,
): [number, number, number] {
  // Because JS bit shifting only operates on 32-Bit signed Integers,
  // in the case of overflow where a negative hash is inappropriate,
  // the absolute value has to be taken. This 'halves' our theoretical
  // hash distribution. This may require an alternate approach if
  // collisions are too frequent.
  let hash = Math.abs(ReverseHash("lightness: " + input));

  const lightness = options.lightnessThresholds
    ? generateValueFromThresholds(hash, options.lightnessThresholds)
    : generateValueFromThresholds(hash, DEFAULT_HSL_OPTIONS.lightnessThresholds!);

  hash = Math.abs(ReverseHash("saturation:" + input));
  const saturation = options.saturationThresholds
    ? generateValueFromThresholds(hash, options.saturationThresholds)
    : generateValueFromThresholds(hash, DEFAULT_HSL_OPTIONS.saturationThresholds!);

  hash = Math.abs(ReverseHash("hue:" + input));
  const hue = options.hueThresholds
    ? generateValueFromThresholds(hash, options.hueThresholds)
    : generateValueFromThresholds(hash, DEFAULT_HSL_OPTIONS.hueThresholds!);

  return [hue, saturation, lightness];
}

type MessageProps = {
  username: string;
  message: string;
  stringToHslOptions?: StringToHslOptions;
};

const Message: FC<MessageProps> = ({ username, message, stringToHslOptions }) => {
  const [userColors, setUserColors] = useState<Map<string, string>>(new Map());

  const generateColorForUsername = useCallback((): string => {
    const [hue, saturation, lightness] = hslForString(username, stringToHslOptions);
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  }, [stringToHslOptions, username]);

  useEffect(() => {
    if (!userColors.has(username)) {
      const color = generateColorForUsername();
      setUserColors(new Map(userColors).set(username, color));
    }
  }, [username, userColors, generateColorForUsername]);

  const userColor = userColors.get(username) || "hsl(0, 0%, 0%)";

  return (
    <div className={styles.messageContainer}>
      <span className={styles.userName} style={{ color: userColor }}>
        {username}
      </span>
      : {message}
    </div>
  );
};

export default Message;

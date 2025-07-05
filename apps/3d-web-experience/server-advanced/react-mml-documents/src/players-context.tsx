import * as React from "react";

type Position = { x: number; y: number; z: number };
type Rotation = { rx: number; ry: number; rz: number };
type PlayerTransform = Position & Rotation;

type PlayersContextType = {
  playersMap: Map<number, PlayerTransform>;
  updatePlayerTransform: (
    connectionId: number,
    position: Position,
    rotation: { x: number; y: number; z: number },
  ) => void;
  deletePlayerTransform: (connectionId: number) => void;
  findClosestPlayer: (fromPosition: Position) => PlayerTransform | null;
};

const PlayersContext = React.createContext<PlayersContextType | null>(null);

export const usePlayersContext = () => {
  const context = React.useContext(PlayersContext);
  if (!context) {
    throw new Error("usePlayersContext must be used within a PlayersProvider");
  }
  return context;
};

type PlayersProviderProps = {
  children: React.ReactNode;
};

export const PlayersProvider: React.FC<PlayersProviderProps> = ({ children }) => {
  const [playersMap, setPlayersMap] = React.useState<Map<number, PlayerTransform>>(new Map());
  const mountedRef = React.useRef(true);

  const updatePlayerTransform = React.useCallback(
    (connectionId: number, position: Position, rotation: { x: number; y: number; z: number }) => {
      if (!mountedRef.current) return;

      const transform: PlayerTransform = {
        x: position.x,
        y: position.y,
        z: position.z,
        rx: rotation.x,
        ry: rotation.y,
        rz: rotation.z,
      };

      setPlayersMap((prev) => {
        const newMap = new Map(prev);
        newMap.set(connectionId, transform);
        return newMap;
      });
    },
    [],
  );

  const deletePlayerTransform = React.useCallback((connectionId: number) => {
    if (!mountedRef.current) return;

    setPlayersMap((prev) => {
      const newMap = new Map(prev);
      newMap.delete(connectionId);
      return newMap;
    });
  }, []);

  const computeDistance = React.useCallback((pos1: Position, pos2: Position): number => {
    return Math.sqrt(
      Math.pow(pos1.x - pos2.x, 2) + Math.pow(pos1.y - pos2.y, 2) + Math.pow(pos1.z - pos2.z, 2),
    );
  }, []);

  const findClosestPlayer = React.useCallback(
    (fromPosition: Position): PlayerTransform | null => {
      if (playersMap.size === 0) return null;

      let closestPlayer: PlayerTransform | null = null;
      let minDistance = Infinity;

      for (const player of playersMap.values()) {
        const distance = computeDistance(player, fromPosition);

        if (distance < minDistance) {
          minDistance = distance;
          closestPlayer = player;
        }
      }

      return closestPlayer;
    },
    [computeDistance, playersMap],
  );

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const value: PlayersContextType = {
    playersMap,
    updatePlayerTransform,
    deletePlayerTransform,
    findClosestPlayer,
  };

  return <PlayersContext.Provider value={value}>{children}</PlayersContext.Provider>;
};

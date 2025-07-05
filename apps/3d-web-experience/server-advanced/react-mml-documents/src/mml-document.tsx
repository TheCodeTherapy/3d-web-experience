import MMLCube from "./mml-cube";
import MMLPhysicsCubes from "./mml-physics-cubes";
import MMLProbe from "./mml-probe";
import { PlayersProvider } from "./players-context";

export default function MMLDocument() {
  const getHLSBasedOnIndex = (index: number) => {
    const hue = (index / 10) * 360;
    return `hsl(${hue}, 100%, 50%)`;
  };

  const updateInterval = 200;

  return (
    <PlayersProvider>
      <m-group id="react-mml-document" x={0} y={0} z={100}>
        {/* Position probe with hot reload protection */}
        <MMLProbe range={20} interval={updateInterval} debug={false} />

        {/* Physics simulation with falling cubes and restart button */}
        <m-group id="physics-world" x={0} z={40}>
          <MMLPhysicsCubes cubeCount={30} spawnHeight={5} spawnRadius={3} />
        </m-group>

        {/* Player-tracking cubes in a circle */}
        {Array.from({ length: 12 }).map((_, index) => {
          const angle = (index / 10) * 2 * Math.PI;
          const radius = 5;
          return (
            <MMLCube
              key={`player-cube-${index}`}
              x={radius * Math.cos(angle)}
              y={0.5}
              z={radius * Math.sin(angle)}
              trackPlayers={true}
              color={getHLSBasedOnIndex(index + 5)}
              lerpDuration={updateInterval}
            />
          );
        })}
      </m-group>
    </PlayersProvider>
  );
}

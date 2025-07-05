import type RAPIER from "@dimforge/rapier3d";
import * as React from "react";

import { usePhysicsContext } from "./physics-context";

type PhysicsCube = {
  id: number;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
  color: string;
};

type MMLPhysicsCubesProps = {
  cubeCount: number;
  spawnHeight: number;
  spawnRadius: number;
};

export default function MMLPhysicsCubes({
  cubeCount,
  spawnHeight,
  spawnRadius,
}: MMLPhysicsCubesProps) {
  const { rapier, world, isInitialized } = usePhysicsContext();
  const [physicsCubes, setPhysicsCubes] = React.useState<PhysicsCube[]>([]);

  const tickInterval = 16;

  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const mountedRef = React.useRef(true);

  const [groundBody, setGroundBody] = React.useState<RAPIER.RigidBody | null>(null);

  const getRandomColor = React.useCallback(
    (index: number) => {
      const hue = (index / cubeCount) * 360;
      return `hsl(${hue}, 80%, 60%)`;
    },
    [cubeCount],
  );

  React.useEffect(() => {
    if (!isInitialized || !rapier || !world || groundBody) return;

    console.log("Creating physics ground plane");
    const groundBodyDesc = rapier.RigidBodyDesc.fixed();
    groundBodyDesc.setTranslation(0, 0.1, 0);
    const ground = world.createRigidBody(groundBodyDesc);
    if (!ground) {
      console.error("Failed to create ground body");
      return;
    }
    const groundColliderDesc = rapier.ColliderDesc.cuboid(30, -0.1, 30);
    const groundCollider = world.createCollider(groundColliderDesc, ground);

    if (!groundCollider) {
      console.error("Failed to create ground collider");
      return;
    }

    setGroundBody(ground);
  }, [isInitialized, rapier, world, groundBody]);

  const createPhysicsCubes = React.useCallback(() => {
    if (!isInitialized || !rapier || !world || !mountedRef.current) {
      return [];
    }

    const cubes: PhysicsCube[] = [];

    for (let i = 0; i < cubeCount; i++) {
      const x = (Math.random() - 0.5) * spawnRadius * 2;
      const y = spawnHeight + i * 1.5;
      const z = (Math.random() - 0.5) * spawnRadius * 2;

      const bodyDesc = rapier.RigidBodyDesc.dynamic();
      bodyDesc.setTranslation(x, y, z);
      bodyDesc.setLinvel(0, 0, 0);
      const body = world.createRigidBody(bodyDesc);

      if (!body) {
        console.error(`Failed to create body for cube ${i}`);
        continue;
      }

      const colliderDesc = rapier.ColliderDesc.cuboid(0.5, 0.5, 0.5);
      const collider = world.createCollider(colliderDesc, body);

      if (!collider) {
        console.error(`Failed to create collider for cube ${i}`);
        continue;
      }

      cubes.push({
        id: i,
        body,
        collider,
        position: { x, y, z },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        color: getRandomColor(i),
      });
    }
    return cubes;
  }, [isInitialized, rapier, world, cubeCount, spawnRadius, spawnHeight, getRandomColor]);

  // Restart simulation
  const restartSimulation = React.useCallback(() => {
    if (!mountedRef.current || !world) return;

    console.log("Restarting physics simulation");

    // Stop current animation loop
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // Clean up existing physics bodies
    setPhysicsCubes((prevCubes) => {
      prevCubes.forEach((cube) => {
        if (cube.body && world) {
          try {
            // Remove collider first, then body
            if (cube.collider) {
              world.removeCollider(cube.collider, false);
            }
            world.removeRigidBody(cube.body);
          } catch (error) {
            console.warn("Error removing physics objects:", error);
          }
        }
      });
      return [];
    });

    setTimeout(() => {
      if (mountedRef.current) {
        const newCubes = createPhysicsCubes();
        setPhysicsCubes(newCubes);
      }
    }, 100);
  }, [world, createPhysicsCubes]);

  React.useEffect(() => {
    if (!groundBody) {
      console.log("Waiting for ground body to be created");
      return;
    }

    console.log("Ground body ready, creating physics cubes");
    const cubes = createPhysicsCubes();
    setPhysicsCubes(cubes);
    console.log("Physics cubes set in state:", cubes.length);
  }, [groundBody, createPhysicsCubes]);

  React.useEffect(() => {
    if (!isInitialized || !world || physicsCubes.length === 0) return;

    const animate = () => {
      if (!mountedRef.current) return;

      try {
        world.step();

        setPhysicsCubes((prevCubes) => {
          return prevCubes.map((cube) => {
            const position = cube.body.translation();
            const rotation = cube.body.rotation();

            return {
              ...cube,
              position: { x: position.x, y: position.y, z: position.z },
              rotation: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
            };
          });
        });

        if (mountedRef.current) {
          timeoutRef.current = setTimeout(animate, tickInterval);
        }
      } catch (error) {
        console.error("Physics simulation error:", error);
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
      }
    };

    timeoutRef.current = setTimeout(animate, 100);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isInitialized, world, physicsCubes.length]);

  React.useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const quaternionToEuler = (q: { x: number; y: number; z: number; w: number }) => {
    const { x, y, z, w } = q;

    // Roll (x-axis rotation)
    const sinr_cosp = 2 * (w * x + y * z);
    const cosr_cosp = 1 - 2 * (x * x + y * y);
    const roll = Math.atan2(sinr_cosp, cosr_cosp);

    // Pitch (y-axis rotation)
    const sinp = 2 * (w * y - z * x);
    const pitch = Math.abs(sinp) >= 1 ? (Math.sign(sinp) * Math.PI) / 2 : Math.asin(sinp);

    // Yaw (z-axis rotation)
    const siny_cosp = 2 * (w * z + x * y);
    const cosy_cosp = 1 - 2 * (y * y + z * z);
    const yaw = Math.atan2(siny_cosp, cosy_cosp);

    return {
      rx: roll * (180 / Math.PI),
      ry: pitch * (180 / Math.PI),
      rz: yaw * (180 / Math.PI),
    };
  };

  return (
    <m-group id="physics-cubes">
      <m-cube x={0} y={-1} z={0} width={20} height={0.2} depth={20} color="#666666" />

      {/* Debug info */}
      <m-label
        content={`Cubes: ${physicsCubes.length}${isInitialized ? " | Physics Ready" : " | Physics Loading"}`}
        color="rgba(0,0,0,0.1)"
        font-color="white"
        font-size="17"
        alignment="center"
        width="6"
        height="0.3"
        x="0"
        y="5"
        z="0"
      />

      {/* Physics cubes */}
      {physicsCubes.map((cube) => {
        const euler = quaternionToEuler(cube.rotation);
        return (
          <m-cube
            collide="true"
            key={cube.id}
            x={cube.position.x}
            y={cube.position.y}
            z={cube.position.z}
            rx={euler.rx}
            ry={euler.ry}
            rz={euler.rz}
            width={1}
            height={1}
            depth={1}
            color={cube.color}
          />
        );
      })}

      {/* Restart button - white cube */}
      <m-cube
        x={0}
        y={2}
        z={0}
        width={1.2}
        height={1.2}
        depth={1.2}
        color="white"
        onClick={restartSimulation}
      >
        {/* Label for the restart button */}
        <m-label
          content="RESTART"
          color="rgba(0,0,0,0.1)"
          font-color="black"
          font-size="8"
          alignment="center"
          width="1.5"
          height="0.3"
          y="0.8"
        />
      </m-cube>
    </m-group>
  );
}

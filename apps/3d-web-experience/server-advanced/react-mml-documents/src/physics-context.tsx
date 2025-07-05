import type RAPIER from "@dimforge/rapier3d";
import * as React from "react";

type Vector3 = { x: number; y: number; z: number };
type Quaternion = { x: number; y: number; z: number; w: number };

type PhysicsContextType = {
  rapier: any | null;
  world: RAPIER.World | null;
  isInitialized: boolean;
  // Helper functions
  createRigidBody: (desc: RAPIER.RigidBodyDesc) => RAPIER.RigidBody | null;
  createCollider: (desc: RAPIER.ColliderDesc, parent?: RAPIER.RigidBody) => RAPIER.Collider | null;
  removeRigidBody: (body: RAPIER.RigidBody) => void;
  removeCollider: (collider: RAPIER.Collider) => void;
  raycast: (
    origin: Vector3,
    direction: Vector3,
    maxDistance: number,
  ) => RAPIER.RayColliderHit | null;
  step: () => void;
  // Body manipulation helpers
  setBodyPosition: (body: RAPIER.RigidBody, position: Vector3) => void;
  setBodyRotation: (body: RAPIER.RigidBody, rotation: Quaternion) => void;
  setBodyVelocity: (body: RAPIER.RigidBody, velocity: Vector3) => void;
  getBodyPosition: (body: RAPIER.RigidBody) => Vector3;
  getBodyRotation: (body: RAPIER.RigidBody) => Quaternion;
};

const PhysicsContext = React.createContext<PhysicsContextType | null>(null);

export const usePhysicsContext = () => {
  const context = React.useContext(PhysicsContext);
  if (!context) {
    throw new Error("usePhysicsContext must be used within a PhysicsProvider");
  }
  return context;
};

type PhysicsProviderProps = {
  children: React.ReactNode;
  rapier: any | null;
  gravity?: Vector3;
};

export const PhysicsProvider: React.FC<PhysicsProviderProps> = ({
  children,
  rapier,
  gravity = { x: 0, y: -9.81, z: 0 },
}) => {
  const [world, setWorld] = React.useState<RAPIER.World | null>(null);
  const [isInitialized, setIsInitialized] = React.useState(false);
  const mountedRef = React.useRef(true);

  // Initialize physics world when rapier is available
  React.useEffect(() => {
    if (rapier && !world) {
      try {
        const newWorld = new rapier.World(gravity);
        setWorld(newWorld);
        setIsInitialized(true);
        console.log("Physics world initialized");
      } catch (error) {
        console.error("Failed to initialize physics world:", error);
        setIsInitialized(false);
      }
    }
  }, [rapier, gravity, world]);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (world) {
        world.free();
        setWorld(null);
        setIsInitialized(false);
      }
    };
  }, [world]);

  const createRigidBody = React.useCallback(
    (desc: RAPIER.RigidBodyDesc): RAPIER.RigidBody | null => {
      if (!world || !rapier || !mountedRef.current) return null;
      return world.createRigidBody(desc);
    },
    [world, rapier],
  );

  const createCollider = React.useCallback(
    (desc: RAPIER.ColliderDesc, parent?: RAPIER.RigidBody): RAPIER.Collider | null => {
      if (!world || !rapier || !mountedRef.current) return null;
      return world.createCollider(desc, parent);
    },
    [world, rapier],
  );

  const removeRigidBody = React.useCallback(
    (body: RAPIER.RigidBody): void => {
      if (!world) return;
      world.removeRigidBody(body);
    },
    [world],
  );

  const removeCollider = React.useCallback(
    (collider: RAPIER.Collider): void => {
      if (!world) return;
      world.removeCollider(collider, false);
    },
    [world],
  );

  const raycast = React.useCallback(
    (origin: Vector3, direction: Vector3, maxDistance: number): RAPIER.RayColliderHit | null => {
      if (!world || !rapier) return null;
      const ray = new rapier.Ray(origin, direction);
      return world.castRay(ray, maxDistance, false);
    },
    [world, rapier],
  );

  const step = React.useCallback((): void => {
    if (!world || !mountedRef.current) return;
    // RAPIER world.step() without parameters (auto timestep)
    (world as any).step();
  }, [world]);

  const setBodyPosition = React.useCallback((body: RAPIER.RigidBody, position: Vector3): void => {
    body.setTranslation(position, true);
  }, []);

  const setBodyRotation = React.useCallback(
    (body: RAPIER.RigidBody, rotation: Quaternion): void => {
      body.setRotation(rotation, true);
    },
    [],
  );

  const setBodyVelocity = React.useCallback((body: RAPIER.RigidBody, velocity: Vector3): void => {
    body.setLinvel(velocity, true);
  }, []);

  const getBodyPosition = React.useCallback((body: RAPIER.RigidBody): Vector3 => {
    return body.translation();
  }, []);

  const getBodyRotation = React.useCallback((body: RAPIER.RigidBody): Quaternion => {
    return body.rotation();
  }, []);

  const value: PhysicsContextType = {
    rapier,
    world,
    isInitialized,
    createRigidBody,
    createCollider,
    removeRigidBody,
    removeCollider,
    raycast,
    step,
    setBodyPosition,
    setBodyRotation,
    setBodyVelocity,
    getBodyPosition,
    getBodyRotation,
  };

  return <PhysicsContext.Provider value={value}>{children}</PhysicsContext.Provider>;
};

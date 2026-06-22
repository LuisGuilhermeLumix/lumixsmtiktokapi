"use client";

// Parte pesada do hero (three.js + r3f) isolada para carregar via next/dynamic
// (ssr:false) — mantém o bundle 3D fora do First Load JS da landing.

import { Canvas, useFrame } from "@react-three/fiber";
import { PerspectiveCamera } from "@react-three/drei";
import React, { useRef } from "react";
import * as THREE from "three";

const Globe: React.FC<{
  rotationSpeed: number;
  radius: number;
  color: string;
}> = ({ rotationSpeed, radius, color }) => {
  const groupRef = useRef<THREE.Group>(null!);

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.rotation.y += rotationSpeed;
      groupRef.current.rotation.x += rotationSpeed * 0.3;
      groupRef.current.rotation.z += rotationSpeed * 0.1;
    }
  });

  return (
    <group ref={groupRef}>
      <mesh>
        <sphereGeometry args={[radius, 64, 64]} />
        <meshBasicMaterial color={color} transparent opacity={0.18} wireframe />
      </mesh>
    </group>
  );
};

export function GlobeCanvas({
  rotationSpeed,
  globeRadius,
  color,
}: {
  rotationSpeed: number;
  globeRadius: number;
  color: string;
}) {
  return (
    <Canvas>
      <PerspectiveCamera makeDefault position={[0, 0, 3]} fov={75} />
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} intensity={1} />

      <Globe rotationSpeed={rotationSpeed} radius={globeRadius} color={color} />
    </Canvas>
  );
}

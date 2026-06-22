"use client";

import dynamic from "next/dynamic";
import React from "react";
import { cn } from "@/lib/utils";

// O Canvas 3D (three/r3f) é carregado só no client, depois da hidratação,
// num chunk separado — o conteúdo (children) continua no HTML estático.
const GlobeCanvas = dynamic(
  () => import("./globe-canvas").then((m) => m.GlobeCanvas),
  { ssr: false },
);

interface DotGlobeHeroProps extends React.HTMLAttributes<HTMLDivElement> {
  rotationSpeed?: number;
  globeRadius?: number;
  /**
   * Cor do wireframe. THREE.Color não resolve `hsl(var(--token))` (CSS vars),
   * então passe uma cor literal (hex/rgb/hsl). Default = roxo Lumix.
   */
  color?: string;
  className?: string;
  children?: React.ReactNode;
}

const DotGlobeHero = React.forwardRef<HTMLDivElement, DotGlobeHeroProps>(
  (
    {
      rotationSpeed = 0.005,
      globeRadius = 1,
      color = "#8b5cf6",
      className,
      children,
      ...props
    },
    ref,
  ) => {
    return (
      <div
        ref={ref}
        className={cn("relative w-full overflow-hidden", className)}
        {...props}
      >
        <div className="relative z-10 flex h-full flex-col items-center justify-center">
          {children}
        </div>

        <div className="pointer-events-none absolute inset-0 z-0">
          <GlobeCanvas
            rotationSpeed={rotationSpeed}
            globeRadius={globeRadius}
            color={color}
          />
        </div>
      </div>
    );
  },
);

DotGlobeHero.displayName = "DotGlobeHero";

export { DotGlobeHero, type DotGlobeHeroProps };

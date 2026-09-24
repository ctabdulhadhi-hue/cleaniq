import React, { useEffect, useRef, useState } from 'react';
import { Renderer, Camera, Geometry, Program, Mesh } from 'ogl';

export interface ParticlesProps {
  particleCount?: number;
  particleSpread?: number;
  speed?: number;
  particleColors?: string[];
  moveParticlesOnHover?: boolean;
  particleHoverFactor?: number;
  alphaParticles?: boolean;
  particleBaseSize?: number;
  sizeRandomness?: number;
  cameraDistance?: number;
  disableRotation?: boolean;
  pixelRatio?: number;
  className?: string;
  fallbackGlow?: boolean;
}

const defaultOrangeColors: string[] = ['#ff6a3d', '#ff8a65', '#ffa07a'];

const hexToRgb = (hex: string): [number, number, number] => {
  let cleanHex = hex.replace(/^#/, '');
  if (cleanHex.length === 3) {
    cleanHex = cleanHex
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const int = parseInt(cleanHex.slice(0, 6), 16);
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;
  return [r, g, b];
};

const vertexShader = /* glsl */ `
  attribute vec3 position;
  attribute vec4 random;
  attribute vec3 color;
  
  uniform mat4 modelMatrix;
  uniform mat4 viewMatrix;
  uniform mat4 projectionMatrix;
  uniform float uTime;
  uniform float uSpread;
  uniform float uBaseSize;
  uniform float uSizeRandomness;
  
  varying vec4 vRandom;
  varying vec3 vColor;
  
  void main() {
    vRandom = random;
    vColor = color;
    
    vec3 pos = position * uSpread;
    pos.z *= 6.0;
    
    vec4 mPos = modelMatrix * vec4(pos, 1.0);
    float t = uTime;
    mPos.x += sin(t * random.z + 6.28 * random.w) * mix(0.1, 0.8, random.x);
    mPos.y += sin(t * random.y + 6.28 * random.x) * mix(0.1, 0.8, random.w);
    mPos.z += sin(t * random.w + 6.28 * random.y) * mix(0.1, 0.8, random.z);
    
    vec4 mvPos = viewMatrix * mPos;

    if (uSizeRandomness == 0.0) {
      gl_PointSize = uBaseSize;
    } else {
      gl_PointSize = (uBaseSize * (1.0 + uSizeRandomness * (random.x - 0.5))) / length(mvPos.xyz);
    }
    
    gl_Position = projectionMatrix * mvPos;
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  
  uniform float uTime;
  uniform float uAlphaParticles;
  varying vec4 vRandom;
  varying vec3 vColor;
  
  void main() {
    vec2 uv = gl_PointCoord.xy;
    float d = length(uv - vec2(0.5));
    
    if (d > 0.5) {
      discard;
    }
    
    float circle = smoothstep(0.5, 0.1, d) * 0.7;
    gl_FragColor = vec4(vColor, circle);
  }
`;

export const Particles: React.FC<ParticlesProps> = ({
  particleCount = 65,
  particleSpread = 12,
  speed = 0.07,
  particleColors = defaultOrangeColors,
  moveParticlesOnHover = true,
  particleHoverFactor = 0.5,
  alphaParticles = true,
  particleBaseSize = 110,
  sizeRandomness = 0.8,
  cameraDistance = 22,
  disableRotation = false,
  pixelRatio = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio, 2) : 1,
  className = '',
  fallbackGlow = true,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [reducedMotion, setReducedMotion] = useState(false);
  const [webGlSupported, setWebGlSupported] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);

    const handleMotionChange = (e: MediaQueryListEvent) => {
      setReducedMotion(e.matches);
    };

    mq.addEventListener('change', handleMotionChange);
    return () => mq.removeEventListener('change', handleMotionChange);
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    const container = containerRef.current;
    if (!container) return;

    let renderer: Renderer | null = null;
    let animationFrameId: number;

    try {
      renderer = new Renderer({ dpr: pixelRatio, depth: false, alpha: true });
      const gl = renderer.gl;
      container.appendChild(gl.canvas);
      gl.clearColor(0, 0, 0, 0);

      const camera = new Camera(gl, { fov: 15 });
      camera.position.set(0, 0, cameraDistance);

      const resize = () => {
        if (!container || !renderer) return;
        const width = container.clientWidth || 800;
        const height = container.clientHeight || 400;
        renderer.setSize(width, height);
        camera.perspective({ aspect: gl.canvas.width / (gl.canvas.height || 1) });
      };

      window.addEventListener('resize', resize, false);
      resize();

      const handleMouseMove = (e: MouseEvent) => {
        const rect = container.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
        mouseRef.current = { x, y };
      };

      if (moveParticlesOnHover) {
        window.addEventListener('mousemove', handleMouseMove);
      }

      const count = particleCount;
      const positions = new Float32Array(count * 3);
      const randoms = new Float32Array(count * 4);
      const colors = new Float32Array(count * 3);
      const palette = particleColors.length > 0 ? particleColors : defaultOrangeColors;

      for (let i = 0; i < count; i++) {
        let x: number, y: number, z: number, len: number;
        do {
          x = Math.random() * 2 - 1;
          y = Math.random() * 2 - 1;
          z = Math.random() * 2 - 1;
          len = x * x + y * y + z * z;
        } while (len > 1 || len === 0);
        const r = Math.cbrt(Math.random());
        positions.set([x * r, y * r, z * r], i * 3);
        randoms.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
        const col = hexToRgb(palette[Math.floor(Math.random() * palette.length)]);
        colors.set(col, i * 3);
      }

      const geometry = new Geometry(gl, {
        position: { size: 3, data: positions },
        random: { size: 4, data: randoms },
        color: { size: 3, data: colors },
      });

      const program = new Program(gl, {
        vertex: vertexShader,
        fragment: fragmentShader,
        uniforms: {
          uTime: { value: 0 },
          uSpread: { value: particleSpread },
          uBaseSize: { value: particleBaseSize * pixelRatio },
          uSizeRandomness: { value: sizeRandomness },
          uAlphaParticles: { value: alphaParticles ? 1 : 0 },
        },
        transparent: true,
        depthTest: false,
      });

      const particles = new Mesh(gl, { mode: gl.POINTS, geometry, program });

      let lastTime = performance.now();
      let elapsed = 0;

      const update = (t: number) => {
        animationFrameId = requestAnimationFrame(update);
        const delta = t - lastTime;
        lastTime = t;
        elapsed += delta * speed;

        program.uniforms.uTime.value = elapsed * 0.001;

        if (moveParticlesOnHover) {
          particles.position.x = -mouseRef.current.x * particleHoverFactor;
          particles.position.y = -mouseRef.current.y * particleHoverFactor;
        }

        if (!disableRotation) {
          particles.rotation.x = Math.sin(elapsed * 0.0002) * 0.05;
          particles.rotation.y = Math.cos(elapsed * 0.0004) * 0.08;
          particles.rotation.z += 0.005 * speed;
        }

        renderer?.render({ scene: particles, camera });
      };

      animationFrameId = requestAnimationFrame(update);

      return () => {
        window.removeEventListener('resize', resize);
        if (moveParticlesOnHover) {
          window.removeEventListener('mousemove', handleMouseMove);
        }
        cancelAnimationFrame(animationFrameId);
        if (container.contains(gl.canvas)) {
          container.removeChild(gl.canvas);
        }
      };
    } catch {
      setWebGlSupported(false);
    }
  }, [
    particleCount,
    particleSpread,
    speed,
    moveParticlesOnHover,
    particleHoverFactor,
    alphaParticles,
    particleBaseSize,
    sizeRandomness,
    cameraDistance,
    disableRotation,
    pixelRatio,
    particleColors,
    reducedMotion,
  ]);

  // If reduced motion is preferred or WebGL unsupported, render static brand radial glow
  if (reducedMotion || !webGlSupported) {
    return (
      <div className={`relative w-full h-full pointer-events-none ${className}`}>
        {fallbackGlow && (
          <div
            className="absolute inset-0 rounded-full blur-3xl opacity-60"
            style={{
              background:
                'radial-gradient(ellipse at center, rgba(255, 106, 61, 0.18) 0%, rgba(255, 106, 61, 0) 70%)',
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full pointer-events-none ${className}`}
    >
      {fallbackGlow && (
        <div
          className="absolute inset-0 rounded-full blur-3xl opacity-50 -z-10"
          style={{
            background:
              'radial-gradient(ellipse at center, rgba(255, 106, 61, 0.16) 0%, rgba(255, 106, 61, 0) 70%)',
          }}
        />
      )}
    </div>
  );
};

export default Particles;

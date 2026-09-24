import React from 'react';

export interface DarkVeilProps {
  hueShift?: number;
  noiseIntensity?: number;
  scanlineIntensity?: number;
  speed?: number;
  scanlineFrequency?: number;
  warpAmount?: number;
  resolutionScale?: number;
  lightMode?: boolean;
}

declare const DarkVeil: React.ComponentType<DarkVeilProps>;
export default DarkVeil;

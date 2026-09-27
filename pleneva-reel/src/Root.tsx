import React from "react";
import { Composition } from "remotion";
import { Reel } from "./Reel";
import { DURATION, FPS, H, W } from "./theme";

export const Root: React.FC = () => (
  <Composition id="ColaReel" component={Reel} durationInFrames={DURATION} fps={FPS} width={W} height={H} />
);

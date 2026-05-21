import React from "react";
import { Composition } from "remotion";
import { VaultysClawPromo } from "./Video";

export const Root: React.FC = () => (
  <>
    <Composition
      id="VaultysClawPromo"
      component={VaultysClawPromo}
      durationInFrames={1880}
      fps={30}
      width={1920}
      height={1080}
    />
  </>
);

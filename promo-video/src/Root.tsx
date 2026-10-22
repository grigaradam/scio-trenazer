import { Composition, Folder } from "remotion";
import { PROMO_DURATION, PromoVideo, SCENES, withBackground } from "./PromoVideo";
import { FPS, HEIGHT, WIDTH } from "./theme";

// Laid out at 1920×1080; remotion.config.ts renders at scale 2 → 3840×2160 (4K).
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Promo"
        component={PromoVideo}
        durationInFrames={PROMO_DURATION}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Folder name="Sceny">
        {SCENES.map((s) => (
          <Composition
            key={s.id}
            id={s.id}
            component={withBackground(s.component)}
            durationInFrames={s.durationInFrames}
            fps={FPS}
            width={WIDTH}
            height={HEIGHT}
          />
        ))}
      </Folder>
    </>
  );
};

declare module 'canvas-confetti' {
  const confetti: {
    (options?: confetti.Options): Promise<null>;
    create(
      canvas: HTMLCanvasElement,
      options?: confetti.GlobalOptions
    ): (options?: confetti.Options) => Promise<null>;
  };
  namespace confetti {
    interface Options {
      particleCount?: number;
      angle?: number;
      spread?: number;
      startVelocity?: number;
      decay?: number;
      gravity?: number;
      drift?: number;
      ticks?: number;
      origin?: { x: number; y: number };
      colors?: string[];
      scalar?: number;
      zIndex?: number;
    }
    interface GlobalOptions {
      resize?: boolean;
      useWorker?: boolean;
    }
  }
  export = confetti;
} 
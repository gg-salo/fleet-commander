"use client";

interface PipelineConnectorProps {
  fromColor: string;
  toColor: string;
}

/**
 * Animated arrow connector between pipeline columns.
 * Thin vertical strip with a dashed line and flowing gradient.
 */
export function PipelineConnector({ fromColor, toColor }: PipelineConnectorProps) {
  return (
    <div className="flex w-8 shrink-0 items-center justify-center">
      <div className="relative h-0.5 w-full">
        {/* Dashed line */}
        <div
          className="absolute inset-0 border-t-[2px] border-dashed"
          style={{ borderColor: `color-mix(in srgb, ${fromColor} 50%, ${toColor})` }}
        />
        {/* Animated flow overlay */}
        <div className="pipeline-flow absolute inset-0 opacity-60" />
        {/* Arrow tip */}
        <svg
          className="absolute -right-1 top-1/2 h-2 w-2 -translate-y-1/2"
          viewBox="0 0 8 8"
          fill="none"
        >
          <path d="M1 1L5 4L1 7" stroke={toColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}

import { LoadingBlock } from "@/components/umerco/LoadingBlock";

export function PageFallback({ message = "Loading…" }: { message?: string }) {
  return (
    <div className="relative flex min-h-[calc(100dvh-9.5rem)] w-full items-center justify-center">
      <LoadingBlock message={message} size="md" />
    </div>
  );
}

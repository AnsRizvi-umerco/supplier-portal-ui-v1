import { lazy, Suspense } from "react";
import { LoadingBlock } from "@/components/umerco/LoadingBlock";

const SchedulesBoard = lazy(() =>
  import("@/components/schedules-board").then((module) => ({ default: module.SchedulesBoard }))
);

export default function SchedulesPage() {
  return (
    <Suspense
      fallback={
        <div className="relative flex min-h-[calc(100dvh-9.5rem)] w-full items-center justify-center">
          <LoadingBlock message="Loading schedules…" size="md" />
        </div>
      }
    >
      <div className="w-full">
        <SchedulesBoard />
      </div>
    </Suspense>
  );
}

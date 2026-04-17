"use client";
import dynamic from "next/dynamic";

const VesselMap = dynamic(() => import("./VesselMap"), {
  ssr: false,
  loading: () => (
    <div className="h-[420px] rounded-lg border border-border flex items-center justify-center text-muted text-sm">
      Loading map…
    </div>
  ),
});

export default VesselMap;

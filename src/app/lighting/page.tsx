import { Lightbulb } from "lucide-react";

export default function LightingPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <h1 className="flex items-center gap-2 text-[22px] font-bold">
        <Lightbulb className="h-5 w-5 text-mute" strokeWidth={2} />
        照明
      </h1>
    </div>
  );
}

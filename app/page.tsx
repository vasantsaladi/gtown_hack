// import { Button } from "@/components/ui/button";
// import { Slider } from "@/components/ui/slider";
import Mapbox from "@/app/components/ui/Mapbox";
import { ToolBar } from "@/app/components/ui/ToolBar";

export default function Home() {
  return (
    <main className="h-screen w-screen relative">
      <Mapbox />
      <ToolBar />
    </main>
  );
}

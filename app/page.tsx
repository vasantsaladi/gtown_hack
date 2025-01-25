// import { Button } from "@/components/ui/button";
// import { Slider } from "@/components/ui/slider";
//import Mapbox from "@/app/components/ui/Mapbox";
import { ToolBar } from "@/app/components/ui/ToolBar";
import { Mapbox } from "@/app/components/ui/Mapbox";

export default function Home() {
  return (
    <main className="h-screen w-screen relative">
      <Mapbox mapboxToken={process.env.MAPBOX_TOKEN || ""} />
      <ToolBar />
    </main>
  );
}

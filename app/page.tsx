import { Button } from "./components/ui/Button";
import { Slider } from "./components/ui/slider";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <div className="flex flex-col gap-4 w-full max-w-md">
        {/* Button Component */}
        <Button variant="default">Click me</Button>

        {/* Slider Component */}
        <div className="w-full">
          <Slider defaultValue={[50]} max={100} step={1} />
        </div>
      </div>
    </main>
  );
}

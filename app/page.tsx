import Image from "next/image";
import { Button } from "./components/Button";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center">
      <Button variant="default" size="lg">
        Click me!
      </Button>
    </main>
  );
}

"use client";
import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import * as turf from "@turf/turf";

interface SimulationLayerProps {
  map: mapboxgl.Map;
}

interface Person {
  id: string;
  marker: mapboxgl.Marker;
  home: [number, number];
  targetStore: [number, number];
  progress: number;
  isReturning: boolean;
}

export function SimulationLayer({ map }: SimulationLayerProps) {
  const animationFrameRef = useRef<number | null>(null);
  const peopleRef = useRef<Person[]>([]);

  useEffect(() => {
    console.log("SimulationLayer mounted");

    const createPeople = () => {
      console.log("Creating people");
      const newPeople = Array.from({ length: 10 }, (_, i) => {
        const home: [number, number] = [
          -77.03 + Math.random() * 0.05,
          38.89 + Math.random() * 0.05,
        ];

        const el = document.createElement("div");
        el.style.cssText = `
          width: 20px;
          height: 20px;
          background-color: red;
          border-radius: 50%;
          border: 3px solid white;
        `;

        const marker = new mapboxgl.Marker(el).setLngLat(home).addTo(map);

        return {
          id: `person-${i}`,
          marker,
          home,
          targetStore: [-77.02, 38.9] as [number, number],
          progress: Math.random(),
          isReturning: false,
        };
      });

      peopleRef.current = newPeople;
    };

    const animate = () => {
      const currentPeople = peopleRef.current;
      const updatedPeople = currentPeople.map((person) => {
        const route = person.isReturning
          ? [person.targetStore, person.home]
          : [person.home, person.targetStore];

        const line = turf.lineString(route);
        const distance = turf.length(line);
        const currentPosition = turf.along(line, person.progress * distance);

        person.marker.setLngLat(
          currentPosition.geometry.coordinates as [number, number]
        );

        let newProgress = person.progress + 0.001;
        let isReturning = person.isReturning;

        if (newProgress >= 1) {
          newProgress = 0;
          isReturning = !isReturning;
        }

        return {
          ...person,
          progress: newProgress,
          isReturning,
        };
      });

      peopleRef.current = updatedPeople;
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    createPeople();
    animate();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      peopleRef.current.forEach((person) => person.marker.remove());
    };
  }, [map]);

  return null;
}

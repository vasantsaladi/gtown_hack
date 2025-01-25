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
  route: [number, number][];
}

export function SimulationLayer({ map }: SimulationLayerProps) {
  const animationFrameRef = useRef<number | null>(null);
  const peopleRef = useRef<Person[]>([]);

  const getRoute = async (start: [number, number], end: [number, number]) => {
    const query = await fetch(
      `https://api.mapbox.com/directions/v5/mapbox/walking/${start[0]},${start[1]};${end[0]},${end[1]}?steps=true&geometries=geojson&access_token=${mapboxgl.accessToken}`
    );
    const json = await query.json();
    return json.routes[0].geometry.coordinates as [number, number][];
  };

  useEffect(() => {
    console.log("SimulationLayer mounted");

    const createPeople = async () => {
      console.log("Creating people");
      const newPeople: Person[] = [];

      for (let i = 0; i < 10; i++) {
        const home: [number, number] = [
          -77.03 + Math.random() * 0.05,
          38.89 + Math.random() * 0.05,
        ];
        const targetStore: [number, number] = [-77.02, 38.9];

        const initialRoute = await getRoute(home, targetStore);

        const el = document.createElement("div");
        el.style.cssText = `
          width: 20px;
          height: 20px;
          background-color: red;
          border-radius: 50%;
          border: 3px solid white;
        `;

        const marker = new mapboxgl.Marker(el).setLngLat(home).addTo(map);

        newPeople.push({
          id: `person-${i}`,
          marker,
          home,
          targetStore,
          progress: 0,
          isReturning: false,
          route: initialRoute,
        });
      }

      peopleRef.current = newPeople;
    };

    const animate = () => {
      const currentPeople = peopleRef.current;
      const updatedPeople = currentPeople.map((person) => {
        const route = person.route;
        const distance = turf.length(turf.lineString(route));
        const currentPosition = turf.along(
          turf.lineString(route),
          person.progress * distance
        );

        person.marker.setLngLat(
          currentPosition.geometry.coordinates as [number, number]
        );

        let newProgress = person.progress + 0.001;
        let isReturning = person.isReturning;
        const newRoute = person.route;

        if (newProgress >= 1) {
          newProgress = 0;
          isReturning = !isReturning;
          getRoute(
            isReturning ? person.targetStore : person.home,
            isReturning ? person.home : person.targetStore
          ).then((route) => {
            person.route = route;
          });
        }

        return {
          ...person,
          progress: newProgress,
          isReturning,
          route: newRoute,
        };
      });

      peopleRef.current = updatedPeople;
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    createPeople().then(() => {
      animate();
    });

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      peopleRef.current.forEach((person) => person.marker.remove());
    };
  }, [map]);

  return null;
}

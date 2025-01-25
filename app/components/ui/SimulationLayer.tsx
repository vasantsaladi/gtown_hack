import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { SpatialIndex } from "@/lib/spatialIndex";
import { Feature, Point } from "geojson";
import { point } from "@turf/helpers";
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

interface ResidentProperties {
  id: string;
  address: string;
  ward: string;
}

interface StoreFeature extends Feature<Point> {
  properties: {
    STORENAME: string;
    [key: string]: unknown;
  };
}

export function SimulationLayer({ map }: SimulationLayerProps) {
  const [people, setPeople] = useState<Person[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const spatialIndexRef = useRef<SpatialIndex | null>(null);
  const animateRef = useRef<(() => void) | null>(null);

  // Initialize simulation
  useEffect(() => {
    const animate = () => {
      setPeople((currentPeople) =>
        currentPeople.map((person) => {
          const route = person.isReturning
            ? [person.targetStore, person.home]
            : [person.home, person.targetStore];

          const currentPosition = turf.along(
            turf.lineString(route),
            person.progress * turf.length(turf.lineString(route))
          );

          person.marker.setLngLat(
            currentPosition.geometry.coordinates as [number, number]
          );

          let newProgress = person.progress + 0.002;
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
        })
      );

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animateRef.current = animate;

    const initializeSimulation = async () => {
      try {
        console.log("Starting simulation initialization...");

        // Create sample residents (randomly distributed)
        const residents: Feature<Point, ResidentProperties>[] = Array.from(
          { length: 100 },
          (_, i) => {
            // Random points within DC bounds
            const lat = 38.89 + Math.random() * 0.1; // DC latitude range
            const lng = -77.03 + Math.random() * 0.1; // DC longitude range
            return point([lng, lat], {
              id: `resident-${i}`,
              address: `Sample Address ${i}`,
              ward: `Ward ${Math.floor(Math.random() * 8) + 1}`,
            });
          }
        );

        console.log("Created residents:", residents.length);

        // Load grocery store data
        const storesResponse = await fetch(
          "/data/Grocery_Store_Locations.geojson"
        );
        const storesData = await storesResponse.json();

        console.log("Loaded stores:", storesData.features.length);

        // Initialize spatial index
        spatialIndexRef.current = new SpatialIndex(
          storesData.features.map((store: StoreFeature) => ({
            type: "Feature",
            geometry: store.geometry,
            properties: { ...store.properties, id: store.properties.STORENAME },
          })),
          residents
        );

        console.log("Created spatial index");

        // Create markers for each resident
        const newPeople = residents.map((resident) => {
          const home = resident.geometry.coordinates as [number, number];
          const nearestStores =
            spatialIndexRef.current?.queryNearestStores(home);
          const targetStore = nearestStores?.[0]?.coordinates || home;

          console.log("Creating marker at:", home);

          const el = document.createElement("div");
          el.className = "person-marker";
          el.style.width = "8px";
          el.style.height = "8px";
          el.style.borderRadius = "50%";
          el.style.backgroundColor = "#ff0000"; // Red for better visibility
          el.style.opacity = "1"; // Full opacity

          const marker = new mapboxgl.Marker(el)
            .setLngLat(home)
            .setPopup(
              new mapboxgl.Popup({ offset: 25 }).setHTML(
                `<div class="p-2">
                  <p class="text-sm">${resident.properties.address}</p>
                  <p class="text-xs text-gray-600">Ward ${resident.properties.ward}</p>
                </div>`
              )
            )
            .addTo(map);

          return {
            id: resident.properties.id,
            marker,
            home,
            targetStore,
            progress: Math.random(),
            isReturning: Math.random() > 0.5,
          };
        });

        console.log("Created people:", newPeople.length);

        setPeople(newPeople);

        // Start animation
        if (animateRef.current) {
          console.log("Starting animation");
          animateRef.current();
        }
      } catch (error) {
        console.error("Error initializing simulation:", error);
      }
    };

    if (map) {
      console.log("Map is ready, initializing simulation");
      initializeSimulation();
    }

    return () => {
      console.log("Cleaning up simulation");
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      people.forEach((person) => person.marker.remove());
    };
  }, [map, people]);

  return null;
}

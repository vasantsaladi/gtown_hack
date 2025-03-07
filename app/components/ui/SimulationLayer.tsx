"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import * as turf from "@turf/turf";

interface CustomWindow extends Window {
  reloadAndReroute?: () => Promise<void>;
}

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
  tractId: string;
}

interface StoreFeature {
  geometry: {
    coordinates: [number, number];
  };
}

interface MongoStore {
  geometry: {
    coordinates: [number, number];
  };
}

interface TractData {
  origin: {
    type: string;
    coordinates: [number, number];
  };
}

interface FoodAccessFeature extends GeoJSON.Feature {
  properties: {
    PERCENTUND185: number;
  } | null;
}

export function SimulationLayer({ map }: SimulationLayerProps) {
  const peopleRef = useRef<Person[]>([]);
  const routeCacheRef = useRef<Map<string, [number, number][]>>(new Map());
  const animationRef = useRef<number>(0);
  const [, setForceUpdate] = useState(0);
  const lastRequestRef = useRef<number>(0);
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);

  const getRoute = useCallback(
    async (
      start: [number, number],
      end: [number, number]
    ): Promise<[number, number][]> => {
      const cacheKey = `${start[0]},${start[1]}-${end[0]},${end[1]}`;
      const reverseKey = `${end[0]},${end[1]}-${start[0]},${start[1]}`;

      if (routeCacheRef.current.has(cacheKey))
        return routeCacheRef.current.get(cacheKey)!;
      if (routeCacheRef.current.has(reverseKey))
        return [...routeCacheRef.current.get(reverseKey)!].reverse();

      const now = Date.now();
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(300 - (now - lastRequestRef.current), 0))
      );
      lastRequestRef.current = Date.now();

      try {
        const response = await fetch(
          `https://api.mapbox.com/directions/v5/mapbox/walking/${start[0]},${start[1]};${end[0]},${end[1]}?` +
            new URLSearchParams({
              steps: "true",
              geometries: "geojson",
              overview: "full",
              access_token: mapboxgl.accessToken as string,
              approaches: "curb;curb",
            })
        );

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const json = await response.json();
        const route = json.routes?.[0]?.geometry?.coordinates || [];

        if (route.length > 1) {
          routeCacheRef.current.set(cacheKey, route);
          routeCacheRef.current.set(reverseKey, [...route].reverse());
        }

        return route as [number, number][];
      } catch (err) {
        console.error("Routing error:", err);
        return [];
      }
    },
    []
  );

  const findNearestStore = useCallback(
    (
      point: [number, number],
      stores: { features: StoreFeature[] }
    ): [number, number] => {
      let nearest = point;
      let minDistance = Infinity;

      stores.features.forEach((store) => {
        const storeCoords = store.geometry.coordinates;
        const distance = turf.distance(
          turf.point(point),
          turf.point(storeCoords)
        );
        if (distance < minDistance) {
          minDistance = distance;
          nearest = storeCoords;
        }
      });

      return nearest;
    },
    []
  );

  const startAnimation = useCallback(() => {
    const FIXED_SPEED = 0.0025;

    const animate = () => {
      peopleRef.current.forEach((person) => {
        const route = person.isReturning
          ? [...person.route].reverse()
          : person.route;

        if (route.length < 2) return;

        const line = turf.lineString(route);
        const distance = turf.length(line);
        const position = turf.along(line, person.progress * distance).geometry
          .coordinates as [number, number];

        person.marker.setLngLat(position);

        person.progress += FIXED_SPEED;
        if (person.progress >= 1) {
          person.progress = 0;
          person.isReturning = !person.isReturning;
        }
      });

      setForceUpdate((prev) => prev + 1);
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      console.log("Starting initialization...");
      setLoading(true);
      setLoadingProgress(0);

      try {
        const originsRes = await fetch("/data/start_point.json");
        if (!originsRes.ok) {
          throw new Error("Failed to load start_point.json");
        }
        const origins = (await originsRes.json()) as Record<string, TractData>;
        console.log("Loaded origins:", Object.keys(origins).length);
        setLoadingProgress(10);

        const storesRes = await fetch("/data/Grocery_Store_Locations.geojson");
        if (!storesRes.ok) {
          throw new Error("Failed to load stores data");
        }
        const stores = await storesRes.json();
        setLoadingProgress(20);

        console.log("Creating dots for each tract...");
        const people: Person[] = [];

        const totalOrigins = Object.keys(origins).length;
        let processedOrigins = 0;

        // Create a dot for each origin point in the JSON
        for (const [tractId, data] of Object.entries(origins)) {
          const coordinates = data.origin.coordinates;

          // Create marker with small random offset
          const home: [number, number] = [
            coordinates[0] + (Math.random() - 0.5) * 0.0001,
            coordinates[1] + (Math.random() - 0.5) * 0.0001,
          ];

          const targetStore = findNearestStore(home, stores);

          const el = document.createElement("div");
          el.style.cssText = `
            width: 13px;
            height: 13px;
            background-color: #2ecc71;
            border-radius: 50%;
            border: 2px solid white;
            box-shadow: 0 0 4px rgba(0,0,0,0.6);
          `;

          const marker = new mapboxgl.Marker({
            element: el,
            anchor: "center",
          })
            .setLngLat(home)
            .addTo(map);

          const route = await getRoute(home, targetStore);
          if (route.length > 1) {
            people.push({
              id: `person-${tractId}`,
              marker,
              home,
              targetStore,
              progress: Math.random(),
              isReturning: Math.random() > 0.5,
              route,
              tractId,
            });
            console.log(`Created dot for tract ${tractId}`);
          } else {
            marker.remove();
            console.warn(`No valid route for tract ${tractId}`);
          }

          // Update loading progress
          processedOrigins++;
          setLoadingProgress(
            20 + Math.floor((processedOrigins / totalOrigins) * 70)
          );

          // Add delay between route requests
          await new Promise((resolve) => setTimeout(resolve, 300));
          if (!mounted) break;
        }

        console.log(`Created ${people.length} active dots`);
        peopleRef.current = people;

        if (people.length > 0) {
          startAnimation();
        }

        setLoadingProgress(100);
        setTimeout(() => {
          if (mounted) setLoading(false);
        }, 500); // Short delay to show 100% before hiding
      } catch (error) {
        console.error("Initialization error:", error);
        setLoading(false);
      }
    };

    initialize();

    return () => {
      mounted = false;
      cancelAnimationFrame(animationRef.current);
      peopleRef.current.forEach((p) => p.marker.remove());
    };
  }, [map, findNearestStore, getRoute, startAnimation]);

  const reloadAndReroute = useCallback(async () => {
    try {
      // Fetch all stores
      const response = await fetch("/api/get-stores");
      const stores = await response.json();

      // Fetch the food access areas data afresh
      const foodAccessResponse = await fetch(
        "/data/Low_Food_Access_Areas.geojson"
      );
      const foodAccessData = await foodAccessResponse.json();

      // Update food access areas
      if (foodAccessData.features) {
        foodAccessData.features = foodAccessData.features.map(
          (feature: FoodAccessFeature) => {
            const areaCenter = turf.center(feature);

            // Check if any store is within 1 mile of the area center
            const hasNearbyStore = stores.some((store: MongoStore) => {
              const storePoint = turf.point([
                store.geometry.coordinates[0],
                store.geometry.coordinates[1],
              ]);
              const distance = turf.distance(areaCenter, storePoint, {
                units: "miles",
              });
              return distance <= 1;
            });

            if (hasNearbyStore && feature.properties) {
              feature.properties.PERCENTUND185 = 0;
            }
            return feature;
          }
        );

        const foodAccessSource = map.getSource(
          "food-access"
        ) as mapboxgl.GeoJSONSource;
        if (foodAccessSource) {
          foodAccessSource.setData(foodAccessData);
        }
      }

      // Continue with existing person rerouting code...
      for (const person of peopleRef.current) {
        let nearestStore = person.targetStore;
        let minDistance = turf.distance(
          turf.point(person.home),
          turf.point(nearestStore)
        );

        stores.forEach((store: MongoStore) => {
          const storeCoords: [number, number] = [
            store.geometry.coordinates[0],
            store.geometry.coordinates[1],
          ];

          const distance = turf.distance(
            turf.point(person.home),
            turf.point(storeCoords)
          );

          if (distance < minDistance) {
            minDistance = distance;
            nearestStore = storeCoords;
          }
        });

        if (nearestStore !== person.targetStore) {
          person.targetStore = nearestStore;
          person.progress = 0;
          person.isReturning = false;
          const newRoute = await getRoute(person.home, nearestStore);
          if (newRoute.length > 1) {
            person.route = newRoute;
          }
        }
      }
    } catch (err) {
      console.error("Error reloading routes:", err);
    }
  }, [getRoute]);

  useEffect(() => {
    (window as CustomWindow).reloadAndReroute = reloadAndReroute;
    return () => {
      delete (window as CustomWindow).reloadAndReroute;
    };
  }, [reloadAndReroute]);

  return (
    <>
      {loading && (
        <div className="absolute inset-0 bg-black bg-opacity-80 flex flex-col items-center justify-center z-50 p-4 overflow-auto">
          <div className="text-white text-2xl font-bold mb-4">
            Loading Food Access Simulation
          </div>
          <div className="w-64 h-3 bg-gray-700 rounded-full overflow-hidden mb-2">
            <div
              className="h-full bg-green-500 transition-all duration-300 ease-out"
              style={{ width: `${loadingProgress}%` }}
            ></div>
          </div>
          <div className="text-white mb-2">{loadingProgress}%</div>
          <div className="text-white text-sm mb-6">
            Creating routes for people to travel between homes and grocery
            stores...
          </div>

          <div className="max-w-2xl bg-gray-900 p-6 rounded-lg text-white text-sm">
            <h2 className="text-xl font-bold mb-3">
              While You Wait: Quick Guide to the Simulation
            </h2>

            <h3 className="text-lg font-semibold mt-4 mb-2">
              Population Simulation
            </h3>
            <ul className="list-disc pl-5 mb-3 space-y-1">
              <li>
                Green dots represent DC residents moving between homes and
                grocery stores
              </li>
              <li>
                Movement follows actual walking routes using Mapbox Directions
                API
              </li>
              <li>One dot per census tract shows typical travel patterns</li>
              <li>Routes update dynamically when new stores are added</li>
            </ul>

            <h3 className="text-lg font-semibold mt-4 mb-2">
              Food Desert Analysis
            </h3>
            <p className="mb-2">
              Color gradient showing food insecurity levels:
            </p>
            <ul className="list-disc pl-5 mb-3 space-y-1">
              <li>
                <span className="text-pink-300">Light pink</span>: 0-30%
                (minimal food access issues)
              </li>
              <li>
                <span className="text-orange-300">Light orange</span>: 30-50%
                (emerging food desert)
              </li>
              <li>
                <span className="text-orange-500">Orange-red</span>: 50-70%
                (significant food access problems)
              </li>
              <li>
                <span className="text-red-600">Deep red</span>: 70-100% (severe
                food desert)
              </li>
            </ul>

            <h3 className="text-lg font-semibold mt-4 mb-2">
              Using the Simulation
            </h3>
            <ol className="list-decimal pl-5 space-y-1">
              <li>
                Observe green dots moving along actual roads and sidewalks
              </li>
              <li>
                Note areas with longer travel times and food desert zones
                (darker red)
              </li>
              <li>
                Drag new grocery store icons onto the map to test solutions
              </li>
              <li>Watch how travel patterns change with new stores</li>
              <li>Review updated metrics to analyze impact</li>
              <li>Zoom in for the awesome 3D views!!!</li>
            </ol>
          </div>
        </div>
      )}
    </>
  );
}

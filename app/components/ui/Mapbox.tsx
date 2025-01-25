"use client";
import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { SimulationLayer } from "./SimulationLayer";

// Add interface for grocery store properties
interface GroceryStoreProperties {
  STORENAME: string;
  ADDRESS: string;
  ZIPCODE: number;
  PHONE: number | null;
  WARD: string;
  NOTES: string | null;
  PRESENT24: string;
}

interface MapboxProps {
  mapboxToken: string;
}

export function Mapbox({ mapboxToken }: MapboxProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [lng] = useState(-77.0369);
  const [lat] = useState(38.9072);
  const [zoom] = useState(12);
  const [weatherType, setWeatherType] = useState<"clear" | "rain" | "snow">(
    "clear"
  );
  const [mapLoaded, setMapLoaded] = useState(false);

  // Weather effect functions
  const addRainEffect = (map: mapboxgl.Map) => {
    map.setFog({
      range: [0.5, 10],
      color: "rgb(186, 210, 235)",
      "high-color": "rgb(36, 92, 223)",
      "horizon-blend": 0.1,
      "space-color": "rgb(11, 11, 25)",
      "star-intensity": 0,
    });

    map.setPaintProperty("sky", "sky-type", "gradient");
    map.setPaintProperty("sky", "sky-gradient", [
      "interpolate",
      ["linear"],
      ["sky-radial-progress"],
      0.8,
      "rgba(37, 45, 58, 1)",
      1,
      "rgba(87, 95, 108, 1)",
    ]);
  };

  const addSnowEffect = (map: mapboxgl.Map) => {
    map.setFog({
      range: [0.5, 7],
      color: "rgb(255, 255, 255)",
      "high-color": "rgb(255, 255, 255)",
      "horizon-blend": 0.3,
      "space-color": "rgb(200, 200, 210)",
      "star-intensity": 0,
    });

    map.setPaintProperty("sky", "sky-type", "gradient");
    map.setPaintProperty("sky", "sky-gradient", [
      "interpolate",
      ["linear"],
      ["sky-radial-progress"],
      0.8,
      "rgba(230, 230, 230, 1)",
      1,
      "rgba(200, 200, 200, 1)",
    ]);
  };

  const clearWeather = (map: mapboxgl.Map) => {
    map.setFog({
      color: "rgb(220, 230, 240)",
      "high-color": "rgb(150, 180, 220)",
      "horizon-blend": 0.1,
      "space-color": "rgb(25, 35, 60)",
      "star-intensity": 0.15,
    });

    map.setPaintProperty("sky", "sky-type", "atmosphere");
  };

  useEffect(() => {
    const initializeMap = async () => {
      try {
        mapboxgl.accessToken = mapboxToken;

        if (map.current || !mapContainer.current) return;

        map.current = new mapboxgl.Map({
          container: mapContainer.current,
          style: "mapbox://styles/mapbox/streets-v12",
          center: [lng, lat],
          zoom: zoom,
          //maxBounds: DC_BOUNDS,
        });

        map.current.on("load", () => {
          if (!map.current) return;

          // Hide specific POI layers
          const poiLayersToHide: string[] = [
            "poi-label-4", // Major POI labels
            "poi-label-3", // Medium POI labels
            "poi-label-2", // Minor POI labels
            "poi-label-1", // Smallest POI labels
            "airport-label", // Airport labels
            "settlement-major-label", // City labels
            "settlement-minor-label", // Town labels
            "settlement-subdivision-label", // Neighborhood labels
            "natural-point-label", // Natural feature labels
            "transit-label", // Transit station labels
            "place-label", // Named places
            "water-point-label", // Water feature labels
            "water-line-label", // Water way labels
            "building-label", // Building labels
          ];

          poiLayersToHide.forEach((layerId: string) => {
            if (map.current) {
              // Check if the layer exists before trying to modify it
              if (map.current.getLayer(layerId)) {
                map.current.setLayoutProperty(layerId, "visibility", "none");
              }
            }
          });

          // Add 3D terrain (only once)
          map.current.addSource("mapbox-dem", {
            type: "raster-dem",
            url: "mapbox://mapbox.mapbox-terrain-dem-v1",
            tileSize: 512,
            maxzoom: 14,
          });

          map.current.setTerrain({
            source: "mapbox-dem",
            exaggeration: 1.5,
          });

          // Add 3D buildings
          map.current.addLayer({
            id: "3d-buildings",
            source: "composite",
            "source-layer": "building",
            filter: ["==", "extrude", "true"],
            type: "fill-extrusion",
            minzoom: 12,
            paint: {
              "fill-extrusion-color": [
                "case",
                // Check if the building's coordinates match any grocery store location
                ["boolean", ["feature-state", "isGroceryStore"], false],
                "#4287f5", // Blue color for grocery stores
                // Original color interpolation for other buildings
                [
                  "interpolate",
                  ["linear"],
                  ["get", "height"],
                  0,
                  "#e6e6e6",
                  50,
                  "#c9d1d9",
                  100,
                  "#8b98a5",
                  200,
                  "#6e7c91",
                  300,
                  "#464f5d",
                ],
              ],
              "fill-extrusion-height": [
                "interpolate",
                ["linear"],
                ["zoom"],
                15,
                0,
                15.05,
                ["get", "height"],
              ],
              "fill-extrusion-base": [
                "interpolate",
                ["linear"],
                ["zoom"],
                15,
                0,
                15.05,
                ["get", "min_height"],
              ],
              "fill-extrusion-opacity": 0.8,
            },
          });

          // Load both data sources
          Promise.all([
            fetch("/data/Census_Tracts_in_2020.geojson").then((res) =>
              res.json()
            ),
            fetch("/data/cleaned_census_tracts.csv").then((res) => res.text()),
          ]).then(([geojsonData, csvText]) => {
            // Parse CSV
            const csvRows = csvText.split("\n").slice(1); // Skip header
            const censusData: {
              [key: string]: { total_pop: number; pop_percent: number };
            } = {};

            csvRows.forEach((row) => {
              const columns = row.split(",");
              if (columns.length < 3) return;

              const geoid = columns[2];
              censusData[geoid] = {
                total_pop: parseInt(columns[4]),
                pop_percent: parseFloat(columns[3]),
              };
            });

            // Join data
            geojsonData.features = geojsonData.features.map(
              (feature: GeoJSON.Feature) => {
                const geoid = feature.properties?.GEOID;
                if (censusData[geoid]) {
                  feature.properties = {
                    ...feature.properties,
                    ...censusData[geoid],
                  };
                }
                return feature;
              }
            );

            // Add source with joined data
            if (!map.current) return;

            map.current.addSource("neighborhood-data", {
              type: "geojson",
              data: geojsonData,
            });

            // Add two layers: one for hover interaction (invisible fill) and one for borders
            map.current.addLayer({
              id: "neighborhood-fills",
              type: "fill",
              source: "neighborhood-data",
              paint: {
                "fill-color": "#627BC1",
                "fill-opacity": 0,
                "fill-outline-color": "#627BC1",
              },
              filter: ["!=", ["get", "TRACT"], ""],
            });

            // Add a separate layer for visible boundaries
            map.current.addLayer({
              id: "neighborhood-borders",
              type: "line",
              source: "neighborhood-data",
              paint: {
                "line-color": "#627BC1",
                "line-width": 1,
                "line-opacity": 0.8,
              },
              filter: ["!=", ["get", "TRACT"], ""],
            });

            // Updated weather controls with active state
            const weatherControls = document.createElement("div");
            weatherControls.className = "absolute top-4 right-4 flex gap-2";

            const createButton = (
              text: string,
              type: "clear" | "rain" | "snow"
            ) => {
              const button = document.createElement("button");
              button.className = `px-4 py-2 rounded-lg shadow-lg transition-colors ${
                weatherType === type
                  ? "bg-blue-500 text-white hover:bg-blue-600"
                  : "bg-white hover:bg-gray-100"
              }`;
              button.textContent = text;
              button.onclick = () => {
                if (!map.current) return;
                setWeatherType(type);
                switch (type) {
                  case "rain":
                    addRainEffect(map.current);
                    break;
                  case "snow":
                    addSnowEffect(map.current);
                    break;
                  case "clear":
                    clearWeather(map.current);
                    break;
                }

                // Update all buttons' styles
                weatherControls.querySelectorAll("button").forEach((btn) => {
                  if (btn.textContent === text) {
                    btn.className =
                      "px-4 py-2 rounded-lg shadow-lg bg-blue-500 text-white hover:bg-blue-600";
                  } else {
                    btn.className =
                      "px-4 py-2 rounded-lg shadow-lg bg-white hover:bg-gray-100";
                  }
                });
              };
              return button;
            };

            weatherControls.appendChild(createButton("Clear", "clear"));
            weatherControls.appendChild(createButton("Rain", "rain"));
            weatherControls.appendChild(createButton("Snow", "snow"));

            mapContainer.current?.appendChild(weatherControls);

            // Add food access areas source
            map.current.addSource("food-access", {
              type: "geojson",
              data: "/data/Low_Food_Access_Areas.geojson",
            });

            // Add food access areas layer
            map.current.addLayer({
              id: "food-access-areas",
              type: "fill",
              source: "food-access",
              paint: {
                "fill-color": [
                  "interpolate",
                  ["linear"],
                  ["get", "PERCENTUND185"],
                  0,
                  "#fee5d9",
                  0.3,
                  "#fcae91",
                  0.5,
                  "#fb6a4a",
                  0.7,
                  "#de2d26",
                  1,
                  "#a50f15",
                ],
                "fill-opacity": 0.7,
                "fill-outline-color": "#000000",
              },
            });

            // Update hover event
            map.current.on(
              "mousemove",
              "neighborhood-fills",
              (
                e: mapboxgl.MapMouseEvent & {
                  features?: mapboxgl.MapboxGeoJSONFeature[];
                }
              ) => {
                if (!e.features?.length || !map.current) return;

                // Remove existing popups
                const existingPopups =
                  document.getElementsByClassName("census-tract-popup");
                while (existingPopups[0]) {
                  existingPopups[0].remove();
                }

                const feature = e.features[0];
                if (!feature.properties) return;

                const totalPop = feature.properties.total_pop || 0;
                const popPercent = feature.properties.pop_percent
                  ? (feature.properties.pop_percent * 100).toFixed(2)
                  : "0.00";

                // Create new popup
                new mapboxgl.Popup({
                  closeButton: false,
                  closeOnClick: false,
                  className: "census-tract-popup",
                })
                  .setLngLat(e.lngLat)
                  .setHTML(
                    `<div class="text-sm">
                      <p>Total Population: ${totalPop.toLocaleString()}</p>
                      <p>Population %: ${popPercent}%</p>
                    </div>`
                  )
                  .addTo(map.current);
              }
            );

            map.current.on("mouseleave", "neighborhood-fills", () => {
              if (map.current) {
                const popups =
                  document.getElementsByClassName("census-tract-popup");
                while (popups[0]) {
                  popups[0].remove();
                }
              }
            });

            // Change cursor to pointer when hovering over tracts
            map.current.on("mouseenter", "neighborhood-fills", () => {
              if (map.current) {
                map.current.getCanvas().style.cursor = "pointer";
              }
            });

            // Add legend
            const legend = document.createElement("div");
            legend.className = "legend";
            legend.innerHTML = `
              <h4>Food Insecurity</h4>
              <div><span style="background: #fee5d9"></span>0-30%</div>
              <div><span style="background: #fcae91"></span>30-50%</div>
              <div><span style="background: #fb6a4a"></span>50-70%</div>
              <div><span style="background: #de2d26"></span>70-100%</div>
            `;
            map.current.getContainer().appendChild(legend);

            // Add grocery stores source
            map.current.addSource("grocery-stores", {
              type: "geojson",
              data: "/data/Grocery_Store_Locations.geojson",
            });

            // Add grocery stores layer as circles instead of icons
            map.current.addLayer({
              id: "grocery-stores",
              type: "circle",
              source: "grocery-stores",
              paint: {
                "circle-radius": 8,
                "circle-color": "#4287f5",
                "circle-opacity": 0.8,
                "circle-stroke-width": 2,
                "circle-stroke-color": "#ffffff",
              },
              filter: ["==", "PRESENT24", "Yes"],
            });

            // Add popup for grocery stores
            map.current.on("click", "grocery-stores", (e) => {
              if (!map.current || !e.features?.length) return;

              const feature = e.features[0];
              const props = feature.properties as GroceryStoreProperties;
              const coordinates = (
                feature.geometry as GeoJSON.Point
              ).coordinates.slice();

              const description = `
                <div class="p-2">
                  <h3 class="font-bold text-lg mb-2">${props.STORENAME}</h3>
                  <p class="mb-1">${props.ADDRESS}</p>
                  <p class="mb-1">${props.WARD}</p>
                  ${props.PHONE ? `<p class="mb-1">📞 ${props.PHONE}</p>` : ""}
                  ${
                    props.NOTES
                      ? `<p class="text-sm italic">${props.NOTES}</p>`
                      : ""
                  }
                </div>
              `;

              new mapboxgl.Popup()
                .setLngLat(coordinates as [number, number])
                .setHTML(description)
                .addTo(map.current!);
            });

            // Change cursor on hover
            map.current.on("mouseenter", "grocery-stores", () => {
              if (map.current) {
                map.current.getCanvas().style.cursor = "pointer";
              }
            });

            map.current.on("mouseleave", "grocery-stores", () => {
              if (map.current) {
                map.current.getCanvas().style.cursor = "";
              }
            });

            // After loading grocery stores data, set feature state for matching buildings
            map.current.on("sourcedata", (e) => {
              if (
                e.sourceId === "grocery-stores" &&
                e.isSourceLoaded &&
                map.current
              ) {
                const groceryStores =
                  map.current.querySourceFeatures("grocery-stores");

                groceryStores.forEach((store) => {
                  const storeCoords = (store.geometry as GeoJSON.Point)
                    .coordinates;

                  // Query buildings at the grocery store location
                  const buildings = map.current?.queryRenderedFeatures(
                    map.current.project([storeCoords[0], storeCoords[1]]),
                    { layers: ["3d-buildings"] }
                  );

                  // Set feature state for the closest building
                  if (buildings && buildings.length > 0 && buildings[0].id) {
                    map.current?.setFeatureState(
                      {
                        source: "composite",
                        sourceLayer: "building",
                        id: buildings[0].id,
                      },
                      { isGroceryStore: true }
                    );
                  }
                });
              }
            });

            console.log("Map loaded, adding simulation layer");
            setMapLoaded(true);
          });
        });
      } catch (error) {
        console.error("Error initializing map:", error);
      }
    };

    initializeMap();

    return () => {
      if (map.current) map.current.remove();
    };
  }, [lng, lat, zoom, weatherType, mapboxToken]);

  return (
    <div className="relative h-full w-full">
      <div ref={mapContainer} className="h-full w-full" />
      {mapLoaded && map.current && (
        <SimulationLayer key="simulation-layer" map={map.current} />
      )}
    </div>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

// Define the type for our GeoJSON feature properties
interface NeighborhoodProperties {
  NAME: string;
  NBH_NAMES: string;
  // Add other specific properties you need from your GeoJSON
  OBJECTID?: number;
  Shape_Area?: number;
  Shape_Length?: number;
  [key: string]: string | number | undefined; // for any remaining string or number properties
}

// Add interface for food access properties
interface FoodAccessProperties {
  PARTPOP2: number;
  PRTOVR185: number;
  PRTUND185: number;
  PERCENTUND185: number;
  GIS_ID: string;
  GLOBALID: string;
  OBJECTID: number;
}

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

export default function MapboxMap() {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [lng] = useState(-77.0369);
  const [lat] = useState(38.9072);
  const [zoom] = useState(12);
  const [weatherType, setWeatherType] = useState<"clear" | "rain" | "snow">(
    "clear"
  );

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
        const response = await fetch("/api/mapbox-token");
        const { token } = await response.json();
        mapboxgl.accessToken = token;

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

          // Add the GeoJSON source
          map.current.addSource("neighborhoods", {
            type: "geojson",
            data: "/data/Neighborhood_Clusters.geojson",
          });

          // Add neighborhood boundaries
          map.current.addLayer({
            id: "neighborhood-borders",
            type: "line",
            source: "neighborhoods",
            layout: {},
            paint: {
              "line-color": "#4264fb",
              "line-width": 2,
              "line-opacity": 0.8,
            },
          });

          // Add neighborhood fills
          map.current.addLayer({
            id: "neighborhood-fills",
            type: "fill",
            source: "neighborhoods",
            layout: {},
            paint: {
              "fill-color": [
                "match",
                ["get", "NAME"],
                [
                  "Cluster 44",
                  "Cluster 39",
                  "Cluster 43",
                  "Cluster 37",
                  "Cluster 38",
                  "Cluster 36",
                  "Cluster 28",
                  "Cluster 34",
                  "Cluster 35",
                  "Cluster 32",
                  "Cluster 30",
                  "Cluster 33",
                  "Cluster 29",
                  "Cluster 31",
                ],
                "red",
                "rgba(0, 0, 0, 0.1)", // Default color
              ],
              "fill-opacity": 0.5,
            },
          });

          // Enhanced atmosphere effect
          map.current.setFog({
            color: "rgb(220, 230, 240)", // Lighter lower atmosphere
            "high-color": "rgb(150, 180, 220)", // Softer upper atmosphere
            "horizon-blend": 0.1,
            "space-color": "rgb(25, 35, 60)",
            "star-intensity": 0.15,
          });

          // Add hover effect
          map.current.on("mouseenter", "neighborhood-fills", () => {
            if (!map.current) return;
            map.current.getCanvas().style.cursor = "pointer";

            // Highlight hovered neighborhood
            map.current.setPaintProperty("neighborhood-fills", "fill-opacity", [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              0.4,
              0.2,
            ]);
          });

          map.current.on("mouseleave", "neighborhood-fills", () => {
            if (!map.current) return;
            map.current.getCanvas().style.cursor = "";
            map.current.setPaintProperty(
              "neighborhood-fills",
              "fill-opacity",
              0.2
            );
          });

          // Add popup on click
          map.current.on(
            "click",
            "neighborhood-fills",
            (
              e: mapboxgl.MapMouseEvent & {
                features?: mapboxgl.MapboxGeoJSONFeature[];
              }
            ) => {
              if (!map.current || !e.features?.length) return;

              const feature = e.features[0] as mapboxgl.MapboxGeoJSONFeature & {
                properties: NeighborhoodProperties;
              };

              if (!feature.properties) return;

              new mapboxgl.Popup()
                .setLngLat(e.lngLat)
                .setHTML(
                  `
                <h3 style="font-weight: bold; margin-bottom: 5px;">${
                  feature.properties.NAME || "Unknown"
                }</h3>
                <p>${
                  feature.properties.NBH_NAMES || "No neighborhoods listed"
                }</p>
              `
                )
                .addTo(map.current);
            }
          );

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

          // Add hover effect
          const popup = new mapboxgl.Popup({
            closeButton: false,
            closeOnClick: false,
          });

          map.current.on("mousemove", "food-access-areas", (e) => {
            if (e.features && e.features.length > 0 && map.current) {
              const feature = e.features[0];
              const properties = feature.properties as FoodAccessProperties;

              const description = `
                <strong>Food Access Area</strong><br>
                Total Population: ${properties.PARTPOP2}<br>
                Population Under 185% Poverty: ${properties.PRTUND185}<br>
                Percentage Under 185% Poverty: ${(
                  properties.PERCENTUND185 * 100
                ).toFixed(1)}%
              `;

              popup.setLngLat(e.lngLat).setHTML(description).addTo(map.current);
            }
          });

          map.current.on("mouseleave", "food-access-areas", () => {
            popup.remove();
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

          // Add grocery stores layer
          map.current.addLayer({
            id: "grocery-stores",
            type: "symbol",
            source: "grocery-stores",
            layout: {
              "icon-image": "grocery",
              "icon-size": 0.75,
              "icon-allow-overlap": true,
              "text-field": ["get", "STORENAME"],
              "text-offset": [0, 1.5],
              "text-anchor": "top",
              "text-size": 12,
            },
            paint: {
              "text-color": "#ffffff",
              "text-halo-color": "#000000",
              "text-halo-width": 1,
            },
            filter: ["==", "PRESENT24", "Yes"], // Only show currently operating stores
          });

          // Load custom grocery store icon
          map.current.loadImage(
            "/grocery-icon.png", // You'll need to add this icon to your public folder
            (error, image) => {
              if (error) throw error;
              if (image && map.current && !map.current.hasImage("grocery")) {
                map.current.addImage("grocery", image);
              }
            }
          );

          // Add popup for grocery stores
          map.current.on(
            "click",
            "grocery-stores",
            (
              e: mapboxgl.MapMouseEvent & {
                features?: mapboxgl.MapboxGeoJSONFeature[];
              }
            ) => {
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
                .addTo(map.current);
            }
          );

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
        });
      } catch (error) {
        console.error("Error initializing map:", error);
      }
    };

    initializeMap();

    return () => {
      if (map.current) map.current.remove();
    };
  }, [lng, lat, zoom, weatherType]);

  return (
    <div className="relative h-full w-full">
      <div ref={mapContainer} className="h-full w-full" />
    </div>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { SimulationLayer } from "./SimulationLayer";

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

interface CustomWindow extends Window {
  reloadAndReroute?: () => Promise<void>;
}

export function Mapbox({ mapboxToken }: MapboxProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [lng] = useState(-77.0369);
  const [lat] = useState(38.9072);
  const [zoom] = useState(12);
  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => {
    const initializeMap = async () => {
      try {
        // Clear stores collection on load
        await fetch("/api/clear-stores", { method: "POST" });

        mapboxgl.accessToken = mapboxToken;

        if (map.current || !mapContainer.current) return;

        // Create the Mapbox map
        map.current = new mapboxgl.Map({
          container: mapContainer.current,
          style: "mapbox://styles/mapbox/streets-v12",
          center: [lng, lat],
          zoom: zoom,
        });

        map.current.on("load", () => {
          if (!map.current) return;

          // Hide extraneous POI layers
          const poiLayersToHide: string[] = [
            "poi-label-4",
            "poi-label-3",
            "poi-label-2",
            "poi-label-1",
            "airport-label",
            "settlement-major-label",
            "settlement-minor-label",
            "settlement-subdivision-label",
            "natural-point-label",
            "transit-label",
            "place-label",
            "water-point-label",
            "water-line-label",
            "building-label",
          ];
          poiLayersToHide.forEach((layerId: string) => {
            if (map.current?.getLayer(layerId)) {
              map.current?.setLayoutProperty(layerId, "visibility", "none");
            }
          });

          // Add 3D terrain
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

          // Fetch geojson data + CSV for tract data
          Promise.all([
            fetch("/data/Census_Tracts_in_2020.geojson").then((res) =>
              res.json()
            ),
            fetch("/data/cleaned_census_tracts.csv").then((res) => res.text()),
          ]).then(([geojsonData, csvText]) => {
            // Parse CSV
            const csvRows = csvText.split("\n").slice(1); // skip header row

            const censusData: {
              [key: string]: {
                total_pop: number;
                pop_percent: number;
                white_percent: number;
                black_percent: number;
                hispanic_percent: number;
              };
            } = {};

            csvRows.forEach((row) => {
              const columns = row.split(",");
              if (columns.length < 5) return;

              const geoid = columns[2];
              censusData[geoid] = {
                total_pop: parseInt(columns[4]),
                pop_percent: parseFloat(columns[3]),
                white_percent: parseFloat(columns[21]),
                black_percent: parseFloat(columns[22]),
                hispanic_percent: parseFloat(columns[23]),
              };
            });

            // Merge CSV data into GeoJSON
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

            // Add source for neighborhoods with joined data
            if (!map.current) return;

            map.current.addSource("neighborhood-data", {
              type: "geojson",
              data: geojsonData,
            });

            // Invisible fill layer for hover / click
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

            // A separate line layer for visible boundaries
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

            // Low food access areas
            map.current.addSource("food-access", {
              type: "geojson",
              data: "/data/Low_Food_Access_Areas.geojson",
            });

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

            // Neighborhood hover popups
            map.current.on(
              "mousemove",
              "neighborhood-fills",
              (
                e: mapboxgl.MapMouseEvent & {
                  features?: mapboxgl.MapboxGeoJSONFeature[];
                }
              ) => {
                if (!e.features?.length || !map.current) return;

                // Clear old popups
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

                // New popup
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
                      <p>White %: ${(
                        feature.properties.white_percent * 100
                      ).toFixed(2)}%</p>
                      <p>African American %: ${(
                        feature.properties.black_percent * 100
                      ).toFixed(2)}%</p>
                      <p>Hispanic %: ${(
                        feature.properties.hispanic_percent * 100
                      ).toFixed(2)}%</p>
                    </div>`
                  )
                  .addTo(map.current);
              }
            );

            map.current.on("mouseleave", "neighborhood-fills", () => {
              if (!map.current) return;
              const popups =
                document.getElementsByClassName("census-tract-popup");
              while (popups[0]) {
                popups[0].remove();
              }
            });

            map.current.on("mouseenter", "neighborhood-fills", () => {
              if (!map.current) return;
              map.current.getCanvas().style.cursor = "pointer";
            });

            // Legend
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

            // Grocery stores
            map.current.addSource("grocery-stores", {
              type: "geojson",
              data: "/data/Grocery_Store_Locations.geojson",
            });

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

            // Grocery store popup
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
                .addTo(map.current);
            });

            map.current.on("mouseenter", "grocery-stores", () => {
              if (!map.current) return;
              map.current.getCanvas().style.cursor = "pointer";
            });

            map.current.on("mouseleave", "grocery-stores", () => {
              if (!map.current) return;
              map.current.getCanvas().style.cursor = "";
            });

            console.log("Map loaded, adding simulation layer");
            setMapLoaded(true);
          });

          // DRAG AND DROP handlers for adding new grocery stores
          const handleDragOver = (e: DragEvent) => {
            e.preventDefault();
          };

          const handleDrop = async (e: DragEvent) => {
            e.preventDefault();
            const currentMap = map.current;
            if (!currentMap) return;

            const point = currentMap.unproject([e.clientX, e.clientY]);

            try {
              // Save to MongoDB
              await fetch("/api/save-coordinates", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  coordinates: [point.lat, point.lng],
                }),
              });

              // Update map visualization
              const source = currentMap.getSource(
                "grocery-stores"
              ) as mapboxgl.GeoJSONSource;
              if (!source) return;

              let currentData: GeoJSON.FeatureCollection;
              if (typeof source._data === "string") {
                const response = await fetch(source._data);
                currentData = await response.json();
              } else {
                currentData = source._data as GeoJSON.FeatureCollection;
              }

              if (!currentData.features) {
                currentData.features = [];
              }

              const newFeature: GeoJSON.Feature = {
                type: "Feature",
                geometry: {
                  type: "Point",
                  coordinates: [point.lng, point.lat],
                },
                properties: {
                  PRESENT24: "Yes",
                  STORENAME: "New Store",
                  ADDRESS: "Added via Drag & Drop",
                  //ZIPCODE: 20001,
                  PHONE: null,
                  WARD: "",
                  NOTES: "Custom store",
                },
              };

              currentData.features.push(newFeature);
              source.setData(currentData);

              // Call reloadAndReroute directly
              if ((window as CustomWindow).reloadAndReroute) {
                await (window as CustomWindow).reloadAndReroute!();
                console.log("Rerouting triggered");
              } else {
                console.log("Reroute function not found");
              }
            } catch (error) {
              console.error("Error handling drop:", error);
            }
          };

          // Add event listeners
          const canvas = map.current.getCanvas();
          canvas.addEventListener("dragover", handleDragOver);
          canvas.addEventListener("drop", handleDrop);
        });
      } catch (error) {
        console.error("Error initializing map:", error);
      }
    };

    initializeMap();

    // Cleanup on unmount
    return () => {
      if (map.current) {
        const canvas = map.current.getCanvas();
        canvas.removeEventListener("dragover", () => {});
        canvas.removeEventListener("drop", () => {});
        map.current.remove();
      }
    };
  }, [lng, lat, zoom, mapboxToken]);

  return (
    <div className="relative h-full w-full">
      <div ref={mapContainer} className="h-full w-full" />
      {mapLoaded && map.current && (
        <SimulationLayer key="simulation-layer" map={map.current} />
      )}
    </div>
  );
}

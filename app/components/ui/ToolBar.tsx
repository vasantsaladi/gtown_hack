"use client";
import React from "react";
import { ChevronLeft, ChevronRight, Store } from "lucide-react";

export function ToolBar() {
  const [isCollapsed, setIsCollapsed] = React.useState(false);

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("grocery-store", "true");

    // Create custom drag image
    const dragImage = document.createElement("div");
    dragImage.style.cssText = `
      width: 24px;
      height: 24px;
      background-color: #4287f5;
      border-radius: 50%;
      border: 2px solid white;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    `;
    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, 12, 12);
    setTimeout(() => document.body.removeChild(dragImage), 0);
  };

  return (
    <div
      className={`fixed right-2 top-2 bg-white rounded-lg shadow-lg p-2 ${
        isCollapsed ? "w-10" : "w-64"
      }`}
    >
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute right-2 top-2 p-1 hover:bg-gray-100 rounded-md"
      >
        {isCollapsed ? <ChevronLeft /> : <ChevronRight />}
      </button>

      {!isCollapsed && (
        <>
          <div className="mt-8 space-y-2">
            <div
              draggable
              onDragStart={handleDragStart}
              className="flex items-center gap-3 p-2 hover:bg-gray-100 rounded-md cursor-grab active:cursor-grabbing"
            >
              <Store className="text-blue-500" />
              <span className="text-sm">Drag + Drop a Grocery Store</span>
            </div>
          </div>

          {/* Legend */}
          <div className="mt-4 p-2 border-t border-gray-200">
            <h3 className="text-sm font-semibold mb-2">Legend</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-blue-500"></div>
                <span className="text-xs">Grocery Store</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-green-500"></div>
                <span className="text-xs">Person</span>
              </div>

              {/* Food Desert Analysis */}
              <div className="mt-4">
                <h4 className="text-xs font-semibold mb-1">
                  Food Desert Analysis
                </h4>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-[#fee5d9]"></div>
                    <span className="text-xs">0-30%: Minimal Issues</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-[#fcae91]"></div>
                    <span className="text-xs">30-50%: Emerging</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-[#fb6a4a]"></div>
                    <span className="text-xs">50-70%: Significant</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-[#a50f15]"></div>
                    <span className="text-xs">70-100%: Severe</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

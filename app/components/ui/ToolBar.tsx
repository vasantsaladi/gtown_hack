'use client';

import React from 'react';
import { 
  Menu,
  Bookmark,
  Clock,
  UserSquare,
  Share2,
  LineChart,
  Shield,
  Link,
  Printer,
  Plus,
  Building2,
  PenSquare,
  HelpCircle,
  Settings,
  Activity,
  Languages,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { LucideIcon } from 'lucide-react';

interface ToolBarProps {
  onToggleSidebar?: () => void;
}

// Internal button component
const Button = ({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick?: () => void }) => (
  <button
    onClick={onClick}
    className="flex items-center gap-3 px-3 py-2 w-full text-left hover:bg-gray-100 rounded-md transition-colors"
  >
    <Icon className="w-5 h-5 text-gray-600" />
    <span className="text-sm">{label}</span>
  </button>
);

export function ToolBar({ onToggleSidebar }: ToolBarProps) {
  const [isCollapsed, setIsCollapsed] = React.useState(false);

  return (
    <div className={`fixed right-2 top-2 bottom-2 bg-white rounded-lg shadow-lg p-2 transition-all duration-300 ${
      isCollapsed ? 'w-[50px]' : 'w-[300px]'
    } overflow-y-auto`}>
      <div className="flex flex-col gap-2">
        {/* Collapse toggle button */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute right-2 top-2 p-1 hover:bg-gray-100 rounded-md transition-colors"
          aria-label={isCollapsed ? "Expand toolbar" : "Collapse toolbar"}
        >
          {isCollapsed ? (
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          ) : (
            <ChevronRight className="w-5 h-5 text-gray-600" />
          )}
        </button>

        {/* Content container with conditional rendering */}
        <div className={`${isCollapsed ? 'hidden' : 'block'} mt-8`}>
          {/* Header with toggle */}
          <div className="flex items-center justify-between border-b pb-2">
            <Button icon={Menu} onClick={onToggleSidebar} label="Show side bar" />
          </div>

          {/* Main navigation items */}
          <div className="flex flex-col gap-1">
            <Button icon={Bookmark} label="Saved" />
            <Button icon={Clock} label="Recents" />
            <Button icon={UserSquare} label="Your contributions" />
            <Button icon={Share2} label="Location sharing" />
            <Button icon={LineChart} label="Your timeline" />
            <Button icon={Shield} label="Your data in Maps" />
          </div>

          {/* Sharing and printing section */}
          <div className="border-t pt-2 flex flex-col gap-1">
            <Button icon={Link} label="Share or embed map" />
            <Button icon={Printer} label="Print" />
          </div>

          {/* Map editing section */}
          <div className="border-t pt-2 flex flex-col gap-1">
            <Button icon={Plus} label="Add a missing place" />
            <Button icon={Building2} label="Add your business" />
            <Button icon={PenSquare} label="Edit the map" />
          </div>

          {/* Help and settings section */}
          <div className="border-t pt-2 flex flex-col gap-1">
            <Button icon={HelpCircle} label="Tips and tricks" />
            <Button icon={HelpCircle} label="Get help" />
            <div className="text-sm text-gray-600 px-3 py-2">Consumer information</div>
          </div>

          {/* Footer section */}
          <div className="border-t pt-2 flex flex-col gap-1">
            <Button icon={Languages} label="Language" />
            <Button icon={Settings} label="Search settings" />
            <Button icon={Activity} label="Maps activity" />
          </div>
        </div>
      </div>
    </div>
  );
}
